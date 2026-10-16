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
    async reviewPage(unitId, runId, options) {
      const rows = (tables.asset_snapshot_rows ?? []).filter(row => row.unit_induk_id === unitId && row.import_run_id === runId).filter(row => {
        const value = tables.asset_valuations?.find(value => value.asset_row_id === row.id && value.unit_induk_id === unitId && value.import_run_id === runId);
        const errors = row.error_codes as string[], warnings = row.warning_codes as string[], source = String(value?.value_source ?? "");
        const match = options.filter === "ALL" || options.filter === "ERROR" && errors.length > 0 || options.filter === "WARNING" && warnings.length > 0 || options.filter === "ESTIMATED" && (source.startsWith("ESTIMATED") || source === "SYSTEM_DEPRECIATION") || options.filter === "AGE_IMPUTED" && value?.age_status === "AGE_IMPUTED";
        return match && (!options.issue || [...errors, ...warnings].includes(options.issue)) && (!options.source || value?.value_source === options.source) && (!options.condition || (options.condition === "MISSING" ? row.kondisi_aset == null : row.kondisi_aset === options.condition)) && (!options.search || String(row.nama_peralatan).toLowerCase().includes(options.search.toLowerCase()));
      }).sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number));
      const page = rows.slice(options.offset, options.offset + 100);
      events.push("review:rows:" + page.length);
      return { rows: structuredClone(page) as never, totalRows: rows.length };
    },
    async reviewValues(unitId, runId, rowIds) {
      if (rowIds.length > 100) throw new Error("Review evidence exceeds page");
      events.push("review:values:" + rowIds.length);
      return structuredClone((tables.asset_valuations ?? []).filter(value => value.unit_induk_id === unitId && value.import_run_id === runId && rowIds.includes(String(value.asset_row_id)))) as never;
    },
    async list<T extends ImportTable>(table: T, filters: Partial<Row<T>>) { return structuredClone((tables[table] ?? []).filter((row) => matching(row, filters))) as Row<T>[]; },
    async insert<T extends ImportTable>(table: T, rows: Insert<T>[]) {
      events.push(`insert:${table}:${rows.length}`);
      if (table === failTable) throw new Error("private service failure secret token");
      const values = rows.map((row) => ({ ...(table === "asset_valuations" || table === "asset_import_run_metadata" ? {} : { id: randomUUID() }), ...(table === "import_sessions" ? { mapping_revision: randomUUID() } : {}), created_at: deps.now(), ...row }));
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
      const session = tables.import_sessions.find((row) => row.id === run.import_session_id)!;
      const sheet = tables.import_sheets.find((row) => row.import_session_id === session.id && row.selected)!;
      if (run.mapping_revision !== session.mapping_revision || sheet.layout_hash !== run.mapping_hash) throw new Error("Stale finalization");
      Object.assign(run, { status: "COMPLETE", completed_at: deps.now() });
      session.current_run_id = runId;
      const rows = tables.asset_snapshot_rows.filter((row) => row.import_run_id === runId), values = tables.asset_valuations.filter((row) => row.import_run_id === runId);
      const summary = { rowCount: rows.length, blockingErrors: 0, warningCount: 0, conditions: {} as Record<string, number>, valueSources: {} as Record<string, number>, issueCounts: {} as Record<string, number>, totalNilaiABC: 0 };
      const add = (target: Record<string, number>, key: unknown) => { target[String(key)] = (target[String(key)] ?? 0) + 1; };
      for (const row of rows) { summary.blockingErrors += (row.error_codes as string[]).length; summary.warningCount += (row.warning_codes as string[]).length; add(summary.conditions, row.kondisi_aset ?? "MISSING"); for (const code of [...row.error_codes as string[], ...row.warning_codes as string[]]) add(summary.issueCounts, code); }
      for (const value of values) { add(summary.valueSources, value.value_source); summary.totalNilaiABC += Number(value.nilai_abc ?? 0); }
      (tables.asset_import_run_metadata ??= []).push({ import_run_id: runId, import_session_id: session.id, unit_induk_id: session.unit_induk_id, dataset_version_id: session.dataset_version_id, import_sheet_id: sheet.id, mapping_revision: session.mapping_revision, layout_hash: sheet.layout_hash, diagnostics: structuredClone(sheet.diagnostics), summary, comparison_ready: false, comparison_base_version_id: null, comparison_id: null });
      if (actorId !== actor.userId) throw new Error("Wrong actor");
    },
    async replaceMapping(actorId, input) {
      const session = tables.import_sessions.find((row) => row.id === input.importId)!;
      if (session.mapping_revision !== input.expectedRevision || (tables.asset_import_runs ?? []).some((row) => row.import_session_id === session.id && row.status === "PROCESSING")) throw new Error("Mapping conflict");
      for (const sheet of tables.import_sheets) if (sheet.import_session_id === session.id) sheet.selected = false;
      tables.import_column_mappings = (tables.import_column_mappings ?? []).filter((row) => row.import_session_id !== session.id);
      tables.import_column_mappings.push(...input.mapping.columns.map((column) => ({ id: randomUUID(), import_sheet_id: input.sheetId, import_session_id: session.id, unit_induk_id: session.unit_induk_id, source_column_index: column.columnIndex, source_header: column.header, canonical_field: column.field, confidence: column.confidence, confirmed_by: actorId, confirmed_at: deps.now() })));
      Object.assign(tables.import_sheets.find((row) => row.id === input.sheetId)!, { selected: true, header_row: input.mapping.headerRow, layout_hash: input.layoutHash, diagnostics: { uploadVerified: input.sourceHash, mapping: input.mapping, layoutHash: input.layoutHash, canonicalHash: input.canonicalHash, ruleVersion: input.ruleVersion } });
      session.mapping_revision = randomUUID();
    },
    async reserve(actorId, input) {
      const session = tables.import_sessions.find((row) => row.id === input.importId)!;
      if (session.mapping_revision !== input.expectedRevision || (tables.asset_import_runs ?? []).some((row) => row.import_session_id === session.id && row.status === "PROCESSING")) throw new Error("Reservation conflict");
      await deps.insert("asset_import_runs", [{ ...input.run, import_session_id: input.importId, unit_induk_id: String(session.unit_induk_id), dataset_version_id: String(session.dataset_version_id), created_by: actorId, mapping_revision: input.expectedRevision, status: "PROCESSING" }]);
    },
    async failRun(_actorId, runId) { const run = tables.asset_import_runs.find((row) => row.id === runId); if (run?.status === "PROCESSING") Object.assign(run, { status: "FAILED", failure_code: "PROCESS_FAILED" }); },
    async sealComparison(_actorId, runId, baseVersionId, comparisonId) {
      const run = tables.asset_import_runs.find((row) => row.id === runId)!, session = tables.import_sessions.find((row) => row.id === run.import_session_id)!;
      const dataset = tables.datasets.find((row) => row.id === session.dataset_id)!;
      if (session.current_run_id !== runId || session.mapping_revision !== run.mapping_revision || (dataset.active_version_id ?? null) !== baseVersionId) throw new Error("Stale metadata completion");
      Object.assign(tables.asset_import_run_metadata.find((row) => row.import_run_id === runId)!, { comparison_ready: true, comparison_base_version_id: baseVersionId, comparison_id: comparisonId });
    },
    async submit(_actorId, versionId, expected) {
      const session = tables.import_sessions.find((row) => row.dataset_version_id === versionId)!, dataset = tables.datasets.find((row) => row.id === session.dataset_id)!;
      const run = tables.asset_import_runs.find((row) => row.id === session.current_run_id)!;
      const metadata = tables.asset_import_run_metadata.find((row) => row.import_run_id === run.id)!;
      if (session.current_run_id !== expected.runId || session.mapping_revision !== expected.mappingRevision || run.mapping_hash !== expected.layoutHash || (dataset.active_version_id ?? null) !== expected.baseVersionId || metadata.comparison_id !== expected.comparisonId || !metadata.comparison_ready) throw new Error("Stale submission token");
      events.push("submit"); tables.dataset_versions.find((row) => row.id === versionId)!.status = "PENDING_RST";
    },
  };
  return { deps, tables, objects, events, fail(table: string) { failTable = table; } };
}
