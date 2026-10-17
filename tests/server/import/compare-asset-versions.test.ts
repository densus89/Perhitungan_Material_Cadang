// @vitest-environment node
import { expect, it, vi } from "vitest";
import { compareAssetVersions } from "../../../src/server/import/compare-asset-versions";
import { syntheticComparison } from "../../fixtures/asset-comparison";
vi.mock("server-only", () => ({}));
const scope = { comparisonId: "synthetic-comparison", unitId: "synthetic-unit", fields: ["no_aset", "nilai_buku_sap"] as const };

it("preserves complete added/removed/changed/unchanged evidence, zero, source changes and stable identity order", () => {
  const fixture = syntheticComparison(4);
  const result = compareAssetVersions(fixture, scope);
  expect(result.counts).toEqual({ ADDED: 1, REMOVED: 1, CHANGED: 2, UNCHANGED: 1, AMBIGUOUS: 0 });
  expect(result.changes.map(change => change.identity_key)).toEqual(["ASSET:A-000000", "ASSET:A-000001", "ASSET:A-000002", "ASSET:A-000003", "ASSET:NEW-SYNTHETIC"]);
  expect(result.changes[1]).toMatchObject({ from_row_id: "before-1", to_row_id: "after-1", changed_fields: ["nilai_buku_sap", "nilai_abc"], comparison_id: scope.comparisonId, unit_induk_id: scope.unitId });
  expect(result.changes[2].changed_fields).toEqual(["value_source"]);
  expect(fixture.afterValues[1].nilai_abc).toBe(0);
});
it("retains duplicate identity ambiguity and composite fallback without dropping source rows", () => {
  const fixture = syntheticComparison(4);
  fixture.after[0].no_aset = fixture.before[0].no_aset;
  fixture.before[1].no_aset = fixture.before[0].no_aset;
  fixture.before[3].no_aset = fixture.after[3].no_aset = null;
  const result = compareAssetVersions(fixture, scope);
  expect(result.counts).toEqual({ ADDED: 1, REMOVED: 0, CHANGED: 1, UNCHANGED: 1, AMBIGUOUS: 1 });
  expect(result.changes[0]).toMatchObject({ change_kind: "AMBIGUOUS", evidence: { fromCount: 2, toCount: 1 } });
  expect(result.changes.at(-1)).toMatchObject({ change_kind: "UNCHANGED", identity_key: expect.stringMatching(/^COMPOSITE:[0-9a-f]{64}$/) });
});
it("joins 141105-row second snapshots with bounded valuation-ID reads, never a find-per-identity scan", { timeout: 15000 }, () => {
  const rows = 141105, fixture = syntheticComparison(rows);
  let reads = 0;
  for (const value of [...fixture.beforeValues, ...fixture.afterValues]) {
    const id = value.asset_row_id;
    Object.defineProperty(value, "asset_row_id", { get() { if (++reads > rows * 4) throw new Error("Quadratic valuation lookup exceeded linear read budget"); return id; } });
  }
  const result = compareAssetVersions(fixture, scope);
  expect(reads).toBeLessThanOrEqual(rows * 4);
  expect(result.changes).toHaveLength(rows + 1);
  expect(result.counts).toEqual({ ADDED: 1, REMOVED: 1, CHANGED: 28222, UNCHANGED: 112882, AMBIGUOUS: 0 });
});
