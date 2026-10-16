import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { MAX_WORKBOOK_BYTES } from "../../domain/asset-import/schemas";
import type { AssetSheetMapping } from "../../domain/asset-import/types";
import type { Json } from "../../lib/supabase/database.types";

export type ImportTable = keyof Database["public"]["Tables"];
export type Row<T extends ImportTable> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends ImportTable> = Database["public"]["Tables"][T]["Insert"];
export interface MappingReplacement { importId: string; sheetId: string; expectedRevision: string; mapping: AssetSheetMapping; layoutHash: string; canonicalHash: string; ruleVersion: string; sourceHash: string }
export interface ProcessingReservation { importId: string; expectedRevision: string; run: { id: string; expected_row_count: number; expected_valuation_count: number; source_hash: string; mapping_hash: string; rule_version: string; expected_rows_hash: string; expected_valuations_hash: string } }
export interface ExpectedSubmission { runId: string; mappingRevision: string; layoutHash: string; baseVersionId: string | null; comparisonId: string | null }
export interface ImportDependencies {
  id(): string;
  now(): string;
  list<T extends ImportTable>(table: T, filters: Partial<Row<T>>): Promise<Row<T>[]>;
  insert<T extends ImportTable>(table: T, rows: Insert<T>[]): Promise<Row<T>[]>;
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

/** The generic adapter never takes its table/filters from a request body. */
export function createImportDependencies(client: SupabaseClient<Database>): ImportDependencies {
  function check(error: unknown) { if (error) throw new Error("Import persistence unavailable"); }
  return {
    id: randomUUID, now: () => new Date().toISOString(),
    async list(table, filters) {
      // Paginate all private reads: PostgREST's default 1000-row cap is not completeness.
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const key = table === "asset_valuations" ? "asset_row_id" : table === "asset_import_run_metadata" ? "import_run_id" : "id";
        const { data, error } = await client.from(table).select("*").match(filters).order(key).range(offset, offset + 999);
        check(error); rows.push(...data ?? []); if (!data || data.length < 1000) break;
      }
      return rows as never;
    },
    async insert(table, rows) {
      if (!rows.length || rows.length > 1000) throw new Error("Invalid import batch");
      const { data, error } = await client.from(table).insert(rows as never).select(); check(error);
      if (data?.length !== rows.length) throw new Error("Incomplete import batch");
      return data as never;
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
    async reserve(actorId, input) { const { error } = await client.rpc("reserve_asset_import_run", { p_actor_id: actorId, p_import_id: input.importId, p_expected_revision: input.expectedRevision, p_run: input.run }); check(error); },
    async failRun(actorId, runId) { const { error } = await client.rpc("fail_asset_import_run", { p_actor_id: actorId, p_run_id: runId }); check(error); },
    async sealComparison(actorId, runId, baseVersionId, comparisonId) { const { error } = await client.rpc("complete_asset_import_comparison", { p_actor_id: actorId, p_run_id: runId, p_base_version_id: baseVersionId!, p_comparison_id: comparisonId! }); check(error); },
    async submit(actorId, versionId, expected) { const { error } = await client.rpc("submit_asset_version", { p_actor_id: actorId, p_version_id: versionId, p_expected_run_id: expected.runId, p_expected_mapping_revision: expected.mappingRevision, p_expected_layout_hash: expected.layoutHash, p_expected_base_version_id: expected.baseVersionId!, p_expected_comparison_id: expected.comparisonId! }); check(error); },
  };
}
