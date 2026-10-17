import "server-only";
import { createHash } from "node:crypto";
import { normalizeAssetText } from "../../domain/asset-import/useful-life";
import type { Row, Insert } from "./dependencies";

type SnapshotRow = Row<"asset_snapshot_rows">;
export type ComparisonRow = Pick<SnapshotRow, "id" | "no_aset" | "unit_induk" | "upt" | "nama_gi" | "bay_penghantar" | "tid" | "nama_peralatan" | "spesifikasi_mara" | "satuan"> & Partial<SnapshotRow>;
export type ComparisonValue = Pick<Row<"asset_valuations">, "asset_row_id" | "nilai_abc" | "value_source">;
export interface ComparisonInput { before: readonly ComparisonRow[]; after: readonly ComparisonRow[]; beforeValues: readonly ComparisonValue[]; afterValues: readonly ComparisonValue[] }
interface ComparisonScope { comparisonId: string; unitId: string; fields: readonly (keyof SnapshotRow)[] }

function identity(row: ComparisonRow) {
  return row.no_aset?.trim() ? "ASSET:" + normalizeAssetText(row.no_aset) : "COMPOSITE:" + createHash("sha256").update(JSON.stringify([row.unit_induk, row.upt, row.nama_gi, row.bay_penghantar, row.tid, row.nama_peralatan, row.spesifikasi_mara, row.satuan].map(normalizeAssetText))).digest("hex");
}
export function compareAssetVersions(input: ComparisonInput, scope: ComparisonScope) {
  // One scan per input. Push preserves duplicate evidence without repeatedly
  // copying a growing group; valuation joins never rescan an entire snapshot.
  const group = (records: readonly ComparisonRow[]) => {
    const map = new Map<string, ComparisonRow[]>();
    for (const row of records) { const key = identity(row), entries = map.get(key); if (entries) entries.push(row); else map.set(key, [row]); }
    return map;
  };
  const oldGroups = group(input.before), newGroups = group(input.after);
  const oldValues = new Map(input.beforeValues.map(value => [value.asset_row_id, value]));
  const newValues = new Map(input.afterValues.map(value => [value.asset_row_id, value]));
  const counts = { ADDED: 0, REMOVED: 0, CHANGED: 0, UNCHANGED: 0, AMBIGUOUS: 0 };
  const changes: Insert<"asset_version_changes">[] = [...new Set([...oldGroups.keys(), ...newGroups.keys()])].sort().map(key => {
    const oldRows = oldGroups.get(key) ?? [], newRows = newGroups.get(key) ?? [], from = oldRows[0], to = newRows[0];
    const previousValue = from ? oldValues.get(from.id) : undefined, nextValue = to ? newValues.get(to.id) : undefined;
    const changed = from && to ? scope.fields.filter(field => from[field] !== to[field]) as string[] : [];
    if (from && to && previousValue?.nilai_abc !== nextValue?.nilai_abc) changed.push("nilai_abc");
    if (from && to && previousValue?.value_source !== nextValue?.value_source) changed.push("value_source");
    const kind = oldRows.length > 1 || newRows.length > 1 ? "AMBIGUOUS" : !from ? "ADDED" : !to ? "REMOVED" : changed.length ? "CHANGED" : "UNCHANGED";
    counts[kind]++;
    return { comparison_id: scope.comparisonId, unit_induk_id: scope.unitId, identity_key: key, change_kind: kind, from_row_id: from?.id ?? null, to_row_id: to?.id ?? null, changed_fields: changed, evidence: { fromCount: oldRows.length, toCount: newRows.length } };
  });
  return { counts, changes };
}
