import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/supabase/database";
import type { Actor } from "../../domain/access";
import { importReviewSchema, stageSchema, type ImportDraft, type ImportReview, type ImportReviewQuery } from "../../domain/asset-import/schemas";
import type { ImportDependencies } from "./dependencies";

/** RLS session read; no upload signatures, object paths or privileged client cross this boundary. */
export async function loadImportDrafts(client: SupabaseClient<Database>, actor: Actor): Promise<ImportDraft[]> {
  if (actor.role !== "UNIT_OPERATOR" || !actor.unitIndukIds.length) return [];
  const { data, error } = await client.from("import_sessions").select("id,unit_induk_id,dataset_id,dataset_version_id,created_at,source_files(original_name),dataset_versions(status),asset_import_runs!asset_import_runs_import_session_id_unit_induk_id_dataset__fkey(status,expected_row_count,created_at),import_sheets(selected)")
    .in("unit_induk_id", [...actor.unitIndukIds]).order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "asset_import_runs", ascending: false }).limit(1, { referencedTable: "asset_import_runs" })
    .order("selected", { referencedTable: "import_sheets", ascending: false }).limit(1, { referencedTable: "import_sheets" }).limit(50);
  if (error || !data) throw new Error("Draft list unavailable");
  return data.filter(row => actor.unitIndukIds.includes(row.unit_induk_id)).map(row => {
    const latest = [...row.asset_import_runs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const versionStage = stageSchema.safeParse(row.dataset_versions?.status);
    const terminal = versionStage.success && ["PENDING_RST", "ACTIVE", "HISTORICAL", "NEEDS_FIX"].includes(versionStage.data);
    const stage = terminal && versionStage.success ? versionStage.data : latest?.status === "PROCESSING" ? "PROCESSING" : latest?.status === "FAILED" ? "FAILED" : versionStage.success ? versionStage.data : row.import_sheets.some(sheet => sheet.selected) ? "READY_TO_PROCESS" : row.import_sheets.length ? "MAPPING" : "UPLOAD";
    return { importId: row.id, unitId: row.unit_induk_id, datasetId: row.dataset_id, versionId: row.dataset_version_id, fileName: row.source_files?.original_name ?? "Snapshot XLSX", createdAt: row.created_at, stage, rowCount: latest?.expected_row_count ?? null };
  });
}
const object = (value: Json | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value: Json | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export async function loadImportReview(unitId: string, runId: string, deps: ImportDependencies, options: ImportReviewQuery): Promise<ImportReview> {
  const page = await deps.reviewPage(unitId, runId, options);
  const values = new Map((await deps.reviewValues(unitId, runId, page.rows.map(row => row.id))).map(value => [value.asset_row_id, value]));
  const preview = page.rows.map(row => {
    const value = values.get(row.id), donor = object(value?.donor_evidence), calculation = object(value?.calculation_evidence);
    // Only aggregate donor evidence is permitted: never national IDs, locations, raw cells or provenance.
    return { rowNumber: row.source_row_number, equipment: (row.nama_peralatan ?? "Tanpa nama").slice(0, 4096), errors: row.error_codes, warnings: row.warning_codes, value: value?.nilai_abc ?? null, valueSource: value?.value_source ?? "UNRESOLVED", ageImputed: value?.age_status === "AGE_IMPUTED", evidence: { donorCount: value?.selected_donor_ids?.length ?? 0, ...(typeof donor.tier === "string" ? { tier: donor.tier } : {}), referencePrice: finite(calculation.referencePrice), ageYears: finite(calculation.ageYears), usefulLifeYears: finite(calculation.usefulLifeYears) } };
  });
  return importReviewSchema.parse({ totalRows: page.totalRows, offset: options.offset, hasMore: options.offset + preview.length < page.totalRows, rows: preview });
}
export async function loadImportComparison(unitId: string, runId: string, hasActiveVersion: boolean, deps: ImportDependencies, rowCount: number) {
  const comparison = (await deps.list("version_comparisons", { unit_induk_id: unitId, to_run_id: runId }))[0];
  const parsed = z.object({ counts: z.record(z.string(), z.number().int().nonnegative()), before: z.object({ valueSources: z.record(z.string(), z.number().int().nonnegative()) }), after: z.object({ valueSources: z.record(z.string(), z.number().int().nonnegative()) }) }).safeParse(comparison?.summary);
  if (!parsed.success) return hasActiveVersion ? undefined : { counts: { ADDED: rowCount, REMOVED: 0, CHANGED: 0, UNCHANGED: 0, AMBIGUOUS: 0 }, sourceShifts: {}, hasActiveVersion: false };
  const { before, after, counts } = parsed.data;
  return { counts, sourceShifts: Object.fromEntries([...new Set([...Object.keys(before.valueSources), ...Object.keys(after.valueSources)])].map(source => [source, (after.valueSources[source] ?? 0) - (before.valueSources[source] ?? 0)])), hasActiveVersion };
}
