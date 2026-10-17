import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../../domain/access";
import { createImportSchema, importIdSchema, saveMappingSchema, sheetMappingSchema, XLSX_MIME, importSummarySchema, type ImportResponse } from "../../domain/asset-import/schemas";
import { normalizeHeader } from "../../domain/asset-import/normalize-header";
import { readNodeAssetWorkbook as readAssetWorkbook } from "./read-node-workbook";
import type { AssetSheetMapping } from "../../domain/asset-import/types";
import type { Json } from "../../lib/supabase/database.types";
import type { ImportDependencies, Row } from "./dependencies";
import { loadImportReview, loadImportComparison } from "./workspace";
import type { ImportReviewQuery } from "../../domain/asset-import/schemas";

export class ImportError extends Error {
  constructor(readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" | "SOURCE_MISMATCH" | "NOT_READY" | "PREVIEW_MISMATCH" | "PROCESS_FAILED" | "CONFLICT" | "REFERENCE_UNAVAILABLE" | "COMPARISON_FAILED", readonly status = 409) { super(code); }
}
export function sha256(bytes: Uint8Array | string) { return createHash("sha256").update(bytes).digest("hex"); }
export function asJson(value: unknown): Json { return JSON.parse(JSON.stringify(value)) as Json; }
export function assertOperator(actor: Actor, unitId?: string) {
  if (actor.role !== "UNIT_OPERATOR" || actor.status !== "ACTIVE" || unitId && !actor.unitIndukIds.includes(unitId)) throw new ImportError("FORBIDDEN", 403);
}
export async function ownedImport(actor: Actor, importId: string, deps: ImportDependencies) {
  assertOperator(actor); if (!importIdSchema.safeParse({ importId }).success) throw new ImportError("INVALID_INPUT", 422);
  const session = (await deps.list("import_sessions", { id: importId }))[0];
  if (!session || !actor.unitIndukIds.includes(session.unit_induk_id)) throw new ImportError("NOT_FOUND", 404);
  const source = (await deps.list("source_files", { id: session.source_file_id, unit_induk_id: session.unit_induk_id }))[0];
  const version = (await deps.list("dataset_versions", { id: session.dataset_version_id, dataset_id: session.dataset_id }))[0];
  const dataset = (await deps.list("datasets", { id: session.dataset_id, unit_induk_id: session.unit_induk_id, type: "ASSET" }))[0];
  if (!source || !version || !dataset || source.object_path !== `unit/${session.unit_induk_id}/dataset/${dataset.id}/version/${version.id}/${source.id}.xlsx`) throw new ImportError("NOT_FOUND", 404);
  return { session, source, version, dataset };
}
export function assertEditable(version: Row<"dataset_versions">) {
  if (!["DRAFT", "NEEDS_FIX", "READY_TO_SUBMIT"].includes(version.status)) throw new ImportError("CONFLICT");
}
export async function verifiedBytes(source: Row<"source_files">, deps: ImportDependencies) {
  let object;
  try { object = await deps.download(source.object_path); } catch { throw new ImportError("SOURCE_MISMATCH"); }
  if (object.size !== source.byte_size || object.bytes.length !== source.byte_size || object.mimeType !== XLSX_MIME || sha256(object.bytes) !== source.sha256) throw new ImportError("SOURCE_MISMATCH");
  return object.bytes;
}
export function headerFingerprint(mapping: AssetSheetMapping) {
  return sha256(JSON.stringify([...mapping.columns].sort((a, b) => a.columnIndex - b.columnIndex).map(({ columnIndex, normalizedHeader }) => ({ columnIndex, normalizedHeader }))));
}
export async function createAssetImport(actor: Actor, input: z.infer<typeof createImportSchema>, deps: ImportDependencies): Promise<ImportResponse> {
  const parsed = createImportSchema.safeParse(input); if (!parsed.success) throw new ImportError("INVALID_INPUT", 422);
  assertOperator(actor, parsed.data.unitId);
  let dataset = (await deps.list("datasets", { unit_induk_id: input.unitId, type: "ASSET" }))[0];
  if (!dataset) {
    try { [dataset] = await deps.insert("datasets", [{ id: deps.id(), unit_induk_id: input.unitId, type: "ASSET" }]); }
    catch { dataset = (await deps.list("datasets", { unit_induk_id: input.unitId, type: "ASSET" }))[0]; if (!dataset) throw new ImportError("CONFLICT"); }
  }
  let version: Row<"dataset_versions"> | undefined;
  for (let attempt = 0; attempt < 5 && !version; attempt++) {
    const versions = await deps.list("dataset_versions", { dataset_id: dataset.id });
    const next = versions.reduce((max, current) => Math.max(max, current.version_number), 0) + 1;
    try { [version] = await deps.insert("dataset_versions", [{ id: deps.id(), dataset_id: dataset.id, version_number: next, status: "DRAFT", created_by: actor.userId }]); } catch { if (attempt === 4) throw new ImportError("CONFLICT"); }
  }
  if (!version) throw new ImportError("CONFLICT");
  const fileId = deps.id(), importId = deps.id();
  const path = `unit/${input.unitId}/dataset/${dataset.id}/version/${version.id}/${fileId}.xlsx`;
  await deps.insert("source_files", [{ id: fileId, unit_induk_id: input.unitId, object_path: path, original_name: input.fileName, byte_size: input.byteSize, mime_type: input.mimeType, sha256: input.sha256, uploaded_by: actor.userId }]);
  await deps.insert("import_sessions", [{ id: importId, unit_induk_id: input.unitId, dataset_id: dataset.id, dataset_version_id: version.id, source_file_id: fileId, created_by: actor.userId }]);
  const upload = await deps.sign(path);
  return { importId, datasetId: dataset.id, versionId: version.id, stage: "UPLOAD", upload };
}
export async function completeSourceUpload(actor: Actor, input: z.infer<typeof importIdSchema>, deps: ImportDependencies): Promise<ImportResponse> {
  if (!importIdSchema.safeParse(input).success) throw new ImportError("INVALID_INPUT", 422);
  const { session, source, version } = await ownedImport(actor, input.importId, deps);
  const bytes = await verifiedBytes(source, deps);
  const existing = await deps.list("import_sheets", { import_session_id: session.id, unit_induk_id: session.unit_induk_id });
  if (!existing.length) assertEditable(version);
  {
    let parsed;
    try { parsed = await readAssetWorkbook(bytes, { ruleVersion: "layout-detection", previewLimit: 0 }); } catch { throw new ImportError("INVALID_INPUT", 422); }
    const candidates = new Map<string, AssetSheetMapping>();
    for (const mapping of parsed.layout.candidates) if (!candidates.has(mapping.sheetName)) candidates.set(mapping.sheetName, mapping);
    if (!candidates.size) throw new ImportError("INVALID_INPUT", 422);
    for (const mapping of candidates.values()) {
      if (existing.some((sheet) => sheet.sheet_name === mapping.sheetName)) continue;
      assertEditable(version);
      try {
        await deps.insert("import_sheets", [{ id: deps.id(), import_session_id: session.id, unit_induk_id: session.unit_induk_id, sheet_name: mapping.sheetName, header_row: mapping.headerRow, selected: false, diagnostics: asJson({ uploadVerified: source.sha256, proposal: mapping, headerFingerprint: headerFingerprint(mapping) }) }]);
      } catch {
        if (!(await deps.list("import_sheets", { import_session_id: session.id, sheet_name: mapping.sheetName })).length) throw new ImportError("CONFLICT");
      }
    }
  }
  return loadAssetImport(actor, session.id, deps);
}
export async function saveImportMapping(actor: Actor, input: z.infer<typeof saveMappingSchema>, deps: ImportDependencies): Promise<ImportResponse> {
  if (!saveMappingSchema.safeParse(input).success) throw new ImportError("INVALID_INPUT", 422);
  const { session, source, version } = await ownedImport(actor, input.importId, deps); assertEditable(version);
  if ((await deps.list("asset_import_runs", { import_session_id: session.id, status: "PROCESSING" })).length) throw new ImportError("CONFLICT");
  const sheet = (await deps.list("import_sheets", { import_session_id: session.id, unit_induk_id: session.unit_induk_id, sheet_name: input.mapping.sheetName }))[0];
  if (!sheet) throw new ImportError("NOT_READY");
  let parsed;
  try { parsed = await readAssetWorkbook(await verifiedBytes(source, deps), { ruleVersion: input.ruleVersion, confirmedMapping: input.mapping, previewLimit: 0 }); }
  catch (error) { if (error instanceof ImportError) throw error; throw new ImportError("INVALID_INPUT", 422); }
  if (parsed.layoutHash !== input.layoutHash || parsed.canonicalHash !== input.canonicalHash) throw new ImportError("PREVIEW_MISMATCH");
  const mapping = parsed.layout.selected!;
  try { await deps.replaceMapping(actor.userId, { importId: session.id, sheetId: sheet.id, expectedRevision: session.mapping_revision, mapping, layoutHash: input.layoutHash, canonicalHash: input.canonicalHash, ruleVersion: input.ruleVersion, sourceHash: source.sha256 }); }
  catch { throw new ImportError("CONFLICT"); }
  return loadAssetImport(actor, session.id, deps);
}
export async function loadAssetImport(actor: Actor, importId: string, deps: ImportDependencies, options: ImportReviewQuery = { offset: 0, filter: "ALL" }): Promise<ImportResponse> {
  const { session, source, version } = await ownedImport(actor, importId, deps);
  const sheets = await deps.list("import_sheets", { import_session_id: session.id, unit_induk_id: session.unit_induk_id });
  const selected = sheets.find((sheet) => sheet.selected), runs = await deps.list("asset_import_runs", { import_session_id: session.id });
  const current = runs.find((run) => run.id === session.current_run_id), latest = [...runs].reverse().sort((a, b) => b.created_at.localeCompare(a.created_at)).at(0);
  const diagnostics = selected?.diagnostics as Record<string, Json> | undefined;
  let stage: ImportResponse["stage"] = !sheets.length ? "UPLOAD" : selected ? "READY_TO_PROCESS" : "MAPPING";
  const metadata = current ? (await deps.list("asset_import_run_metadata", { import_run_id: current.id, unit_induk_id: session.unit_induk_id }))[0] : undefined;
  const currentMatches = current?.status === "COMPLETE" && current.mapping_revision === session.mapping_revision && current.mapping_hash === selected?.layout_hash && current.rule_version === diagnostics?.ruleVersion;
  if (currentMatches) stage = "READY_TO_SUBMIT";
  if (latest?.status === "FAILED") stage = "FAILED";
  if (runs.some((run) => run.status === "PROCESSING")) stage = "PROCESSING";
  if (["PENDING_RST", "ACTIVE", "HISTORICAL"].includes(version.status)) stage = version.status as ImportResponse["stage"];
  // A returned version remains blocked until a later finalized run is ready.
  // The relational version status stays NEEDS_FIX until the audited submit RPC.
  if (version.status === "NEEDS_FIX" && !(currentMatches && current && Date.parse(current.created_at) > Date.parse(version.updated_at))) stage = "NEEDS_FIX";
  const result: ImportResponse = { importId, datasetId: session.dataset_id, versionId: version.id, stage };
  result.source = { unitId: session.unit_induk_id, fileName: source.original_name, byteSize: source.byte_size, sha256: source.sha256 };
  if (typeof diagnostics?.ruleVersion === "string") result.ruleVersion = diagnostics.ruleVersion;
  if (stage === "UPLOAD") result.upload = await deps.sign(source.object_path);
  const mapping = sheetMappingSchema.safeParse(diagnostics?.mapping ?? (sheets[0]?.diagnostics as Record<string, Json> | undefined)?.proposal);
  if (mapping.success) {
    result.layout = mapping.data;
    const profiles = await deps.list("mapping_profiles", { unit_induk_id: session.unit_induk_id, layout_hash: headerFingerprint(mapping.data) });
    for (const profile of profiles) {
      const roles = await deps.list("user_role_assignments", { user_id: profile.created_by });
      const creator = (await deps.list("profiles", { id: profile.created_by, status: "ACTIVE" }))[0];
      if (creator && roles.length === 1 && ["RST_ADMIN", "RST_REVIEWER"].includes(roles[0].role)) { result.suggestedProfile = { id: profile.id, name: profile.name, ruleVersion: profile.rule_version }; break; }
    }
  }
  const summary = importSummarySchema.safeParse(metadata?.summary); if (summary.success && currentMatches) { result.summary = summary.data; if (summary.data.blockingErrors && stage === "READY_TO_SUBMIT") result.stage = "NEEDS_FIX"; }
  if (currentMatches && !metadata?.comparison_ready && stage === "READY_TO_SUBMIT") { result.stage = "FAILED"; result.failureCode = "COMPARISON_FAILED"; }
  if (latest?.status === "FAILED") result.failureCode = "PROCESS_FAILED";
  if (currentMatches && current) {
    result.review = await loadImportReview(session.unit_induk_id, current.id, deps, options);
    result.comparison = await loadImportComparison(session.unit_induk_id, current.id, Boolean(metadata?.comparison_base_version_id), deps, result.summary?.rowCount ?? current.expected_row_count);
  }
  return result;
}
export async function submitAssetVersion(actor: Actor, importId: string, deps: ImportDependencies): Promise<ImportResponse> {
  const { session, version, dataset } = await ownedImport(actor, importId, deps); assertEditable(version);
  const runs = await deps.list("asset_import_runs", { import_session_id: session.id });
  const current = runs.find((run) => run.id === session.current_run_id && run.status === "COMPLETE");
  if (!current || runs.some((run) => run.status === "PROCESSING")) throw new ImportError("NOT_READY");
  const selected = (await deps.list("import_sheets", { import_session_id: session.id, selected: true }))[0];
  if (!selected || selected.layout_hash !== current.mapping_hash || (selected.diagnostics as Record<string, Json>)?.ruleVersion !== current.rule_version) throw new ImportError("NOT_READY");
  await confirmedMapping(selected, deps);
  const completion = (await deps.list("asset_import_run_metadata", { import_run_id: current.id, unit_induk_id: session.unit_induk_id }))[0];
  if (!completion?.comparison_ready) throw new ImportError("NOT_READY");
  if (dataset.active_version_id && dataset.active_version_id !== version.id) {
    const comparison = (await deps.list("version_comparisons", { dataset_id: dataset.id, unit_induk_id: session.unit_induk_id, from_version_id: dataset.active_version_id, to_run_id: current.id }))[0];
    if (!comparison) throw new ImportError("NOT_READY");
    const comparisonSummary = z.object({ counts: z.record(z.string(), z.number().int().nonnegative()) }).safeParse(comparison.summary);
    const changes = await deps.list("asset_version_changes", { comparison_id: comparison.id });
    if (!comparisonSummary.success || changes.length !== Object.values(comparisonSummary.data.counts).reduce((sum, count) => sum + count, 0)) throw new ImportError("NOT_READY");
  }
  const rows = await deps.list("asset_snapshot_rows", { import_run_id: current.id }), values = await deps.list("asset_valuations", { import_run_id: current.id });
  if (rows.length !== current.expected_row_count || values.length !== current.expected_valuation_count || rows.some((row) => row.error_codes.length) || values.some((value) => value.nilai_abc === null || value.value_source === "UNRESOLVED")) throw new ImportError("NOT_READY");
  try { await deps.submit(actor.userId, version.id, { runId: current.id, mappingRevision: session.mapping_revision, layoutHash: current.mapping_hash, baseVersionId: completion.comparison_base_version_id, comparisonId: completion.comparison_id }); } catch { throw new ImportError("NOT_READY"); }
  return loadAssetImport(actor, importId, deps);
}

/** Reconstruct only confirmed indexed mappings; diagnostic JSON alone is not authority. */
export async function confirmedMapping(sheet: Row<"import_sheets">, deps: ImportDependencies): Promise<AssetSheetMapping> {
  const diagnostics = z.object({ mapping: sheetMappingSchema }).safeParse(sheet.diagnostics); if (!diagnostics.success) throw new ImportError("NOT_READY");
  const mapping = diagnostics.data.mapping;
  const columns = await deps.list("import_column_mappings", { import_sheet_id: sheet.id, import_session_id: sheet.import_session_id, unit_induk_id: sheet.unit_induk_id });
  if (columns.length !== mapping.columns.length || columns.some((column) => !column.confirmed_by || !column.confirmed_at || !mapping.columns.some((entry) => entry.columnIndex === column.source_column_index && entry.field === column.canonical_field && entry.normalizedHeader === normalizeHeader(column.source_header)))) throw new ImportError("NOT_READY");
  return mapping;
}
