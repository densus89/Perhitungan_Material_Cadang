// @vitest-environment node
import { test, vi } from "vitest";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { readNodeAssetWorkbook as readAssetWorkbook } from "../../src/server/import/read-node-workbook";
import { resolveAssetValuation } from "../../src/domain/asset-import/valuation";
import { prepareComparablePool, type ComparableAsset } from "../../src/domain/asset-import/comparables";
import { validateAssetRow } from "../../src/domain/asset-import/validate-row";
import { PERDIR_0299_VERSION } from "../../src/reference/useful-life-perdir-0299";
import { measureAssetComparison } from "./measure-asset-comparison";

const ROWS = 141105;
vi.mock("server-only", () => ({}));
test("141105 synthetic asset rows through the shared parser and valuation rules", { timeout: 360000 }, async ({ bench }) => {
  await bench("141105-row import", async () => {
  // Separate phase/window, before parser allocation. The fixture/result arrays
  // are out of scope when parser measurement begins; GC is not forced.
  const comparison = await measureAssetComparison(ROWS);
  assert.equal(comparison.changeRows, ROWS + 1);
  assert.deepEqual(comparison.counts, { ADDED: 1, REMOVED: 1, CHANGED: 28222, UNCHANGED: 112882, AMBIGUOUS: 0 });
  const directory = await mkdtemp(join(tmpdir(), "asset-import-bench-"));
  const fixtureStarted = performance.now();
  try {
    // Streaming fixture construction is outside the measured import duration.
    const path = join(directory, "synthetic.xlsx");
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useSharedStrings: false, useStyles: false });
    const sheet = workbook.addWorksheet("DATA_ASET");
    sheet.addRow(["UNIT_INDUK", "UPT", "NAMA_GI", "TID", "NO_ASET", "NAMA_PERALATAN", "SPESIFIKASI_MARA", "JUMLAH", "SATUAN", "KONDISI_ASET", "USIA_ASET_TAHUN", "NILAI_BUKU_SAP", "NILAI_BUKU_PENYESUAIAN", "HARGA_PENGADAAN_SAAT_INI", "TANGGAL_REFERENSI_HARGA"]).commit();
    for (let index = 0; index < ROWS; index++) {
      const sample = index % 1000;
      sheet.addRow(["UNIT SYNTHETIC", `UPT ${index % 10}`, `GI ${index % 100}`, `T-${index}`, `A-${index}`, "TRAFO", `150/20 kV SYNTHETIC ${index % 1000}`, 1, "UNIT", `P${index % 5}`, index < 1492 ? null : sample === 1 ? { formula: "0", result: 0 } : 10 + index % 20, sample === 3 ? { formula: "NA()", result: { error: "#N/A" } } : sample < 55 ? sample === 0 ? { formula: "0", result: 0 } : sample === 1 ? "1.234.567,50" : 1000000 : null, sample >= 55 ? 2000000 : null, 4000000, "2026-01-01"]).commit();
    }
    await workbook.commit();
    const bytes = new Uint8Array(await readFile(path));
    const fixtureDurationMs = performance.now() - fixtureStarted;
    const phases: Record<string, number> = {};
    const started = performance.now();
    let peakSampledRss = process.memoryUsage().rss;
    const sampleMemory = () => { peakSampledRss = Math.max(peakSampledRss, process.memoryUsage().rss); };
    const timer = setInterval(sampleMemory, 10);
    try {
      const parsed = await readAssetWorkbook(bytes, { ruleVersion: PERDIR_0299_VERSION, collectRows: true, previewLimit: 0, onPhase: measurement => { phases[measurement.phase] = measurement.durationMs; sampleMemory(); } });
      assert.equal(parsed.summary.candidateRows, ROWS);
      const assets: ComparableAsset[] = parsed.rows!.map((row, i) => ({ ...row.asset, id: `synthetic-${i}`, provenance: row.provenance }));
      let time = performance.now();
      const pool = prepareComparablePool(assets);
      phases.comparableIndex = performance.now() - time;
      const context = { asOf: "2026-10-16", candidates: assets, cohort: assets, candidatePool: pool, cohortPool: pool };
      let batch: unknown[] = [], bytesSerialized = 0, batchCount = 0, maxBatch = 0, zeroValues = 0, missingAgeRows = 0, formulaErrorRows = 0;
      phases.valuation = 0; phases.batchSerialization = 0;
      for (let index = 0; index < assets.length; index++) {
        time = performance.now();
        const row = parsed.rows![index], valuation = resolveAssetValuation(assets[index], context);
        const validation = validateAssetRow(row, valuation);
        phases.valuation += performance.now() - time;
        if (valuation.nilaiABC === 0) zeroValues++;
        if (row.asset.usiaAsetTahun === null) missingAgeRows++;
        if (row.issues.some(issue => issue.code === "INVALID_FORMULA_RESULT")) formulaErrorRows++;
        batch.push({ row, valuation, errors: validation.errors.map(issue => issue.code), warnings: validation.warnings.map(issue => issue.code) });
        if (batch.length === 1000 || index === assets.length - 1) {
          time = performance.now(); bytesSerialized += Buffer.byteLength(JSON.stringify(batch)); maxBatch = Math.max(maxBatch, batch.length); batchCount++; batch = [];
          phases.batchSerialization += performance.now() - time; sampleMemory();
          await new Promise<void>(resolve => setImmediate(resolve));
        }
      }
      // Exercise shifted legacy and duplicate MARA mapping with real bytes too.
      const legacy = new ExcelJS.Workbook(), old = legacy.addWorksheet("3400");
      old.addRow(["Synthetic legacy title"]); old.addRow([]);
      old.addRow(["UNIT_INDUK", "UPT", "NAMAGI", "MARA", "MARA", "GROUP_NAME", "jumlah", "satuan", "KONDISI_ASET", "usia", "nilai_buku_SAP"]);
      old.addRow(["UNIT SYNTHETIC", "UPT SYNTHETIC", "GI SYNTHETIC", "150/20 kV", "000012345678", "TRAFO", 1, "UNIT", "P2", 10, 0]);
      const legacyBytes = new Uint8Array(await legacy.xlsx.writeBuffer());
      const proposal = await readAssetWorkbook(legacyBytes, { ruleVersion: PERDIR_0299_VERSION });
      assert.equal(proposal.layout.selected?.headerRow, 3);
      assert.equal(proposal.layout.selected?.columns.filter(column => column.header === "MARA").length, 2);
      const totalDurationMs = performance.now() - started;
      const peakProcessRss = process.resourceUsage().maxRSS * 1024;
      const combinedMeasuredDurationMs = totalDurationMs + comparison.totalDurationMs;
      const report = { rows: ROWS, workbookBytes: bytes.byteLength, fixtureDurationMs, phases, totalDurationMs, comparison, combinedMeasuredDurationMs, peakSampledRssBytes: peakSampledRss, peakProcessRssBytes: peakProcessRss, serializationBytes: bytesSerialized, batchCount, maxBatch, zeroValues, missingAgeRows, formulaErrorRows, methodology: "Single measured iteration; real XLSX bytes; authoritative streaming adapter with shared canonicalization, valuation, validation and bounded JSON batches. Parse phase is first XML/header pass; canonicalization includes second XML pass and hashes. Comparison is an earlier separate phase with its own generation/serialization/RSS evidence. Fixture generation excluded from measured durations but included in process lifetime peak RSS. Phase boundaries + 10ms samples and OS lifetime high-water RSS; no forced GC. No DB/network latency or Vercel CPU equivalence is claimed." };
      const reportPath = process.env.ASSET_BENCH_REPORT;
      if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log("ASSET_IMPORT_BENCHMARK " + JSON.stringify(report));
      assert.ok(combinedMeasuredDurationMs < 300000, "Import plus second-snapshot comparison exceeds the 300-second rollout boundary");
      assert.ok(peakProcessRss < 1.5 * 1024 ** 3, "Parser/valuation benchmark must leave headroom for persistence below 2 GiB");
      assert.ok(zeroValues > 0 && missingAgeRows > 0 && formulaErrorRows > 0, "Scale fixture must exercise zero, missing age and formula errors");
    } finally { clearInterval(timer); }
  } finally { await rm(directory, { recursive: true, force: true }); }
  }).run({ iterations: 1, time: 0, warmup: false });
});
