// @vitest-environment node
import { expect, it, vi } from "vitest";
import { loadImportReview, loadImportDrafts, loadImportComparison } from "../../../src/server/import/workspace";
import { actor, unitId, fakeDependencies } from "./fakes";
import { importResponseSchema } from "../../../src/domain/asset-import/schemas";
import { createImportDependencies } from "../../../src/server/import/dependencies";
vi.mock("server-only", () => ({}));
it("review scopes every read, paginates at 100 and strips donor/raw provenance identifiers", async () => {
  const { deps, tables } = fakeDependencies();
  deps.list = vi.fn(async () => { throw new Error("Full-run scans are forbidden for review"); });
  tables.asset_snapshot_rows = Array.from({ length: 101 }, (_, i) => ({ id: `row-${i}`, unit_induk_id: unitId, import_run_id: "run", source_row_number: i + 2, nama_peralatan: "Synthetic", error_codes: i === 100 ? ["FORMULA_ERROR"] : [], warning_codes: [], provenance: { secret: "private-source" } }));
  tables.asset_snapshot_rows.push({ id: "other", unit_induk_id: "other-unit", import_run_id: "run", source_row_number: 500, nama_peralatan: "Cross unit secret", error_codes: [], warning_codes: [] });
  tables.asset_valuations = tables.asset_snapshot_rows.map(row => ({ asset_row_id: row.id, unit_induk_id: row.unit_induk_id, import_run_id: "run", nilai_abc: 0, value_source: "SAP_BOOK_VALUE", age_status: "PROVIDED_AGE", selected_donor_ids: ["national-private-id"], donor_evidence: { tier: "NATIONAL", donors: [{ id: "national-private-id", raw: "secret" }] }, calculation_evidence: { referencePrice: 200, ageYears: 2, usefulLifeYears: 40, sourceCell: { rawValue: "secret" } } }));
  const review = await loadImportReview(unitId, "run", deps, { offset: 0, filter: "ALL" });
  expect(review.rows).toHaveLength(100); expect(review.hasMore).toBe(true); expect(review.totalRows).toBe(101);
  expect(review.rows[0]).toMatchObject({ value: 0, evidence: { donorCount: 1, tier: "NATIONAL", referencePrice: 200 } });
  expect(JSON.stringify(review)).not.toMatch(/private-source|national-private-id|Cross unit|rawValue|sourceCell/);
  const errors = await loadImportReview(unitId, "run", deps, { offset: 0, filter: "ERROR" }); expect(errors.rows).toHaveLength(1); expect(errors.rows[0].errors).toEqual(["FORMULA_ERROR"]);
});
it("pushes issue/source/condition/search filters and exact count/range into PostgREST, then reads evidence only for page UUIDs", async () => {
  const events: { table: string; method: string; args: unknown[] }[] = [];
  const client = { from(table: string) {
    const result = Promise.resolve(table === "asset_snapshot_rows" ? { data: [{ id: actor.userId, source_row_number: 2, nama_peralatan: "TRAFO", error_codes: [], warning_codes: [] }], count: 141000, error: null } : { data: [{ asset_row_id: actor.userId, nilai_abc: 0, value_source: "SAP_BOOK_VALUE", age_status: "PROVIDED_AGE", selected_donor_ids: [], donor_evidence: {}, calculation_evidence: {} }], error: null });
    const chain = Object.assign(result, Object.fromEntries(["select", "eq", "in", "not", "or", "ilike", "order", "range", "limit"].map(method => [method, (...args: unknown[]) => { events.push({ table, method, args }); return chain; }])));
    return chain;
  } };
  const deps = createImportDependencies(client as never);
  deps.list = vi.fn(async () => { throw new Error("Unbounded generic reads are forbidden"); });
  const review = await loadImportReview(unitId, "run", deps, { offset: 100, filter: "WARNING", issue: "AGE_IMPUTED", source: "SAP_BOOK_VALUE", condition: "P2", search: "TRAFO%_" });
  expect(review).toMatchObject({ totalRows: 141000, offset: 100, hasMore: true, rows: [{ rowNumber: 2, value: 0 }] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "select", args: [expect.stringContaining("asset_valuations!inner"), { count: "exact" }] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "range", args: [100, 199] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "eq", args: ["unit_induk_id", unitId] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "eq", args: ["import_run_id", "run"] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "eq", args: ["kondisi_aset", "P2"] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "eq", args: ["asset_valuations.value_source", "SAP_BOOK_VALUE"] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "ilike", args: ["nama_peralatan", "%TRAFO\\%\\_%"] });
  expect(events).toContainEqual({ table: "asset_snapshot_rows", method: "or", args: ["error_codes.cs.{AGE_IMPUTED},warning_codes.cs.{AGE_IMPUTED}"] });
  expect(events).toContainEqual({ table: "asset_valuations", method: "in", args: ["asset_row_id", [actor.userId]] });
  expect(events).toContainEqual({ table: "asset_valuations", method: "limit", args: [100] });
  expect(events.filter(event => event.method === "range" || event.table === "asset_valuations" && event.method === "in")).toHaveLength(2);
});
it("bounds and sanitizes returned draft listing while exposing the newer retry progress", async () => {
  const result = Promise.resolve({ data: [{ id: actor.userId, unit_induk_id: unitId, dataset_id: actor.userId, dataset_version_id: actor.userId, created_at: "2026-10-16T00:00:00Z", source_files: { original_name: "synthetic.xlsx", object_path: "secret" }, dataset_versions: { status: "NEEDS_FIX" }, asset_import_runs: [{ status: "PROCESSING", created_at: "2026-10-16T01:00:00Z", expected_row_count: 6_000, asset_import_chunks: [{ chunk_index: 0, row_count: 2_000 }] }], import_sheets: [] }, { id: "foreign", unit_induk_id: "other", source_files: { original_name: "secret.xlsx" } }], error: null });
  const query = Object.assign(result, { order: vi.fn(), limit: vi.fn() }); query.order.mockReturnValue(query); query.limit.mockReturnValue(query);
  const inScope = vi.fn(() => query);
  const client = { from: () => ({ select: () => ({ in: inScope }) }) };
  const drafts = await loadImportDrafts(client as never, actor);
  expect(inScope).toHaveBeenCalledWith("unit_induk_id", [unitId]); expect(query.limit).toHaveBeenCalledWith(50); expect(query.limit).toHaveBeenCalledWith(1, { referencedTable: "asset_import_runs" }); expect(drafts).toHaveLength(1); expect(drafts[0]).toMatchObject({ fileName: "synthetic.xlsx", stage: "PROCESSING", rowCount: 6_000, progress: { completedRows: 2_000, expectedRows: 6_000, percent: 33 } }); expect(JSON.stringify(drafts)).not.toContain("secret");
});
it("strict response allowlist rejects unbounded and sensitive review payloads", () => {
  const base = { importId: actor.userId, datasetId: actor.userId, versionId: actor.userId, stage: "READY_TO_SUBMIT" };
  expect(importResponseSchema.safeParse({ ...base, review: { totalRows: 0, offset: 0, hasMore: false, rows: [] } }).success).toBe(true);
  expect(importResponseSchema.safeParse({ ...base, review: { totalRows: 0, offset: 0, hasMore: false, rows: [], secret: "raw" } }).success).toBe(false);
  expect(importResponseSchema.safeParse({ ...base, stage: "PROCESSING", progress: { completedRows: 2_000, expectedRows: 6_000, completedChunks: 1, expectedChunks: 3, percent: 33 } }).success).toBe(true);
  expect(importResponseSchema.safeParse({ ...base, stage: "PROCESSING", progress: { completedRows: 6_001, expectedRows: 6_000, completedChunks: 4, expectedChunks: 3, percent: 101, processing_lease_token: "secret" } }).success).toBe(false);
});
it("counts every first-snapshot asset as an addition and scopes later comparison aggregates", async () => {
  const { deps, tables } = fakeDependencies();
  expect(await loadImportComparison(unitId, "run", false, deps, 4)).toEqual({ counts: { ADDED: 4, REMOVED: 0, CHANGED: 0, UNCHANGED: 0, AMBIGUOUS: 0 }, sourceShifts: {}, hasActiveVersion: false });
  tables.version_comparisons = [{ unit_induk_id: "other-unit", to_run_id: "run", summary: { counts: { ADDED: 999 }, before: { valueSources: {} }, after: { valueSources: {} } } }, { unit_induk_id: unitId, to_run_id: "run", summary: { counts: { ADDED: 2, REMOVED: 1 }, before: { valueSources: { SAP_BOOK_VALUE: 3 } }, after: { valueSources: { SAP_BOOK_VALUE: 2, ESTIMATED_SAME_GI: 1 } }, rawDonor: "secret" } }];
  expect(await loadImportComparison(unitId, "run", true, deps, 4)).toEqual({ counts: { ADDED: 2, REMOVED: 1 }, sourceShifts: { SAP_BOOK_VALUE: -1, ESTIMATED_SAME_GI: 1 }, hasActiveVersion: true });
});
