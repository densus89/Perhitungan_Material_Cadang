import type { Tables, TablesInsert, TablesUpdate } from "../../src/lib/supabase/database.types";

// Compile-only regression, included by tsc --noEmit. Never call this function.
// Each expect-error becomes a TS2578 failure if typegen makes these writable.
export function generatedGiKeysAreReadOnly(
  row: Tables<"gi_location_references">,
  insert: TablesInsert<"gi_location_references">,
  update: TablesUpdate<"gi_location_references">,
) {
  // @ts-expect-error PostgreSQL GENERATED ALWAYS rejects an inserted UPT key.
  insert.upt_key = "FORBIDDEN";
  // @ts-expect-error PostgreSQL GENERATED ALWAYS rejects an inserted GI key.
  insert.nama_gi_key = "FORBIDDEN";
  // @ts-expect-error PostgreSQL GENERATED ALWAYS rejects an updated UPT key.
  update.upt_key = "FORBIDDEN";
  // @ts-expect-error PostgreSQL GENERATED ALWAYS rejects an updated GI key.
  update.nama_gi_key = "FORBIDDEN";

  // Reading generated keys remains legal and retains the database nullability.
  return [row.upt_key, row.nama_gi_key] satisfies (string | null)[];
}
