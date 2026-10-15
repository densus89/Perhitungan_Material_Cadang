import { randomUUID } from "node:crypto";
import type { Actor } from "../../../src/domain/access";
import type { ImportDependencies, ImportTable, Row, Insert } from "../../../src/server/import/dependencies";

export const unitId = "10000000-0000-4000-8000-000000000001";
export const actor: Actor = { userId: "20000000-0000-4000-8000-000000000001", email: "synthetic@pln.co.id", displayName: "Synthetic", role: "UNIT_OPERATOR", status: "ACTIVE", unitIndukIds: [unitId] };
export function fakeDependencies() {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const objects = new Map<string, Uint8Array>();
  const events: string[] = [];
  let failTable = "";
  const matching = (record: Record<string, unknown>, filters: Record<string, unknown>) => Object.entries(filters).every(([key, value]) => record[key] === value);
  const deps: ImportDependencies = {
    id: randomUUID, now: () => "2026-10-16T00:00:00.000Z",
    async list<T extends ImportTable>(table: T, filters: Partial<Row<T>>) { return (tables[table] ?? []).filter((row) => matching(row, filters)) as Row<T>[]; },
    async insert<T extends ImportTable>(table: T, rows: Insert<T>[]) {
      events.push(`insert:${table}:${rows.length}`);
      if (table === failTable) throw new Error("private service failure secret token");
      const values = rows.map((row) => ({ ...(table === "asset_valuations" ? {} : { id: randomUUID() }), created_at: deps.now(), ...row }));
      (tables[table] ??= []).push(...values as unknown as Record<string, unknown>[]);
      return values as Row<T>[];
    },
    async update(table, filters, values) {
      for (const row of tables[table] ?? []) if (matching(row, filters)) Object.assign(row, values);
    },
    async remove(table, filters) { tables[table] = (tables[table] ?? []).filter((row) => !matching(row, filters)); },
    async sign(path) { events.push(`sign:${path}`); return { path, token: "synthetic-upload-token" }; },
    async download(path) {
      events.push("download"); const bytes = objects.get(path);
      if (!bytes) throw new Error("Missing private storage object");
      return { bytes, size: bytes.length, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    },
    async finalize(actorId, runId) {
      events.push("finalize");
      const run = tables.asset_import_runs.find((row) => row.id === runId)!;
      Object.assign(run, { status: "COMPLETE", completed_at: deps.now() });
      tables.import_sessions.find((row) => row.id === run.import_session_id)!.current_run_id = runId;
      if (actorId !== actor.userId) throw new Error("Wrong actor");
    },
    async submit(_actorId, versionId) { events.push("submit"); tables.dataset_versions.find((row) => row.id === versionId)!.status = "PENDING_RST"; },
  };
  return { deps, tables, objects, events, fail(table: string) { failTable = table; } };
}
