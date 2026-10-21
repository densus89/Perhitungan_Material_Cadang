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
import { ASSET_CHUNK_SIZE, deterministicAssetRowId, importProgress, planMissingChunks } from "./resumable";

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
type ValuationEvidence = ReturnType<typeof resolveAssetValuation>["evidence"];
function compactCalculationEvidence(evidence: ValuationEvidence) {
  const ageDonors = evidence.age.donorIds.length, rejectedAgeDonors = evidence.age.rejectedDonors.length;
  const comparables = evidence.comparables;
  return {
    ...(evidence.sourceField ? { sourceField: evidence.sourceField, sourceAddress: evidence.sourceCell?.address ?? null } : {}),
    ...(evidence.referencePrice === null ? {} : { referencePrice: evidence.referencePrice }),
    ...(evidence.priceDate ? { priceDate: evidence.priceDate } : {}),
    ...(evidence.ageYears === null ? {} : { ageYears: evidence.ageYears }),
    ...(evidence.usefulLifeYears === null ? {} : { usefulLifeYears: evidence.usefulLifeYears }),
    ...(evidence.age.tier || ageDonors || rejectedAgeDonors || evidence.age.warnings.length ? { age: {
      status: evidence.age.status,
      ...(evidence.age.tier ? { tier: evidence.age.tier } : {}),
      ...(ageDonors ? { donorCount: ageDonors } : {}),
      ...(rejectedAgeDonors ? { rejectedDonorCount: rejectedAgeDonors } : {}),
      ...(evidence.age.warnings.length ? { warnings: evidence.age.warnings } : {}),
    } } : {}),
    ...(comparables ? { comparables: {
      status: comparables.status, tier: comparables.tier, median: comparables.median,
      candidateCount: comparables.candidateCount, min: comparables.min, max: comparables.max, dispersion: comparables.dispersion,
      donorCount: comparables.selectedDonorIds.length, rejectedDonorCount: comparables.rejectedDonors.length,
      ...(comparables.warnings.length ? { warnings: comparables.warnings } : {}),
    } } : {}),
  };
}
function compactDonorEvidence(evidence: ValuationEvidence, coordinateVersions: string[]) {
  const comparables = evidence.comparables;
  return {
    ...(comparables ? {
      status: comparables.status, tier: comparables.tier, median: comparables.median,
      candidateCount: comparables.candidateCount, min: comparables.min, max: comparables.max, dispersion: comparables.dispersion,
      donorCount: comparables.selectedDonorIds.length, rejectedDonorCount: comparables.rejectedDonors.length,
      ...(comparables.warnings.length ? { warnings: comparables.warnings } : {}),
    } : {}),
    ...(coordinateVersions.length ? { coordinateVersions } : {}),
  };
}
export async function insertInWindows(actorId: string, runId: string, rows: Row<"asset_snapshot_rows">[], valuations: Row<"asset_valuations">[], deps: ImportDependencies) {
  if (valuations.length !== rows.length) throw new Error("Mismatched asset import records");
  const batches = Array.from({ length: Math.ceil(rows.length / ASSET_CHUNK_SIZE) }, (_, index) => ({ rows: rows.slice(index * ASSET_CHUNK_SIZE, (index + 1) * ASSET_CHUNK_SIZE), valuations: valuations.slice(index * ASSET_CHUNK_SIZE, (index + 1) * ASSET_CHUNK_SIZE) }));
  // Two compact requests overlap network serialization/latency while the
  // shared run lock still lets each RPC insert its paired rows atomically.
  for (let index = 0; index < batches.length; index += 2) {
    await Promise.all(batches.slice(index, index + 2).map((batch) => deps.insertAssetBatch(actorId, runId, batch.rows, batch.valuations)));
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
  const existing = (await deps.list("version_comparisons", { from_run_id: previousRun.id, to_run_id: runId }))[0];
  const comparisonId = existing?.id ?? deps.id();
  const { counts: kinds, changes } = compareAssetVersions({ before, after: rows, beforeValues, afterValues: values }, { comparisonId, unitId: session.unit_induk_id, fields: Object.values(columnPairs) });
  if (!existing) await deps.insert("version_comparisons", [{ id: comparisonId, dataset_id: session.dataset_id, unit_induk_id: session.unit_induk_id, from_version_id: dataset.active_version_id, to_version_id: session.dataset_version_id, from_run_id: previousRun.id, to_run_id: runId, summary: asJson({ counts: kinds, before: summarize(before, beforeValues), after: summarize(rows, values) }), created_by: actor.userId }]);
  const persistedKeys = new Set((await deps.list("asset_version_changes", { comparison_id: comparisonId })).map((change) => change.identity_key));
  const missing = changes.filter((change) => !persistedKeys.has(change.identity_key));
  for (let offset = 0; offset < missing.length; offset += 1000) await deps.insert("asset_version_changes", missing.slice(offset, offset + 1000));
  return { baseVersionId: dataset.active_version_id, comparisonId };
}
export async function processStoredWorkbook(actor: Actor, importId: string, deps: ImportDependencies): Promise<ImportResponse> {
  const processStarted = performance.now();
  const phase = (name: string, rows?: number) => console.info("ASSET_IMPORT_PHASE " + JSON.stringify({ name, durationMs: Math.round(performance.now() - processStarted), ...(rows === undefined ? {} : { rows }) }));
  const { session, source, version, dataset } = await ownedImport(actor, importId, deps); assertEditable(version);
  const sheet = (await deps.list("import_sheets", { import_session_id: session.id, unit_induk_id: session.unit_induk_id, selected: true }))[0];
  if (!sheet) throw new ImportError("NOT_READY");
  const mapping = await confirmedMapping(sheet, deps);
  const diagnostics = z.object({ ruleVersion: z.string().min(1), canonicalHash: hashSchema, layoutHash: hashSchema, uploadVerified: hashSchema }).safeParse(sheet.diagnostics);
  if (!diagnostics.success || diagnostics.data.uploadVerified !== source.sha256) throw new ImportError("NOT_READY");
  const processing = await deps.processingRun(session.id);
  if (processing) {
    const completed = await deps.completedChunks(processing.id), expectedChunks = Math.ceil(processing.expected_row_count / ASSET_CHUNK_SIZE);
    const manifestComplete = completed.length === expectedChunks && completed.every((chunk, index) => chunk.chunkIndex === index && chunk.rowCount === Math.min(ASSET_CHUNK_SIZE, processing.expected_row_count - index * ASSET_CHUNK_SIZE));
    if (completed.length >= expectedChunks && (!manifestComplete || completed.reduce((total, chunk) => total + chunk.rowCount, 0) !== processing.expected_row_count || processing.expected_row_count !== processing.expected_valuation_count)) throw new ImportError("PROCESS_FAILED");
    if (manifestComplete) {
      if (processing.processing_protocol_version !== "resumable-v1" || processing.mapping_revision !== session.mapping_revision || processing.source_hash !== source.sha256 || processing.mapping_hash !== diagnostics.data.layoutHash || processing.mapping_hash !== sheet.layout_hash || processing.rule_version !== diagnostics.data.ruleVersion) throw new ImportError("CONFLICT");
      await verifiedBytes(source, deps);
      const runEvidence = { id: processing.id, expected_row_count: processing.expected_row_count, expected_valuation_count: processing.expected_valuation_count, source_hash: processing.source_hash, mapping_hash: processing.mapping_hash, rule_version: processing.rule_version, expected_rows_hash: processing.expected_rows_hash, expected_valuations_hash: processing.expected_valuations_hash };
      let claim;
      try { claim = await deps.claimProcessing(actor.userId, { importId: session.id, expectedRevision: session.mapping_revision, run: runEvidence }); }
      catch { throw new ImportError("CONFLICT"); }
      phase("claimed", processing.expected_row_count);
      try {
        await deps.finalize(actor.userId, processing.id, claim.leaseToken);
        phase("finalized", processing.expected_row_count);
        try { await deps.releaseProcessing(actor.userId, processing.id, claim.leaseToken); } catch { /* terminal run no longer needs the lease */ }
      } catch {
        try { await deps.releaseProcessing(actor.userId, processing.id, claim.leaseToken); } catch { /* lease expiry permits a later retry */ }
        throw new ImportError("PROCESS_FAILED");
      }
      if (!dataset.active_version_id) {
        try { await deps.sealComparison(actor.userId, processing.id, null, null); phase("compared", processing.expected_row_count); }
        catch { throw new ImportError("COMPARISON_FAILED"); }
        return loadAssetImport(actor, importId, deps);
      }
      return { importId, datasetId: session.dataset_id, versionId: version.id, stage: "PROCESSING", source: { unitId: session.unit_induk_id, fileName: source.original_name, byteSize: source.byte_size, sha256: source.sha256 }, ruleVersion: diagnostics.data.ruleVersion, layout: mapping, progress: importProgress(processing.expected_row_count, completed) };
    }
  }
  const bytes = await verifiedBytes(source, deps);
  const parsed = await readAssetWorkbook(bytes, { ruleVersion: diagnostics.data.ruleVersion, confirmedMapping: mapping, collectRows: true, previewLimit: 0, batchSize: 1000 });
  phase("parsed", parsed.rows?.length);
  if (parsed.canonicalHash !== diagnostics.data.canonicalHash || parsed.layoutHash !== diagnostics.data.layoutHash || parsed.layoutHash !== sheet.layout_hash) throw new ImportError("PREVIEW_MISMATCH");
  if (!parsed.rows?.length) throw new ImportError("NOT_READY");
  const current = session.current_run_id ? (await deps.list("asset_import_runs", { id: session.current_run_id }))[0] : undefined;
  const currentMetadata = current ? (await deps.list("asset_import_run_metadata", { import_run_id: current.id, unit_induk_id: session.unit_induk_id }))[0] : undefined;
  const comparisonRetry = !processing && current?.status === "COMPLETE" && current.mapping_revision === session.mapping_revision && current.mapping_hash === parsed.layoutHash && current.rule_version === diagnostics.data.ruleVersion && currentMetadata && !currentMetadata.comparison_ready ? current : undefined;
  const runId = processing?.id ?? comparisonRetry?.id ?? deps.id();
  const asOf = (processing?.created_at ?? comparisonRetry?.created_at ?? deps.now()).slice(0, 10), references = await referenceContext(deps, diagnostics.data.ruleVersion, asOf);
  phase("references", parsed.rows.length);
  const unit = (await deps.list("unit_induk", { id: session.unit_induk_id }))[0];
  if (!unit) throw new ImportError("REFERENCE_UNAVAILABLE");
  const rowIds = parsed.rows.map((row) => deterministicAssetRowId(runId, sheet.id, row.provenance.rowNumber));
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
    const persisted = { ...Object.fromEntries(Object.entries(columnPairs).map(([field, column]) => [column, row.asset[field as keyof CanonicalAssetInput]])), id: rowIds[index], import_run_id: runId, unit_induk_id: session.unit_induk_id, dataset_version_id: version.id, import_sheet_id: sheet.id, source_row_number: row.provenance.rowNumber, provenance: asJson(row.provenance), error_codes: validation.errors.map((issue) => issue.code), warning_codes: [...new Set(validation.warnings.map((issue) => issue.code))], created_at: deps.now() } as Row<"asset_snapshot_rows">;
    rows.push(persisted);
    values.push({ asset_row_id: persisted.id, import_run_id: runId, unit_induk_id: session.unit_induk_id, dataset_version_id: version.id, nilai_abc: valuation.nilaiABC, harga_pengadaan_saat_ini: valuation.hargaPengadaanSaatIni, value_source: valuation.valueSource, calculation_method: valuation.calculationMethod, age_status: valuation.ageStatus, age_years: valuation.evidence.ageYears, useful_life_years: valuation.usefulLife.years, useful_life_rule_id: valuation.usefulLife.rule?.id ?? null, rule_version: diagnostics.data.ruleVersion, as_of: asOf, manual_approval_required: validation.manualApprovalRequired, approved_by: null, approved_at: null, approval_notes: null, selected_donor_ids: valuation.evidence.comparables?.selectedDonorIds ?? [], donor_evidence: asJson(compactDonorEvidence(valuation.evidence, references.coordinateVersions)), calculation_evidence: asJson(compactCalculationEvidence(valuation.evidence)), warning_codes: persisted.warning_codes, created_at: deps.now() });
  });
  phase("valued", rows.length);
  const expected = persistedRecordHashes(rows, values);
  phase("hashed", rows.length);
  const runEvidence = { id: runId, expected_row_count: rows.length, expected_valuation_count: values.length, source_hash: source.sha256, mapping_hash: parsed.layoutHash, rule_version: diagnostics.data.ruleVersion, expected_rows_hash: expected.rowsHash, expected_valuations_hash: expected.valuationsHash };
  if (comparisonRetry) {
    if (comparisonRetry.expected_row_count !== rows.length || comparisonRetry.expected_valuation_count !== values.length || comparisonRetry.source_hash !== source.sha256 || comparisonRetry.expected_rows_hash !== expected.rowsHash || comparisonRetry.expected_valuations_hash !== expected.valuationsHash) throw new ImportError("CONFLICT");
  } else {
    let claim;
    try { claim = await deps.claimProcessing(actor.userId, { importId: session.id, expectedRevision: session.mapping_revision, run: runEvidence }); }
    catch { throw new ImportError("CONFLICT"); }
    phase("claimed", rows.length);
    try {
      const chunks = planMissingChunks(rows, values, claim.completedChunks.map((chunk) => chunk.chunkIndex));
      for (let index = 0; index < chunks.length; index += 2) await Promise.all(chunks.slice(index, index + 2).map((chunk) => deps.commitChunk(actor.userId, runId, claim.leaseToken, chunk)));
      phase("committed", chunks.reduce((total, chunk) => total + chunk.rowCount, 0));
      const completed = await deps.completedChunks(runId);
      if (completed.length < Math.ceil(rows.length / ASSET_CHUNK_SIZE)) {
        await deps.releaseProcessing(actor.userId, runId, claim.leaseToken);
        phase("partial", completed.reduce((total, chunk) => total + chunk.rowCount, 0));
        return loadAssetImport(actor, importId, deps);
      }
      if (processing) {
        await deps.releaseProcessing(actor.userId, runId, claim.leaseToken);
        phase("partial", completed.reduce((total, chunk) => total + chunk.rowCount, 0));
        return loadAssetImport(actor, importId, deps);
      }
      await deps.finalize(actor.userId, runId, claim.leaseToken);
      phase("finalized", rows.length);
      try { await deps.releaseProcessing(actor.userId, runId, claim.leaseToken); } catch { /* terminal run no longer needs the lease */ }
    } catch {
      try { await deps.releaseProcessing(actor.userId, runId, claim.leaseToken); } catch { /* lease expiry permits a later retry */ }
      throw new ImportError("PROCESS_FAILED");
    }
  }
  try {
    const comparison = await persistComparison(actor, session, runId, rows, values, deps);
    await deps.sealComparison(actor.userId, runId, comparison.baseVersionId, comparison.comparisonId);
    phase("compared", rows.length);
  } catch { throw new ImportError("COMPARISON_FAILED"); }
  return loadAssetImport(actor, importId, deps);
}
