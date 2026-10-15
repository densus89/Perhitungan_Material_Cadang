import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { MAX_WORKBOOK_BYTES } from "../../domain/asset-import/schemas";

export type ImportTable = keyof Database["public"]["Tables"];
export type Row<T extends ImportTable> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends ImportTable> = Database["public"]["Tables"][T]["Insert"];
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
  submit(actorId: string, versionId: string): Promise<void>;
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
        const { data, error } = await client.from(table).select("*").match(filters).order(table === "asset_valuations" ? "asset_row_id" : "id").range(offset, offset + 999);
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
    async submit(actorId, versionId) { const { error } = await client.rpc("submit_asset_version", { p_actor_id: actorId, p_version_id: versionId }); check(error); },
  };
}
