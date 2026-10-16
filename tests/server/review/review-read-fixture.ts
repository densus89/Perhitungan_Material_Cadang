import { vi } from "vitest";
import { reviewDetail, reviewId } from "../../fixtures/asset-version-review";
export const unit = "71000000-0000-4000-8000-000000000001", fromRun = "72000000-0000-4000-8000-000000000001", comparisonId = "73000000-0000-4000-8000-000000000001";
export function readFixture() {
  const state = { ...structuredClone(reviewDetail), unitId: unit, datasetId: reviewId, importId: reviewId, runId: reviewId, sourceFileId: reviewId, mappingCount: 16384, eligibleDraftTrash: false, expected: { runId: reviewId, mappingRevision: reviewId, layoutHash: "a".repeat(64), baseVersionId: fromRun, comparisonId }, mapping: { ...reviewDetail.mapping, total: 16384, offset: 0, hasMore: true, columns: [] } };
  const tables: Record<string, Record<string, unknown>[]> = { asset_version_changes: [], asset_snapshot_rows: [], import_column_mappings: [], approval_events: [], audit_events: [], version_comparisons: [{ id: comparisonId, dataset_id: reviewId, unit_induk_id: unit, from_run_id: fromRun, to_run_id: reviewId, summary: { counts: { REMOVED: 101, CHANGED: 1 } } }] };
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = { rpc: vi.fn(async (name: string) => ({ data: name === "get_asset_version_review_state" ? structuredClone(state) : { versionId: reviewId, status: "ACTIVE", previousVersionId: fromRun }, error: null })), from(table: string) {
    let rows = [...(tables[table] ?? [])], single = false, head = false, start = 0, end = 100000;
    const methods = ["select", "eq", "neq", "in", "order", "range", "limit", "single", "maybeSingle"];
    const chain = Object.fromEntries(methods.map(method => [method, (...args: unknown[]) => {
      calls.push({ table, method, args });
      if (method === "select") head = Boolean((args[1] as { head?: boolean } | undefined)?.head);
      if (method === "eq") rows = rows.filter(row => row[String(args[0])] === args[1]);
      if (method === "neq") rows = rows.filter(row => row[String(args[0])] !== args[1]);
      if (method === "in") rows = rows.filter(row => (args[1] as unknown[]).includes(row[String(args[0])]));
      if (method === "range") { start = Number(args[0]); end = Number(args[1]); }
      if (method === "limit") end = Number(args[0]) - 1;
      if (["single", "maybeSingle"].includes(method)) single = true;
      return chain;
    }]));
    return Object.assign(chain, { then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) { const page = rows.slice(start, end + 1); return Promise.resolve({ data: head ? null : single ? page[0] ?? null : page, count: rows.length, error: null }).then(resolve, reject); } });
  } };
  return { state, tables, calls, client };
}
export function side(id: string, run: string, amount: number, unitId = unit) { return { ...structuredClone(reviewDetail.rows[0].row), id, unit_induk_id: unitId, import_run_id: run, source_row_number: 2, nama_peralatan: "ACTUAL STORED ASSET", provenance: { rawCell: "PRIVATE_RAW_SECRET" }, asset_valuations: [{ ...structuredClone(reviewDetail.rows[0].value), asset_row_id: id, nilai_abc: amount, selected_donor_ids: ["NATIONAL_DONOR_SECRET"], donor_evidence: { tier: "NATIONAL", candidateCount: 3, median: 100, donors: [{ id: "NATIONAL_DONOR_SECRET", provenance: "PRIVATE_RAW_SECRET" }] }, calculation_evidence: { referencePrice: 100, ageYears: 20, age: { status: "AGE_IMPUTED", years: 20, tier: "NATIONAL", donorIds: ["NATIONAL_DONOR_SECRET"], cohort: [{ raw: "PRIVATE_RAW_SECRET" }] }, comparables: { donors: ["NATIONAL_DONOR_SECRET"] } } }] }; }
