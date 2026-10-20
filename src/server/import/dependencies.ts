import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database";
import { MAX_WORKBOOK_BYTES, importReviewQuerySchema, type ImportReviewQuery } from "../../domain/asset-import/schemas";
import type { AssetSheetMapping } from "../../domain/asset-import/types";
import type { Json } from "../../lib/supabase/database";

export type ImportTable = keyof Database["public"]["Tables"];
export type Row<T extends ImportTable> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends ImportTable> = Database["public"]["Tables"][T]["Insert"];
export type ReviewPageRow = Pick<Row<"asset_snapshot_rows">, "id" | "source_row_number" | "nama_peralatan" | "error_codes" | "warning_codes">;
export type ReviewPageValue = Pick<Row<"asset_valuations">, "asset_row_id" | "nilai_abc" | "value_source" | "age_status" | "selected_donor_ids" | "donor_evidence" | "calculation_evidence">;
export interface MappingReplacement { importId: string; sheetId: string; expectedRevision: string; mapping: AssetSheetMapping; layoutHash: string; canonicalHash: string; ruleVersion: string; sourceHash: string }
export interface ProcessingReservation { importId: string; expectedRevision: string; run: { id: string; expected_row_count: number; expected_valuation_count: number; source_hash: string; mapping_hash: string; rule_version: string; expected_rows_hash: string; expected_valuations_hash: string } }
export interface ExpectedSubmission { runId: string; mappingRevision: string; layoutHash: string; baseVersionId: string | null; comparisonId: string | null }
export interface ImportDependencies {
  reviewPage(unitId: string, runId: string, options: ImportReviewQuery): Promise<{ rows: ReviewPageRow[]; totalRows: number }>;
  reviewValues(unitId: string, runId: string, rowIds: string[]): Promise<ReviewPageValue[]>;
  id(): string;
  now(): string;
  list<T extends ImportTable>(table: T, filters: Partial<Row<T>>): Promise<Row<T>[]>;
  insert<T extends ImportTable>(table: T, rows: Insert<T>[]): Promise<Row<T>[]>;
  insertBatch<T extends "asset_snapshot_rows" | "asset_valuations" | "asset_version_changes">(table: T, rows: Insert<T>[]): Promise<void>;
  insertAssetBatch(actorId: string, runId: string, rows: Insert<"asset_snapshot_rows">[], valuations: Insert<"asset_valuations">[]): Promise<void>;
  update<T extends ImportTable>(table: T, filters: Partial<Row<T>>, values: Database["public"]["Tables"][T]["Update"]): Promise<void>;
  remove<T extends ImportTable>(table: T, filters: Partial<Row<T>>): Promise<void>;
  sign(path: string): Promise<{ path: string; token: string }>;
  download(path: string): Promise<{ bytes: Uint8Array; size: number; mimeType: string }>;
  finalize(actorId: string, runId: string): Promise<void>;
  replaceMapping(actorId: string, input: MappingReplacement): Promise<void>;
  reserve(actorId: string, input: ProcessingReservation): Promise<void>;
  failRun(actorId: string, runId: string): Promise<void>;
  sealComparison(actorId: string, runId: string, baseVersionId: string | null, comparisonId: string | null): Promise<void>;
  submit(actorId: string, versionId: string, expected: ExpectedSubmission): Promise<void>;
}

export const ASSET_ROW_BATCH_COLUMNS = [
  "id", "import_run_id", "unit_induk_id", "dataset_version_id", "import_sheet_id", "source_row_number",
  "unit_induk", "upt", "nama_gi", "bay_penghantar", "tid", "no_aset", "nama_peralatan", "spesifikasi_mara",
  "jumlah", "satuan", "kondisi_aset", "tanggal_operasi", "usia_aset_tahun", "kode_class_asset", "kode_jenis",
  "kode_subjenis", "nilai_buku_sap", "harga_pengadaan_saat_ini", "tanggal_referensi_harga", "nilai_abc_input",
  "kode_material", "keterangan", "provenance", "error_codes", "warning_codes", "created_at",
] as const satisfies readonly (keyof Insert<"asset_snapshot_rows">)[];

export const ASSET_VALUATION_BATCH_COLUMNS = [
  "asset_row_id", "import_run_id", "unit_induk_id", "dataset_version_id", "nilai_abc", "harga_pengadaan_saat_ini",
  "value_source", "calculation_method", "age_status", "age_years", "useful_life_years", "useful_life_rule_id",
  "rule_version", "as_of", "manual_approval_required", "approved_by", "approved_at", "approval_notes",
  "selected_donor_ids", "donor_evidence", "calculation_evidence", "warning_codes", "created_at",
] as const satisfies readonly (keyof Insert<"asset_valuations">)[];

export function packedRecords(records: Record<string, unknown>[], columns: readonly string[]): Json {
  if (!records.length || !columns.length) throw new Error("Empty packed batch");
  if (records.some((record) => Object.keys(record).length !== columns.length || columns.some((column) => !(column in record)))) throw new Error("Inconsistent packed batch");
  return records.map((record) => columns.map((column) => record[column] === undefined ? null : record[column])) as Json;
}

/** The generic adapter never takes its table/filters from a request body. */
export function createImportDependencies(client: SupabaseClient<Database>): ImportDependencies {
  function check(error: unknown) { if (error) throw new Error("Import persistence unavailable"); }
  return {
    id: randomUUID, now: () => new Date().toISOString(),
    async reviewPage(unitId, runId, input) {
      const options = importReviewQuerySchema.parse(input);
      let query = client.from("asset_snapshot_rows").select("id,source_row_number,nama_peralatan,error_codes,warning_codes,asset_valuations!inner(asset_row_id)", { count: "exact" })
        .eq("unit_induk_id", unitId).eq("import_run_id", runId);
      if (options.filter === "ERROR") query = query.not("error_codes", "eq", "{}");
      if (options.filter === "WARNING") query = query.not("warning_codes", "eq", "{}");
      if (options.filter === "ESTIMATED") query = query.in("asset_valuations.value_source", ["SYSTEM_DEPRECIATION", "ESTIMATED_SAME_GI", "ESTIMATED_SAME_UPT", "ESTIMATED_SAME_UNIT", "ESTIMATED_NEAREST_LOCATION", "ESTIMATED_NATIONAL"]);
      if (options.filter === "AGE_IMPUTED") query = query.eq("asset_valuations.age_status", "AGE_IMPUTED");
      if (options.issue) query = query.or("error_codes.cs.{" + options.issue + "},warning_codes.cs.{" + options.issue + "}");
      if (options.source) query = query.eq("asset_valuations.value_source", options.source);
      if (options.condition === "MISSING") query = query.is("kondisi_aset", null);
      else if (options.condition) query = query.eq("kondisi_aset", options.condition);
      if (options.search) query = query.ilike("nama_peralatan", "%" + options.search.replace(/[\\%_]/g, "\\$&") + "%");
      const { data, error, count } = await query.order("source_row_number").order("id").range(options.offset, options.offset + 99);
      check(error);
      if (!data || data.length > 100 || count === null) throw new Error("Review page unavailable");
      return { rows: data.map(({ id, source_row_number, nama_peralatan, error_codes, warning_codes }) => ({ id, source_row_number, nama_peralatan, error_codes, warning_codes })), totalRows: count };
    },
    async reviewValues(unitId, runId, rowIds) {
      if (rowIds.length > 100) throw new Error("Invalid review page");
      if (!rowIds.length) return [];
      const { data, error } = await client.from("asset_valuations").select("asset_row_id,nilai_abc,value_source,age_status,selected_donor_ids,donor_evidence,calculation_evidence")
        .eq("unit_induk_id", unitId).eq("import_run_id", runId).in("asset_row_id", rowIds).limit(100);
      check(error);
      if (!data || data.length > 100) throw new Error("Review evidence unavailable");
      return data;
    },
    async list(table, filters) {
      // PostgREST caps responses at 1000 rows. Fetch immutable import pages in
      // bounded parallel windows so a unit-scale reconciliation is complete
      // without spending the whole function budget on serial round-trips.
      const key = table === "asset_valuations" ? "asset_row_id" : table === "asset_import_run_metadata" ? "import_run_id" : "id";
      const first = await client.from(table).select("*", { count: "exact" }).match(filters).order(key).range(0, 999);
      check(first.error);
      const rows: unknown[] = [...first.data ?? []];
      if (first.count === null || first.count === undefined) {
        for (let offset = 1000; rows.length === offset; offset += 1000) {
          const { data, error } = await client.from(table).select("*").match(filters).order(key).range(offset, offset + 999);
          check(error); rows.push(...data ?? []); if (!data || data.length < 1000) break;
        }
        return rows as never;
      }
      const offsets = Array.from({ length: Math.max(0, Math.ceil(first.count / 1000) - 1) }, (_, index) => (index + 1) * 1000);
      for (let index = 0; index < offsets.length; index += 8) {
        const pages = await Promise.all(offsets.slice(index, index + 8).map(async (offset) => {
          const { data, error } = await client.from(table).select("*").match(filters).order(key).range(offset, offset + 999);
          check(error); return data ?? [];
        }));
        for (const page of pages) rows.push(...page);
      }
      if (rows.length !== first.count) throw new Error("Incomplete import read");
      return rows as never;
    },
    async insert(table, rows) {
      if (!rows.length || rows.length > 1000) throw new Error("Invalid import batch");
      const { data, error } = await client.from(table).insert(rows as never).select(); check(error);
      if (data?.length !== rows.length) throw new Error("Incomplete import batch");
      return data as never;
    },
    async insertBatch(table, rows) {
      if (!rows.length || rows.length > 1000) throw new Error("Invalid import batch");
      const { error, count } = await client.from(table).insert(rows as never, { count: "exact" });
      if (error || count !== rows.length) console.warn("ASSET_IMPORT_PERSISTENCE " + JSON.stringify({ operation: "insertBatch", table, code: error?.code ?? "COUNT_MISMATCH" }));
      check(error);
      if (count !== rows.length) throw new Error("Incomplete import batch");
    },
    async insertAssetBatch(actorId, runId, rows, valuations) {
      if (!rows.length || rows.length > 3000 || valuations.length !== rows.length) throw new Error("Invalid asset import batch");
      const { data, error } = await client.rpc("insert_asset_import_batch", {
        p_actor_id: actorId,
        p_run_id: runId,
        p_rows: packedRecords(rows as Record<string, unknown>[], ASSET_ROW_BATCH_COLUMNS),
        p_valuations: packedRecords(valuations as Record<string, unknown>[], ASSET_VALUATION_BATCH_COLUMNS),
      });
      if (error || data !== rows.length) console.warn("ASSET_IMPORT_PERSISTENCE " + JSON.stringify({ operation: "insertAssetBatch", code: error?.code ?? "COUNT_MISMATCH" }));
      check(error);
      if (data !== rows.length) throw new Error("Incomplete asset import batch");
    },
    async update(table, filters, values) { const { error } = await client.from(table).update(values as never).match(filters); check(error); },
    async remove(table, filters) { const { error } = await client.from(table).delete().match(filters); check(error); },
    async sign(path) {
      const { data, error } = await client.storage.from("source-files").createSignedUploadUrl(path, { upsert: false }); check(error);
      if (!data || data.path !== path) throw new Error("Upload signing unavailable");
      return { path: data.path, token: data.token };
    },
    async download(path) {
      const bucket = client.storage.from("source-files");
      const { data: info, error: infoError } = await bucket.info(path); check(infoError);
      const size = Number(info?.size ?? info?.metadata?.size), mimeType = String(info?.contentType ?? info?.metadata?.mimetype ?? "");
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_WORKBOOK_BYTES) throw new Error("Invalid stored workbook");
      const { data, error } = await bucket.download(path); check(error);
      if (!data || data.size !== size) throw new Error("Incomplete stored workbook");
      return { bytes: new Uint8Array(await data.arrayBuffer()), size, mimeType };
    },
    async finalize(actorId, runId) { const { error } = await client.rpc("finalize_asset_import_run", { p_actor_id: actorId, p_run_id: runId }); check(error); },
    async replaceMapping(actorId, input) { const { error } = await client.rpc("replace_asset_import_mapping", { p_actor_id: actorId, p_import_id: input.importId, p_sheet_id: input.sheetId, p_expected_revision: input.expectedRevision, p_mapping: input.mapping as unknown as Json, p_layout_hash: input.layoutHash, p_canonical_hash: input.canonicalHash, p_rule_version: input.ruleVersion, p_source_hash: input.sourceHash }); check(error); },
    async reserve(actorId, input) {
      const { error } = await client.rpc("reserve_asset_import_run", { p_actor_id: actorId, p_import_id: input.importId, p_expected_revision: input.expectedRevision, p_run: input.run });
      if (error) console.warn("ASSET_IMPORT_PERSISTENCE " + JSON.stringify({ operation: "reserve", code: error.code }));
      check(error);
    },
    async failRun(actorId, runId) { const { error } = await client.rpc("fail_asset_import_run", { p_actor_id: actorId, p_run_id: runId }); check(error); },
    async sealComparison(actorId, runId, baseVersionId, comparisonId) { const { error } = await client.rpc("complete_asset_import_comparison", { p_actor_id: actorId, p_run_id: runId, p_base_version_id: baseVersionId!, p_comparison_id: comparisonId! }); check(error); },
    async submit(actorId, versionId, expected) { const { error } = await client.rpc("submit_asset_version", { p_actor_id: actorId, p_version_id: versionId, p_expected_run_id: expected.runId, p_expected_mapping_revision: expected.mappingRevision, p_expected_layout_hash: expected.layoutHash, p_expected_base_version_id: expected.baseVersionId!, p_expected_comparison_id: expected.comparisonId! }); check(error); },
  };
}
