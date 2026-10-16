import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "../../domain/access";
import type { Database, Json } from "../../lib/supabase/database.types";
import { importReviewQuerySchema, type ImportReviewQuery } from "../../domain/asset-import/schemas";
import { reviewActionSchema, reviewFiltersSchema, type ReviewAction, type ReviewDetail, type ReviewFilters, type ReviewQueue, type ReviewResult } from "../../features/import/review-contracts";
export class ReviewError extends Error { constructor(public code: string, public status: number) { super(code); } }
export function assertReviewer(actor: Actor) { if (actor.status !== "ACTIVE" || !["RST_ADMIN", "RST_REVIEWER"].includes(actor.role)) throw new ReviewError("FORBIDDEN", 403); }
export interface ReviewDependencies {
  queue(filters: ReviewFilters): Promise<ReviewQueue>;
  read(versionId: string, filters: ImportReviewQuery): Promise<ReviewDetail>;
  mutate(actorId: string, action: "RETURN" | "ACTIVATE" | "ACKNOWLEDGE" | "TRASH", input: ReviewAction): Promise<ReviewResult>;
}
export async function listPendingAssetVersions(actor: Actor, filters: unknown, deps: ReviewDependencies) { assertReviewer(actor); const input = reviewFiltersSchema.safeParse(filters); if (!input.success) throw new ReviewError("INVALID_INPUT", 422); return deps.queue(input.data); }
export async function loadAssetVersionReview(actor: Actor, versionId: string, deps: ReviewDependencies, filters: ImportReviewQuery = { offset: 0, filter: "ALL" }) { assertReviewer(actor); return deps.read(versionId, importReviewQuerySchema.parse(filters)); }
async function action(actor: Actor, raw: unknown, deps: ReviewDependencies, operation: "RETURN" | "ACTIVATE" | "TRASH") {
  assertReviewer(actor); if (operation === "TRASH" && actor.role !== "RST_ADMIN") throw new ReviewError("FORBIDDEN", 403);
  const parsed = reviewActionSchema.safeParse(raw); if (!parsed.success) throw new ReviewError("INVALID_INPUT", 422);
  const input = parsed.data, state = await deps.read(input.versionId, input.filters);
  if (JSON.stringify(state.expected) !== JSON.stringify(input.expected) || (operation !== "TRASH" && state.status !== "PENDING_RST") || operation === "TRASH" && !["HISTORICAL", "NEEDS_FIX", "REJECTED", "DRAFT", "READY_TO_SUBMIT"].includes(state.status)) throw new ReviewError("STALE_REVIEW", 409);
  // This preflight improves feedback; the RPC repeats every authoritative check under locks.
  return deps.mutate(actor.userId, operation === "ACTIVATE" ? input.mode : operation, input);
}
export const returnAssetVersion = (actor: Actor, input: unknown, deps: ReviewDependencies) => action(actor, input, deps, "RETURN");
export const approveAndActivateAssetVersion = (actor: Actor, input: unknown, deps: ReviewDependencies) => action(actor, input, deps, "ACTIVATE");
export const trashAssetVersion = (actor: Actor, input: unknown, deps: ReviewDependencies) => action(actor, input, deps, "TRASH");

/** All RST reads are bounded. No whole workbook or run is loaded for the queue or detail. */
export function createReviewDependencies(client: SupabaseClient<Database>): ReviewDependencies {
  function check(error: unknown) { if (error) throw new ReviewError("REVIEW_UNAVAILABLE", 503); }
  async function rows(runId: string, unitId: string, input: ImportReviewQuery) {
    let query = client.from("asset_snapshot_rows").select("*,asset_valuations!inner(*)", { count: "exact" }).eq("import_run_id", runId).eq("unit_induk_id", unitId);
    if (input.filter === "ERROR") query = query.not("error_codes", "eq", "{}");
    if (input.filter === "WARNING") query = query.not("warning_codes", "eq", "{}");
    if (input.filter === "AGE_IMPUTED") query = query.eq("asset_valuations.age_status", "AGE_IMPUTED");
    if (input.filter === "ESTIMATED") query = query.in("asset_valuations.value_source", ["SYSTEM_DEPRECIATION", "ESTIMATED_SAME_GI", "ESTIMATED_SAME_UPT", "ESTIMATED_SAME_UNIT", "ESTIMATED_NEAREST_LOCATION", "ESTIMATED_NATIONAL"]);
    if (input.issue) query = query.or(`error_codes.cs.{${input.issue}},warning_codes.cs.{${input.issue}}`);
    if (input.source) query = query.eq("asset_valuations.value_source", input.source);
    if (input.condition === "MISSING") query = query.is("kondisi_aset", null); else if (input.condition) query = query.eq("kondisi_aset", input.condition);
    if (input.search) query = query.ilike("nama_peralatan", "%" + input.search.replace(/[\\%_]/g, "\\$&") + "%");
    const { data, error, count } = await query.order("source_row_number").order("id").range(input.offset, input.offset + 99); check(error);
    if (!data || count === null || data.length > 100) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
    return { data, count };
  }
  return {
    async queue(filters) {
      // Filter current-run aggregates in SQL before pagination; never filter only an arbitrary first page.
      const { data, error } = await client.rpc("list_asset_version_reviews", { p_filters: filters as unknown as Json }); check(error);
      return data as unknown as ReviewQueue;
    },
    async read(versionId, filters) {
      const { data: version, error } = await client.from("dataset_versions").select("id,version_number,status,created_at,dataset_id,datasets!dataset_versions_dataset_id_fkey(unit_induk_id,type,unit_induk(name)),import_sessions(id,source_file_id,current_run_id,mapping_revision)").eq("id", versionId).maybeSingle(); check(error);
      if (!version || version.datasets.type !== "ASSET" || version.import_sessions.length !== 1) throw new ReviewError("NOT_FOUND", 404);
      const session = version.import_sessions[0], unitId = version.datasets.unit_induk_id;
      if (!session.current_run_id) throw new ReviewError("INCOMPLETE_RUN", 409);
      const [runResult, metaResult, fileResult, mappingResult, approvalResult, auditResult, rowPage] = await Promise.all([
        client.from("asset_import_runs").select("*").eq("id", session.current_run_id).eq("unit_induk_id", unitId).single(),
        client.from("asset_import_run_metadata").select("*").eq("import_run_id", session.current_run_id).single(),
        client.from("source_files").select("original_name,byte_size,mime_type,sha256").eq("id", session.source_file_id).eq("unit_induk_id", unitId).single(),
        client.from("import_column_mappings").select("source_column_index,source_header,canonical_field,confidence,mapping_profile_id,confirmed_by,confirmed_at").eq("import_session_id", session.id).eq("unit_induk_id", unitId).order("source_column_index").limit(501),
        client.from("approval_events").select("action,notes,actor_id,created_at").eq("dataset_version_id", versionId).order("created_at", { ascending: false }).limit(100),
        client.from("audit_events").select("action,details,created_at").eq("target_type", "dataset_version").eq("target_id", versionId).order("created_at", { ascending: false }).limit(100), rows(session.current_run_id, unitId, filters),
      ]);
      for (const result of [runResult, metaResult, fileResult, mappingResult, approvalResult, auditResult]) check(result.error);
      const run = runResult.data, meta = metaResult.data, file = fileResult.data;
      if (!run || !meta || !file || (mappingResult.data?.length ?? 0) > 500) throw new ReviewError("INCOMPLETE_RUN", 409);
      let comparison: Json = { counts: { ADDED: run.expected_row_count } };
      const changes = new Map<string, { kind: string; fields: string[]; evidence: Json }>();
      if (meta.comparison_id) {
        const c = await client.from("version_comparisons").select("summary").eq("id", meta.comparison_id).eq("unit_induk_id", unitId).single(); check(c.error); comparison = c.data?.summary ?? {};
        if (rowPage.data.length) {
          const d = await client.from("asset_version_changes").select("to_row_id,change_kind,changed_fields,evidence").eq("comparison_id", meta.comparison_id).eq("unit_induk_id", unitId).in("to_row_id", rowPage.data.map(row => row.id)).limit(100); check(d.error);
          for (const item of d.data ?? []) if (item.to_row_id) changes.set(item.to_row_id, { kind: item.change_kind, fields: item.changed_fields, evidence: item.evidence });
        }
      }
      return { versionId, versionNumber: version.version_number, unitId, unitName: version.datasets.unit_induk.name, status: version.status, createdAt: version.created_at, fileName: file.original_name,
        expected: { runId: run.id, mappingRevision: session.mapping_revision, layoutHash: meta.layout_hash, baseVersionId: meta.comparison_base_version_id, comparisonId: meta.comparison_id },
        source: { byteSize: file.byte_size, mimeType: file.mime_type, sha256: file.sha256 }, mapping: { layoutHash: meta.layout_hash, ruleVersion: run.rule_version, revision: meta.mapping_revision, provenance: meta.diagnostics, columns: mappingResult.data as Json }, summary: meta.summary, comparison,
        approvals: approvalResult.data ?? [], audit: auditResult.data ?? [], rows: rowPage.data.map(({ asset_valuations, ...row }) => ({ row, value: asset_valuations[0], change: changes.get(row.id) ?? null })), totalRows: rowPage.count, offset: filters.offset, hasMore: filters.offset + rowPage.data.length < rowPage.count };
    },
    async mutate(actorId, action, input) {
      const { data, error } = await client.rpc("review_asset_version", { p_actor_id: actorId, p_version_id: input.versionId, p_action: action, p_expected: input.expected as Json, p_notes: input.notes, p_row_ids: input.rowIds, p_filters: input.filters as unknown as Json, p_promote_mapping: input.promoteMapping });
      if (error) { if (["22023", "23505", "40001"].includes(error.code)) throw new ReviewError("STALE_OR_BLOCKED_REVIEW", 409); if (error.code === "42501") throw new ReviewError("FORBIDDEN", 403); check(error); }
      return data as unknown as ReviewResult;
    },
  };
}
