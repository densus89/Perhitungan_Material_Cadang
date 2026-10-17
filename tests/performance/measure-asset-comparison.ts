import { compareAssetVersions } from "../../src/server/import/compare-asset-versions";
import { syntheticComparison } from "../fixtures/asset-comparison";

/** Run before the parser benchmark so its own phase window/RSS is visible.
 * RSS is observed process memory, not a claim of exclusive allocation ownership. */
export async function measureAssetComparison(rows: number) {
  if (!Number.isInteger(rows) || rows < 1) throw new Error("Invalid synthetic comparison size");
  const baselineRssBytes = process.memoryUsage().rss;
  let peakSampledRssBytes = baselineRssBytes;
  const sampleMemory = () => { peakSampledRssBytes = Math.max(peakSampledRssBytes, process.memoryUsage().rss); };
  const timer = setInterval(sampleMemory, 10);
  try {
    const fixtureStarted = performance.now(), fixture = syntheticComparison(rows);
    const fixtureDurationMs = performance.now() - fixtureStarted;
    sampleMemory();
    const started = performance.now();
    const comparison = compareAssetVersions(fixture, { comparisonId: "synthetic-benchmark", unitId: "synthetic-unit", fields: Object.keys(fixture.before[0]).filter(field => field !== "id") as (keyof typeof fixture.before[0])[] });
    const comparisonGenerationMs = performance.now() - started;
    sampleMemory();
    let comparisonSerializationMs = 0, serializationBytes = 0, batchCount = 0, maxBatch = 0;
    for (let offset = 0; offset < comparison.changes.length; offset += 1000) {
      const batch = comparison.changes.slice(offset, offset + 1000), time = performance.now();
      serializationBytes += Buffer.byteLength(JSON.stringify(batch));
      comparisonSerializationMs += performance.now() - time;
      batchCount++; maxBatch = Math.max(maxBatch, batch.length); sampleMemory();
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return { beforeRows: rows, afterRows: rows, changeRows: comparison.changes.length, counts: comparison.counts, fixtureDurationMs, comparisonGenerationMs, comparisonSerializationMs, totalDurationMs: performance.now() - started, baselineRssBytes, peakSampledRssBytes, peakProcessRssBytes: process.resourceUsage().maxRSS * 1024, serializationBytes, batchCount, maxBatch, methodology: "Two full synthetic snapshots. Generation uses the exact authoritative comparison helper; change serialization uses <=1000-row batches. Fixture construction excluded from measured comparison time but included in RSS. Phase-boundary and 10ms RSS samples plus lifetime OS high-water through this phase. No forced GC, DB writes, network latency or Vercel equivalence claimed." };
  } finally { clearInterval(timer); }
}
