import "server-only";
import { z } from "zod";
import type { Actor } from "../../domain/access";
import type { CanonicalAssetInput, CanonicalizedAssetRow } from "../../domain/asset-import/types";
import { prepareComparablePool, type ComparableAsset } from "../../domain/asset-import/comparables";
import { resolveAssetValuation } from "../../domain/asset-import/valuation";
import { validateAssetRow } from "../../domain/asset-import/validate-row";
import { normalizeAssetText } from "../../domain/asset-import/useful-life";
import { hashSchema, importSummarySchema, type ImportResponse } from "../../domain/asset-import/schemas";
import { readNodeAssetWorkbook as readAssetWorkbook } from "./read-node-workbook";
import { compareAssetVersions } from "./compare-asset-versions";
import type { UsefulLifeRule, UsefulLifeAlias } from "../../reference/useful-life-perdir-0299";
import type { ImportDependencies, Row } from "./dependencies";
import { ownedImport, assertEditable, verifiedBytes, confirmedMapping, ImportError, sha256, asJson, loadAssetImport } from "./service";

/** PostgreSQL jsonb sorts keys by UTF-8 byte length, then byte value, and expands exponents. */
export function postgresJsonb(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ImportError("PROCESS_FAILED");
    const text = JSON.stringify(value);
    if (!/[eE]/.test(text)) return text;
    const [coefficient, exponent] = text.toLowerCase().split("e"), negative = coefficient.startsWith("-");
    const unsigned = coefficient.replace("-", ""), [whole, fraction = ""] = unsigned.split("."), digits = whole + fraction, position = whole.length + Number(exponent);
    return (negative ? "-" : "") + (position <= 0 ? "0." + "0".repeat(-position) + digits : position >= digits.length ? digits + "0".repeat(position - digits.length) : digits.slice(0, position) + "." + digits.slice(position));
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(postgresJsonb).join(", ") + "]";
  if (!value || typeof value !== "object") throw new ImportError("PROCESS_FAILED");
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b))).map((key) => JSON.stringify(key) + ": " + postgresJsonb(record[key])).join(", ") + "}";
}
export function persistedRecordHashes(rows: readonly Record<string, unknown>[], valuations: readonly Record<string, unknown>[]) {
  const digest = (records: readonly Record<string, unknown>[], excluded: string[]) => sha256(records.map((record) => sha256(postgresJsonb(Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.includes(key)))))).join(""));
  const orderedRows = [...rows].sort((a, b) => String(a.import_sheet_id).localeCompare(String(b.import_sheet_id)) || Number(a.source_row_number) - Number(b.source_row_number));
  const orderedValues = [...valuations].sort((a, b) => String(a.asset_row_id).localeCompare(String(b.asset_row_id)));
  return { rowsHash: digest(orderedRows, ["created_at"]), valuationsHash: digest(orderedValues, ["created_at", "approved_by", "approved_at", "approval_notes"]) };
}
const columnPairs = {
  unitInduk: "unit_induk", upt: "upt", namaGi: "nama_gi", bayPenghantar: "bay_penghantar", tid: "tid", noAset: "no_aset", namaPeralatan: "nama_peralatan", spesifikasiMara: "spesifikasi_mara", jumlah: "jumlah", satuan: "satuan", kondisiAset: "kondisi_aset", tanggalOperasi: "tanggal_operasi", usiaAsetTahun: "usia_aset_tahun", kodeClassAsset: "kode_class_asset", kodeJenis: "kode_jenis", kodeSubjenis: "kode_subjenis", nilaiBukuSap: "nilai_buku_sap", hargaPengadaanSaatIni: "harga_pengadaan_saat_ini", tanggalReferensiHarga: "tanggal_referensi_harga", nilaiAbcInput: "nilai_abc_input", kodeMaterial: "kode_material", keterangan: "keterangan",
} as const satisfies Record<keyof CanonicalAssetInput, keyof Row<"asset_snapshot_rows">>;
function storedAsset(row: Row<"asset_snapshot_rows">): ComparableAsset {
  return { ...Object.fromEntries(Object.entries(columnPairs).map(([field, column]) => [field, row[column]])) as unknown as CanonicalAssetInput, id: row.id };
}
async function insertInWindows<T extends "asset_snapshot_rows" | "asset_valuations">(table: T, records: Row<T>[], deps: ImportDependencies) {
  const batches = Array.from({ length: Math.ceil(records.length / 1000) }, (_, index) => records.slice(index * 1000, (index + 1) * 1000));
  for (let index = 0; index < batches.length; index += 8) {
    await Promise.all(batches.slice(index, index + 8).map((batch) => deps.insertBatch(table, batch)));
  }
}
export function summarize(rows: readonly Row<"asset_snapshot_rows">[], values: readonly Row<"asset_valuations">[]) {
  const summary = { rowCount: rows.length, blockingErrors: 0, warningCount: 0, valueSources: {} as Record<string, number>, conditions: {} as Record<string, number>, issueCounts: {} as Record<string, number>, totalNilaiABC: 0 };
  const increment = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };
  for (const row of rows) {
    summary.blockingErrors += row.error_codes.length; summary.warningCount += row.warning_codes.length;
    increment(summary.conditions, row.kondisi_aset ?? "MISSING");
    for (const code of [...row.error_codes, ...row.warning_codes]) increment(summary.issueCounts, code);
  }
  for (const value of values) { increment(summary.valueSources, value.value_source); summary.totalNilaiABC += value.nilai_abc ?? 0; }
  return importSummarySchema.parse(summary);
}
async function referenceContext(deps: ImportDependencies, ruleVersion: string, asOf: string) {
  const ruleRows = (await deps.list("useful_life_rules", { rule_version: ruleVersion })).filter((rule) => rule.effective_from <= asOf && (!rule.effective_to || asOf < rule.effective_to));
  if (!ruleRows.length) throw new ImportError("REFERENCE_UNAVAILABLE");
  const rules: UsefulLifeRule[] = ruleRows.map((rule) => ({ id: rule.id, ruleVersion: rule.rule_version, assetFunction: rule.function_code, classCode: rule.class_code, typeCode: rule.type_code, subtypeCode: rule.subtype_code || null, years: rule.useful_life_years, effectiveFrom: rule.effective_from, effectiveTo: rule.effective_to, description: rule.source_locator, sourceDocument: rule.source_document, sourceLocator: rule.source_locator, verifiedBy: rule.source_hash, approval: "SOURCE_VERIFIED" }));
  const aliases: UsefulLifeAlias[] = (await deps.list("asset_class_mappings", {})).filter((entry) => ruleRows.some((rule) => rule.id === entry.useful_life_rule_id) && entry.effective_from <= asOf && (!entry.effective_to || asOf < entry.effective_to)).map((entry) => ({ alias: entry.alias_key, ruleIds: [entry.useful_life_rule_id], approvedBy: entry.approved_by, approvedAt: entry.approved_at.slice(0, 10), evidence: entry.approval_evidence }));
  const coordinates = await deps.list("gi_location_references", {});
  const coordinateKey = (unit: string | null, upt: string | null, gi: string | null) => JSON.stringify([unit, upt, gi].map(normalizeAssetText));
  const coordinateIndex = new Map(coordinates.map(entry => [coordinateKey(entry.unit_induk_key, entry.upt_key, entry.nama_gi_key), entry]));
  const coordinateFor = (asset: ComparableAsset) => {
    const found = coordinateIndex.get(coordinateKey(asset.unitInduk, asset.upt, asset.namaGi));
    return found ? { latitude: found.latitude, longitude: found.longitude } : null;
  };
  const donors: ComparableAsset[] = [];
  for (const dataset of await deps.list("datasets", { type: "ASSET" })) {
    if (!dataset.active_version_id) continue;
    const session = (await deps.list("import_sessions", { dataset_version_id: dataset.active_version_id, unit_induk_id: dataset.unit_induk_id }))[0];
    if (!session?.current_run_id) continue;
    const run = (await deps.list("asset_import_runs", { id: session.current_run_id, status: "COMPLETE" }))[0];
    if (!run) continue;
    for (const row of await deps.list("asset_snapshot_rows", { import_run_id: run.id, unit_induk_id: dataset.unit_induk_id })) { const asset = storedAsset(row); donors.push({ ...asset, coordinates: coordinateFor(asset) }); }
  }
  return { rules, aliases, coordinateFor, donors, coordinateVersions: [...new Set(coordinates.map((entry) => entry.source_version))].sort() };
}
async function persistComparison(actor: Actor, session: Row<"import_sessions">, runId: string, rows: Row<"asset_snapshot_rows">[], values: Row<"asset_valuations">[], deps: ImportDependencies) {
  // Only read active comparison input after successful finalization.
  const dataset = (await deps.list("datasets", { id: session.dataset_id, unit_induk_id: session.unit_induk_id }))[0];
  if (!dataset?.active_version_id) return { baseVersionId: null, comparisonId: null };
  if (dataset.active_version_id === session.dataset_version_id) throw new ImportError("COMPARISON_FAILED");
  const previousSession = (await deps.list("import_sessions", { dataset_version_id: dataset.active_version_id, unit_induk_id: session.unit_induk_id }))[0];
  if (!previousSession?.current_run_id) throw new ImportError("COMPARISON_FAILED");
  const previousRun = (await deps.list("asset_import_runs", { id: previousSession.current_run_id, status: "COMPLETE" }))[0];
  if (!previousRun) throw new ImportError("COMPARISON_FAILED");
  const before = await deps.list("asset_snapshot_rows", { import_run_id: previousRun.id, unit_induk_id: session.unit_induk_id });
  const beforeValues = await deps.list("asset_valuations", { import_run_id: previousRun.id, unit_induk_id: session.unit_induk_id });
  const comparisonId = deps.id();
  const { counts: kinds, changes } = compareAssetVersions({ before, after: rows, beforeValues, afterValues: values }, { comparisonId, unitId: session.unit_induk_id, fields: Object.values(columnPairs) });
  await deps.insert("version_comparisons", [{ id: comparisonId, dataset_id: session.dataset_id, unit_induk_id: session.unit_induk_id, from_version_id: dataset.active_version_id, to_version_id: session.dataset_version_id, from_run_id: previousRun.id, to_run_id: runId, summary: asJson({ counts: kinds, before: summarize(before, beforeValues), after: summarize(rows, values) }), created_by: actor.userId }]);
  for (let offset = 0; offset < changes.length; offset += 1000) await deps.insert("asset_version_changes", changes.slice(offset, offset + 1000));
  return { baseVersionId: dataset.active_version_id, comparisonId };
}
export async function processStoredWorkbook(actor: Actor, importId: string, deps: ImportDependencies): Promise<ImportResponse> {
  const { session, source, version } = await ownedImport(actor, importId, deps); assertEditable(version);
  if ((await deps.list("asset_import_runs", { import_session_id: session.id, status: "PROCESSING" })).length) throw new ImportError("CONFLICT");
  const sheet = (await deps.list("import_sheets", { import_session_id: session.id, unit_induk_id: session.unit_induk_id, selected: true }))[0];
  if (!sheet) throw new ImportError("NOT_READY");
  const mapping = await confirmedMapping(sheet, deps);
  const diagnostics = z.object({ ruleVersion: z.string().min(1), canonicalHash: hashSchema, layoutHash: hashSchema, uploadVerified: hashSchema }).safeParse(sheet.diagnostics);
  if (!diagnostics.success || diagnostics.data.uploadVerified !== source.sha256) throw new ImportError("NOT_READY");
  const bytes = await verifiedBytes(source, deps);
  const parsed = await readAssetWorkbook(bytes, { ruleVersion: diagnostics.data.ruleVersion, confirmedMapping: mapping, collectRows: true, previewLimit: 0, batchSize: 1000 });
  if (parsed.canonicalHash !== diagnostics.data.canonicalHash || parsed.layoutHash !== diagnostics.data.layoutHash || parsed.layoutHash !== sheet.layout_hash) throw new ImportError("PREVIEW_MISMATCH");
  if (!parsed.rows?.length) throw new ImportError("NOT_READY");
  const asOf = deps.now().slice(0, 10), references = await referenceContext(deps, diagnostics.data.ruleVersion, asOf);
  const unit = (await deps.list("unit_induk", { id: session.unit_induk_id }))[0];
  if (!unit) throw new ImportError("REFERENCE_UNAVAILABLE");
  const runId = deps.id(), rowIds = parsed.rows.map(() => deps.id());
  const assets: ComparableAsset[] = parsed.rows.map((row, index) => ({ ...row.asset, id: rowIds[index], provenance: row.provenance, coordinates: references.coordinateFor(row.asset) }));
  const candidates = [...assets, ...references.donors], pool = prepareComparablePool(candidates);
  const context = { asOf, rules: references.rules, aliases: references.aliases, candidates, cohort: candidates, candidatePool: pool, cohortPool: pool };
  // Two distinct representatives suffice to detect every identity conflict,
  // without rescanning the entire workbook once per source row.
  const identityFields: (keyof CanonicalAssetInput)[] = ["unitInduk", "upt", "namaGi", "bayPenghantar", "tid", "namaPeralatan", "spesifikasiMara", "satuan"];
  const representatives = new Map<string, { signature: string; asset: CanonicalAssetInput }[]>();
  for (const { asset } of parsed.rows) {
    const key = asset.noAset?.trim(); if (!key) continue;
    const signature = JSON.stringify(identityFields.map((field) => normalizeAssetText(String(asset[field] ?? ""))));
    const entries = representatives.get(key) ?? [];
    if (entries.length < 2 && !entries.some((entry) => entry.signature === signature)) entries.push({ signature, asset });
    representatives.set(key, entries);
  }
  const rows: Row<"asset_snapshot_rows">[] = [], values: Row<"asset_valuations">[] = [];
  parsed.rows.forEach((row: CanonicalizedAssetRow, index) => {
    const valuation = resolveAssetValuation(assets[index], context);
    const sourceField = valuation.evidence.sourceField; valuation.evidence.sourceCell = sourceField ? row.sources[sourceField] ?? null : null;
    const validation = validateAssetRow(row, valuation, { existingAssets: (representatives.get(row.asset.noAset?.trim() ?? "") ?? []).map((entry) => entry.asset) });
    if (row.asset.unitInduk && ![unit.code, unit.name].some((name) => normalizeAssetText(name) === normalizeAssetText(row.asset.unitInduk))) validation.errors.push({ code: "UNIT_SCOPE_MISMATCH", severity: "ERROR", message: "Unit baris tidak sesuai dengan unit unggahan.", field: "unitInduk" });
    if (!assets[index].coordinates) validation.warnings.push({ code: "MISSING_GI_COORDINATES", severity: "WARNING", message: "Referensi koordinat GI tidak tersedia." });
    const persisted = { ...Object.fromEntries(Object.entries(columnPairs).map(([field, column]) => [column, row.asset[field as keyof CanonicalAssetInput]])), id: rowIds[index], import_run_id: runId, unit_induk_id: session.unit_induk_id, dataset_version_id: version.id, import_sheet_id: sheet.id, source_row_number: row.provenance.rowNumber, provenance: asJson({ ...row.provenance, sources: row.sources }), error_codes: validation.errors.map((issue) => issue.code), warning_codes: [...new Set(validation.warnings.map((issue) => issue.code))], created_at: deps.now() } as Row<"asset_snapshot_rows">;
    rows.push(persisted);
    values.push({ asset_row_id: persisted.id, import_run_id: runId, unit_induk_id: session.unit_induk_id, dataset_version_id: version.id, nilai_abc: valuation.nilaiABC, harga_pengadaan_saat_ini: valuation.hargaPengadaanSaatIni, value_source: valuation.valueSource, calculation_method: valuation.calculationMethod, age_status: valuation.ageStatus, age_years: valuation.evidence.ageYears, useful_life_years: valuation.usefulLife.years, useful_life_rule_id: valuation.usefulLife.rule?.id ?? null, rule_version: diagnostics.data.ruleVersion, as_of: asOf, manual_approval_required: validation.manualApprovalRequired, approved_by: null, approved_at: null, approval_notes: null, selected_donor_ids: valuation.evidence.comparables?.selectedDonorIds ?? [], donor_evidence: asJson({ ...(valuation.evidence.comparables ?? {}), coordinateVersions: references.coordinateVersions }), calculation_evidence: asJson(valuation.evidence), warning_codes: persisted.warning_codes, created_at: deps.now() });
  });
  const expected = persistedRecordHashes(rows, values);
  // Atomic reservation rechecks revision and uniqueness after parsing/valuation.
  try { await deps.reserve(actor.userId, { importId: session.id, expectedRevision: session.mapping_revision, run: { id: runId, expected_row_count: rows.length, expected_valuation_count: values.length, source_hash: source.sha256, mapping_hash: parsed.layoutHash, rule_version: diagnostics.data.ruleVersion, expected_rows_hash: expected.rowsHash, expected_valuations_hash: expected.valuationsHash } }); }
  catch { throw new ImportError("CONFLICT"); }
  try {
    await insertInWindows("asset_snapshot_rows", rows, deps);
    await insertInWindows("asset_valuations", values, deps);
    // The COMPLETE transition trigger recomputes persisted counts and hashes
    // in the database transaction. Avoid returning and downloading hundreds
    // of megabytes only to repeat that authoritative reconciliation in Node.
    await deps.finalize(actor.userId, runId);
  } catch {
    // Conditional update cannot rewrite a terminal run if finalization won a race.
    await deps.failRun(actor.userId, runId);
    throw new ImportError("PROCESS_FAILED");
  }
  try {
    const comparison = await persistComparison(actor, session, runId, rows, values, deps);
    await deps.sealComparison(actor.userId, runId, comparison.baseVersionId, comparison.comparisonId);
  } catch { throw new ImportError("COMPARISON_FAILED"); }
  return loadAssetImport(actor, importId, deps);
}
