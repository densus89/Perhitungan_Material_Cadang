import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "../../domain/access";
import type { Database, Json } from "../../lib/supabase/database";
import { importReviewQuerySchema, type ImportReviewQuery } from "../../domain/asset-import/schemas";
import { comparisonQuerySchema, expectedReviewSchema, mappingQuerySchema, reviewActionSchema, reviewFiltersSchema, type ComparisonQuery, type MappingPage, type ReviewAction, type ReviewComparisonPage, type ReviewDetail, type ReviewFilters, type ReviewQueue, type ReviewResult, type ReviewRow, type ReviewState } from "../../features/import/review-contracts";
export class ReviewError extends Error { constructor(public code: string, public status: number) { super(code); } }
export function assertReviewer(actor: Actor) { if (actor.status !== "ACTIVE" || !["RST_ADMIN", "RST_REVIEWER"].includes(actor.role)) throw new ReviewError("FORBIDDEN", 403); }
export interface ReviewDependencies {
  queue(filters: ReviewFilters): Promise<ReviewQueue>;
  state(versionId: string): Promise<ReviewState>;
  read(versionId: string, filters: ImportReviewQuery): Promise<ReviewDetail>;
  comparison(versionId: string, options: ComparisonQuery): Promise<ReviewComparisonPage>;
  mapping(versionId: string, offset: number): Promise<MappingPage>;
  mutate(actorId: string, action: "RETURN" | "ACTIVATE" | "ACKNOWLEDGE" | "TRASH", input: ReviewAction): Promise<ReviewResult>;
}
export async function listPendingAssetVersions(actor: Actor, filters: unknown, deps: ReviewDependencies) { assertReviewer(actor); const input = reviewFiltersSchema.safeParse(filters); if (!input.success) throw new ReviewError("INVALID_INPUT", 422); return deps.queue(input.data); }
export async function loadAssetVersionReview(actor: Actor, versionId: string, deps: ReviewDependencies, filters: ImportReviewQuery = { offset: 0, filter: "ALL" }) { assertReviewer(actor); return deps.read(versionId, importReviewQuerySchema.parse(filters)); }
export async function loadAssetVersionComparison(actor: Actor, versionId: string, deps: ReviewDependencies, options: ComparisonQuery) { assertReviewer(actor); return deps.comparison(versionId, comparisonQuerySchema.parse(options)); }
export async function loadAssetVersionMapping(actor: Actor, versionId: string, deps: ReviewDependencies, offset: number) { assertReviewer(actor); return deps.mapping(versionId, mappingQuerySchema.parse({ offset }).offset); }
async function action(actor: Actor, raw: unknown, deps: ReviewDependencies, operation: "RETURN" | "ACTIVATE" | "TRASH") {
  assertReviewer(actor); if (operation === "TRASH" && actor.role !== "RST_ADMIN") throw new ReviewError("FORBIDDEN", 403);
  const parsed = reviewActionSchema.safeParse(raw); if (!parsed.success) throw new ReviewError("INVALID_INPUT", 422);
  const input = parsed.data, state = await deps.state(input.versionId), draft = "kind" in input.expected;
  if (!isDeepStrictEqual(state.expected, input.expected) || operation !== "TRASH" && (draft || state.status !== "PENDING_RST") || operation === "TRASH" && (draft ? state.status !== "DRAFT" || !state.eligibleDraftTrash : !["HISTORICAL", "NEEDS_FIX", "REJECTED", "DRAFT", "READY_TO_SUBMIT"].includes(state.status))) throw new ReviewError("STALE_REVIEW", 409);
  // Readiness does not load any mapping or row display page. The locked RPC
  // validates the complete mapping and authoritative run/comparison gates.
  return deps.mutate(actor.userId, operation === "ACTIVATE" ? input.mode : operation, input);
}
export const returnAssetVersion = (actor: Actor, input: unknown, deps: ReviewDependencies) => action(actor, input, deps, "RETURN");
export const approveAndActivateAssetVersion = (actor: Actor, input: unknown, deps: ReviewDependencies) => action(actor, input, deps, "ACTIVATE");
export const trashAssetVersion = (actor: Actor, input: unknown, deps: ReviewDependencies) => action(actor, input, deps, "TRASH");

const ROW_COLUMNS = "id,import_run_id,unit_induk_id,dataset_version_id,import_sheet_id,source_row_number,unit_induk,upt,nama_gi,bay_penghantar,tid,no_aset,nama_peralatan,spesifikasi_mara,jumlah,satuan,kondisi_aset,tanggal_operasi,usia_aset_tahun,kode_class_asset,kode_jenis,kode_subjenis,nilai_buku_sap,harga_pengadaan_saat_ini,tanggal_referensi_harga,nilai_abc_input,kode_material,keterangan,error_codes,warning_codes,created_at,asset_valuations!inner(*)" as const;
type PersistedRow = Database["public"]["Tables"]["asset_snapshot_rows"]["Row"];
type PersistedValue = Database["public"]["Tables"]["asset_valuations"]["Row"];
const object = (value: Json | undefined): Record<string, Json | undefined> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function evidence(value: Json | undefined, keys: string[]): Json { const source = object(value); return Object.fromEntries(keys.flatMap(key => { const item = source[key]; return typeof item === "string" && item.length <= 512 || typeof item === "number" && Number.isFinite(item) || item === null ? [[key, item]] : []; })); }
function safeSide(row: Omit<PersistedRow, "provenance"> & { provenance?: Json }, value: PersistedValue): Omit<ReviewRow, "change"> {
  const rowCopy = { ...row }; delete rowCopy.provenance;
  const { selected_donor_ids: donorIds, ...rest } = value;
  const calculation = object(value.calculation_evidence), age = object(calculation.age);
  return { row: rowCopy, value: { ...rest,
    donor_evidence: { ...object(evidence(value.donor_evidence, ["status", "tier", "median", "candidateCount", "min", "max", "dispersion"])), donorCount: donorIds?.length ?? 0 },
    calculation_evidence: { ...object(evidence(value.calculation_evidence, ["referencePrice", "priceDate", "ageYears", "usefulLifeYears"])), age: { ...object(evidence(calculation.age, ["years", "status", "tier"])), donorCount: Array.isArray(age.donorIds) ? age.donorIds.length : 0 }, comparables: evidence(calculation.comparables, ["status", "tier", "median", "candidateCount", "min", "max", "dispersion"]) },
  } };
}

/** State is small. Mapping, row and comparison evidence use independent pages;
 * no read scans an entire run or serializes a complete wide mapping. */
export function createReviewDependencies(client: SupabaseClient<Database>): ReviewDependencies {
  function check(error: unknown) { if (error) throw new ReviewError("REVIEW_UNAVAILABLE", 503); }
  async function state(versionId: string): Promise<ReviewState> {
    const { data, error } = await client.rpc("get_asset_version_review_state", { p_version_id: versionId }); check(error);
    if (!data) throw new ReviewError("NOT_FOUND", 404);
    const result = data as unknown as ReviewState, expected = expectedReviewSchema.safeParse(result.expected);
    if (result.versionId !== versionId || !expected.success) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
    return { ...result, expected: expected.data };
  }
  async function mappingPage(context: ReviewState, offset: number): Promise<MappingPage> {
    const { data, error, count } = await client.from("import_column_mappings").select("source_column_index,source_header,canonical_field,confidence,mapping_profile_id,confirmed_by,confirmed_at", { count: "exact" }).eq("import_session_id", context.importId).eq("unit_induk_id", context.unitId).order("source_column_index").range(offset, offset + 99); check(error);
    if (!data || count === null || data.length > 100) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
    return { columns: data, total: count, offset, hasMore: offset + data.length < count };
  }
  async function rows(runId: string, unitId: string, input: ImportReviewQuery) {
    let query = client.from("asset_snapshot_rows").select(ROW_COLUMNS, { count: "exact" }).eq("import_run_id", runId).eq("unit_induk_id", unitId);
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
    state,
    async mapping(versionId, offset) { return mappingPage(await state(versionId), mappingQuerySchema.parse({ offset }).offset); },
    async comparison(versionId, options) {
      const input = comparisonQuerySchema.parse(options), context = await state(versionId), expected = context.expected;
      if ("kind" in expected) return { changes: [], total: 0, offset: input.offset, hasMore: false };
      if (!expected.comparisonId) {
        if (expected.baseVersionId !== null || !context.runId) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
        if (!["ALL", "ADDED"].includes(input.kind)) return { changes: [], total: 0, offset: input.offset, hasMore: false };
        const page = await rows(context.runId, context.unitId, { offset: input.offset, filter: "ALL" });
        return { changes: page.data.map(({ asset_valuations, ...row }) => { if (asset_valuations.length !== 1 || row.unit_induk_id !== context.unitId || row.import_run_id !== context.runId) throw new ReviewError("REVIEW_UNAVAILABLE", 503); return { id: row.id, identity: row.no_aset ?? row.id, kind: "ADDED", fields: [], before: null, after: safeSide(row, asset_valuations[0]) }; }), total: page.count, offset: input.offset, hasMore: input.offset + page.data.length < page.count };
      }
      const { data: comparison, error: comparisonError } = await client.from("version_comparisons").select("id,from_run_id,to_run_id").eq("id", expected.comparisonId).eq("dataset_id", context.datasetId).eq("unit_induk_id", context.unitId).single(); check(comparisonError);
      if (!comparison || comparison.to_run_id !== context.runId) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
      let query = client.from("asset_version_changes").select("id,identity_key,change_kind,from_row_id,to_row_id,changed_fields", { count: "exact" }).eq("comparison_id", comparison.id).eq("unit_induk_id", context.unitId);
      if (input.kind !== "ALL") query = query.eq("change_kind", input.kind);
      const { data, error, count } = await query.order("identity_key").order("id").range(input.offset, input.offset + 99); check(error);
      if (!data || count === null || data.length > 100) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
      async function sides(ids: (string | null)[], runId: string) {
        const selected = [...new Set(ids.filter((id): id is string => Boolean(id)))]; if (!selected.length) return new Map<string, Omit<ReviewRow, "change">>();
        if (selected.length > 100) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
        const result = await client.from("asset_snapshot_rows").select(ROW_COLUMNS).eq("unit_induk_id", context.unitId).eq("import_run_id", runId).in("id", selected).limit(100); check(result.error);
        if (!result.data || result.data.length !== selected.length) throw new ReviewError("REVIEW_UNAVAILABLE", 503);
        return new Map(result.data.map(({ asset_valuations, ...row }) => { if (row.unit_induk_id !== context.unitId || row.import_run_id !== runId || !selected.includes(row.id) || asset_valuations.length !== 1) throw new ReviewError("REVIEW_UNAVAILABLE", 503); return [row.id, safeSide(row, asset_valuations[0])]; }));
      }
      const [before, after] = await Promise.all([sides(data.map(item => item.from_row_id), comparison.from_run_id), sides(data.map(item => item.to_row_id), comparison.to_run_id)]);
      return { changes: data.map(item => ({ id: item.id, identity: item.identity_key, kind: item.change_kind, fields: item.changed_fields, before: item.from_row_id ? before.get(item.from_row_id)! : null, after: item.to_row_id ? after.get(item.to_row_id)! : null })), total: count, offset: input.offset, hasMore: input.offset + data.length < count };
    },
    async queue(filters) {
      // Filter current-run aggregates in SQL before pagination; never filter only an arbitrary first page.
      const { data, error } = await client.rpc("list_asset_version_reviews", { p_filters: filters as unknown as Json }); check(error);
      return data as unknown as ReviewQueue;
    },
    async read(versionId, filters) {
      const context = await state(versionId);
      const [mapping, approval, audit, page] = await Promise.all([mappingPage(context, 0),
        client.from("approval_events").select("action,notes,actor_id,created_at").eq("dataset_version_id", versionId).order("created_at", { ascending: false }).limit(100),
        client.from("audit_events").select("action,details,created_at").eq("target_type", "dataset_version").eq("target_id", versionId).order("created_at", { ascending: false }).limit(100), context.runId ? rows(context.runId, context.unitId, filters) : { data: [], count: 0 }]);
      check(approval.error); check(audit.error);
      const completeCount = object(context.summary).rowCount;
      let comparison: Json = { counts: { ADDED: typeof completeCount === "number" ? completeCount : 0 } };
      if (!("kind" in context.expected) && context.expected.comparisonId) { const result = await client.from("version_comparisons").select("summary").eq("id", context.expected.comparisonId).eq("unit_induk_id", context.unitId).single(); check(result.error); comparison = result.data?.summary ?? {}; }
      return { ...context, mapping: { ...context.mapping, ...mapping }, comparison, approvals: approval.data ?? [], audit: audit.data ?? [], rows: page.data.map(({ asset_valuations, ...row }) => { if (asset_valuations.length !== 1) throw new ReviewError("REVIEW_UNAVAILABLE", 503); return { ...safeSide(row, asset_valuations[0]), change: null }; }), totalRows: page.count, offset: filters.offset, hasMore: filters.offset + page.data.length < page.count };
    },
    async mutate(actorId, action, input) {
      const { data, error } = await client.rpc("review_asset_version", { p_actor_id: actorId, p_version_id: input.versionId, p_action: action, p_expected: input.expected as Json, p_notes: input.notes, p_row_ids: input.rowIds, p_filters: input.filters as unknown as Json, p_promote_mapping: input.promoteMapping });
      if (error) { if (["22023", "23505", "40001"].includes(error.code)) throw new ReviewError("STALE_OR_BLOCKED_REVIEW", 409); if (error.code === "42501") throw new ReviewError("FORBIDDEN", 403); check(error); }
      return data as unknown as ReviewResult;
    },
  };
}
