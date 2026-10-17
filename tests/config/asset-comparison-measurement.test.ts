// @vitest-environment node
import { expect, it, vi } from "vitest";
import { measureAssetComparison } from "../performance/measure-asset-comparison";
vi.mock("server-only", () => ({}));
it("reports second-snapshot generation and bounded serialization time/memory separately", async () => {
  const report = await measureAssetComparison(1001);
  expect(report).toMatchObject({ beforeRows: 1001, afterRows: 1001, changeRows: 1002, batchCount: 2, maxBatch: 1000 });
  expect(report.counts).toEqual({ ADDED: 1, REMOVED: 1, CHANGED: 200, UNCHANGED: 800, AMBIGUOUS: 0 });
  expect(report.comparisonGenerationMs).toBeGreaterThanOrEqual(0);
  expect(report.comparisonSerializationMs).toBeGreaterThanOrEqual(0);
  expect(report.totalDurationMs).toBeGreaterThanOrEqual(report.comparisonGenerationMs + report.comparisonSerializationMs);
  expect(report.peakSampledRssBytes).toBeGreaterThanOrEqual(report.baselineRssBytes);
  expect(report.peakProcessRssBytes).toBeGreaterThanOrEqual(report.peakSampledRssBytes);
  expect(report.serializationBytes).toBeGreaterThan(0);
});
