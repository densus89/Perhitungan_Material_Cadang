// @vitest-environment node
import { expect, it, vi } from "vitest";
import { approveAndActivateAssetVersion, returnAssetVersion, trashAssetVersion, createReviewDependencies } from "../../../src/server/review/asset-version-service";
import { actor } from "../import/fakes";
import { reviewId } from "../../fixtures/asset-version-review";
import { readFixture, side, unit, fromRun, comparisonId } from "./review-read-fixture";
vi.mock("server-only", () => ({}));
it("keeps the first-snapshot ADDED summary at the complete persisted run count when row filters narrow the page", async () => {
  const f = readFixture(); Object.assign(f.state.expected, { baseVersionId: null, comparisonId: null });
  f.state.summary = { rowCount: 141105 };
  f.tables.asset_snapshot_rows = [side("one-filter-match", reviewId, 0)];
  const detail = await createReviewDependencies(f.client as never).read(reviewId, { offset: 0, filter: "ALL", condition: "P0" });
  expect(detail.totalRows).toBe(1);
  expect(detail.comparison).toEqual({ counts: { ADDED: 141105 } });
});
it("pages actual ADDED rows for a first snapshot without inventing a comparison record", async () => {
  const f = readFixture(); Object.assign(f.state.expected, { baseVersionId: null, comparisonId: null }); f.tables.asset_snapshot_rows = [side("new", reviewId, 345)];
  const page = await createReviewDependencies(f.client as never).comparison(reviewId, { offset: 0, kind: "ADDED" });
  expect(page).toMatchObject({ total: 1, changes: [{ kind: "ADDED", before: null, after: { row: { id: "new" }, value: { nilai_abc: 345 } } }] });
  expect(f.calls).toContainEqual({ table: "asset_snapshot_rows", method: "range", args: [0, 99] });
});
it("independently pages REMOVED changes and loads only bounded scoped original rows without raw/donor leakage", async () => {
  const f = readFixture();
  f.tables.asset_version_changes = Array.from({ length: 101 }, (_, i) => ({ id: String(i), comparison_id: comparisonId, unit_induk_id: unit, identity_key: `ASSET:${i}`, change_kind: "REMOVED", from_row_id: `old-${i}`, to_row_id: null, changed_fields: [], evidence: { raw: "PRIVATE_RAW_SECRET" } }));
  f.tables.asset_snapshot_rows = [side("old-100", fromRun, 123)];
  const page = await createReviewDependencies(f.client as never).comparison(reviewId, { offset: 100, kind: "REMOVED" });
  expect(page).toMatchObject({ total: 101, offset: 100, hasMore: false, changes: [{ kind: "REMOVED", before: { row: { nama_peralatan: "ACTUAL STORED ASSET" }, value: { nilai_abc: 123, donor_evidence: { candidateCount: 3 } } }, after: null }] });
  expect(f.calls).toContainEqual({ table: "asset_version_changes", method: "range", args: [100, 199] });
  expect(f.calls).toContainEqual({ table: "asset_version_changes", method: "eq", args: ["change_kind", "REMOVED"] });
  expect(f.calls).toContainEqual({ table: "asset_snapshot_rows", method: "eq", args: ["unit_induk_id", unit] });
  expect(f.calls).toContainEqual({ table: "asset_snapshot_rows", method: "eq", args: ["import_run_id", fromRun] });
  expect(f.calls).toContainEqual({ table: "asset_snapshot_rows", method: "in", args: ["id", ["old-100"]] });
  expect(JSON.stringify(page)).not.toMatch(/PRIVATE_RAW_SECRET|NATIONAL_DONOR_SECRET|rawCell|cohort|selected_donor_ids/);
});
it("resolves real CHANGED before/after rows and fails closed when a referenced side belongs to another unit", async () => {
  const f = readFixture(); f.tables.asset_version_changes = [{ id: "change", comparison_id: comparisonId, unit_induk_id: unit, identity_key: "ASSET:REAL", change_kind: "CHANGED", from_row_id: "old", to_row_id: "new", changed_fields: ["nilaiABC"] }];
  f.tables.asset_snapshot_rows = [side("old", fromRun, 100), side("new", reviewId, 200)];
  const deps = createReviewDependencies(f.client as never);
  const page = await deps.comparison(reviewId, { offset: 0, kind: "CHANGED" });
  expect(page.changes[0]).toMatchObject({ before: { value: { nilai_abc: 100 } }, after: { value: { nilai_abc: 200 } } });
  for (const call of f.calls.filter(call => call.table === "asset_snapshot_rows" && call.method === "in")) expect((call.args[1] as unknown[]).length).toBeLessThanOrEqual(100);
  f.tables.asset_snapshot_rows[1].unit_induk_id = "foreign-unit";
  await expect(deps.comparison(reviewId, { offset: 0, kind: "CHANGED" })).rejects.toMatchObject({ status: 503 });
});
it("pages mappings at 100 while preserving the authoritative 16384-column count", async () => {
  const f = readFixture(); f.tables.import_column_mappings = Array.from({ length: 16384 }, (_, i) => ({ import_session_id: reviewId, unit_induk_id: unit, source_column_index: i + 1, canonical_field: null, source_header: `HEADER_${i + 1}` }));
  const page = await createReviewDependencies(f.client as never).mapping(reviewId, 500);
  expect(page).toMatchObject({ total: 16384, offset: 500, hasMore: true }); expect(page.columns).toHaveLength(100);
  expect(f.calls).toContainEqual({ table: "import_column_mappings", method: "range", args: [500, 599] });
});
it.each([approveAndActivateAssetVersion, returnAssetVersion, trashAssetVersion])("mutation readiness is independent from display pagination even for 16384 columns", async operation => {
  const f = readFixture(), deps = createReviewDependencies(f.client as never); deps.read = vi.fn(async () => { throw new Error("Display unavailable"); });
  await operation({ ...actor, role: "RST_ADMIN" }, { versionId: reviewId, expected: f.state.expected, notes: "Verified wide mapping", confirmed: true }, { ...deps, state: async () => ({ ...f.state, status: operation === trashAssetVersion ? "HISTORICAL" : "PENDING_RST" }) });
  expect(deps.read).not.toHaveBeenCalled(); expect(f.client.rpc).toHaveBeenCalledWith("review_asset_version", expect.anything());
});
it("allows admin-only unprocessed duplicate DRAFT trash with its actual draft state rather than fake run tokens", async () => {
  const f = readFixture(), expected = { kind: "UNPROCESSED_DRAFT" as const, unitId: unit, sourceFileId: reviewId, mappingRevision: reviewId, updatedAt: "2026-10-16T00:00:00Z" };
  const deps = { ...createReviewDependencies(f.client as never), state: async () => ({ ...f.state, status: "DRAFT", runId: null, eligibleDraftTrash: true, expected }) };
  const input = { versionId: reviewId, expected, notes: "Duplicate upload verified", confirmed: true };
  await trashAssetVersion({ ...actor, role: "RST_ADMIN" }, input, deps); expect(f.client.rpc).toHaveBeenCalledWith("review_asset_version", expect.objectContaining({ p_expected: expected, p_action: "TRASH" }));
  await expect(trashAssetVersion({ ...actor, role: "RST_REVIEWER" }, input, deps)).rejects.toMatchObject({ status: 403 });
});
