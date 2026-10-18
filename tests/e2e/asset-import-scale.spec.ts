import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import {
  cleanupAssetScenario,
  createAssetScenario,
  loginAssetActor,
  uploadAssetWorkbookPath,
  type AssetScenario,
} from "./support/asset-scenario";

const SCALE_ROWS = 141105;
const requestedRows = Number(process.env.E2E_SCALE_ROWS ?? 0);

async function writeScaleWorkbook(path: string, scenario: AssetScenario) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useSharedStrings: false, useStyles: false });
  const sheet = workbook.addWorksheet("DATA_ASET");
  sheet.addRow([
    "UNIT_INDUK", "UPT", "NAMA_GI", "TID", "NO_ASET", "NAMA_PERALATAN", "SPESIFIKASI_MARA",
    "JUMLAH", "SATUAN", "KONDISI_ASET", "USIA_ASET_TAHUN", "NILAI_BUKU_SAP", "HARGA_PENGADAAN_SAAT_INI",
  ]).commit();
  for (let index = 0; index < SCALE_ROWS; index++) {
    sheet.addRow([
      scenario.unitCode,
      `UPT SYNTHETIC ${index % 10}`,
      `GI SYNTHETIC ${index % 100}`,
      `T-${index}`,
      `A-${index}`,
      "TRAFO",
      `150/20 kV 60 MVA SYNTHETIC ${index % 14}`,
      1,
      "UNIT",
      `P${index % 5}`,
      10 + index % 20,
      1_000_000 + index,
      4_000_000,
    ]).commit();
  }
  await workbook.commit();
}

async function logScaleFailureState(scenario: AssetScenario) {
  const runResult = await scenario.client.from("asset_import_runs")
    .select("id,status,expected_row_count,expected_valuation_count,created_at")
    .eq("unit_induk_id", scenario.unitId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const run = runResult.data;
  if (runResult.error || !run) {
    console.log(JSON.stringify({ scenario: "asset-import-scale-diagnostic", run: null, code: runResult.error?.code ?? "NO_RUN" }));
    return;
  }
  const [rows, valuations] = await Promise.all([
    scenario.client.from("asset_snapshot_rows").select("id", { count: "exact", head: true }).eq("import_run_id", run.id),
    scenario.client.from("asset_valuations").select("asset_row_id", { count: "exact", head: true }).eq("import_run_id", run.id),
  ]);
  console.log(JSON.stringify({
    scenario: "asset-import-scale-diagnostic",
    run: { status: run.status, expectedRows: run.expected_row_count, expectedValuations: run.expected_valuation_count },
    persistedRows: rows.count,
    persistedValuations: valuations.count,
    queryCodes: [rows.error?.code ?? null, valuations.error?.code ?? null],
  }));
}

test.describe.serial("hosted 141105-row asset snapshot acceptance", () => {
  test.skip(requestedRows !== SCALE_ROWS, `Set E2E_SCALE_ROWS=${SCALE_ROWS} to run the destructive, isolated scale gate.`);
  test.describe.configure({ timeout: 900000 });
  let scenario: AssetScenario;

  test.beforeAll(async () => { scenario = await createAssetScenario(); });
  test.afterAll(async () => { if (scenario) await cleanupAssetScenario(scenario, { timeoutMs: 600000 }); });

  test("persists, reconciles and reloads every synthetic row inside the hosted limit", async ({ page }) => {
    test.setTimeout(900000);
    const directory = await mkdtemp(join(tmpdir(), "asset-e2e-scale-"));
    const path = join(directory, scenario.fileName("scale-141105"));
    try {
      await writeScaleWorkbook(path, scenario);
      expect((await stat(path)).size).toBeLessThan(50 * 1024 * 1024);

      await loginAssetActor(page, scenario, "operator");
      await page.goto("/impor/");
      let result;
      try {
        result = await uploadAssetWorkbookPath(page, scenario, path, { previewTimeoutMs: 300000, processTimeoutMs: 300000 });
      } catch (error) {
        await logScaleFailureState(scenario);
        throw error;
      }

      expect(result.stage).toBe("READY_TO_SUBMIT");
      expect(result.summary?.rowCount).toBe(SCALE_ROWS);
      expect(result.summary?.blockingErrors).toBe(0);
      expect(result.comparison).toEqual({
        counts: { ADDED: SCALE_ROWS, REMOVED: 0, CHANGED: 0, UNCHANGED: 0, AMBIGUOUS: 0 },
        sourceShifts: {},
        hasActiveVersion: false,
      });
      expect(scenario.processDurationsMs.at(-1)).toBeLessThan(300000);

      const session = await scenario.client.from("import_sessions").select("current_run_id").eq("id", result.importId).single();
      expect(session.error).toBeNull();
      expect(session.data?.current_run_id).toBeTruthy();
      const runId = session.data!.current_run_id!;
      const run = await scenario.client.from("asset_import_runs").select("status,expected_row_count,expected_valuation_count").eq("id", runId).single();
      expect(run.error).toBeNull();
      expect(run.data).toMatchObject({ status: "COMPLETE", expected_row_count: SCALE_ROWS, expected_valuation_count: SCALE_ROWS });

      const [rows, valuations] = await Promise.all([
        scenario.client.from("asset_snapshot_rows").select("id", { count: "exact", head: true }).eq("import_run_id", runId),
        scenario.client.from("asset_valuations").select("asset_row_id", { count: "exact", head: true }).eq("import_run_id", runId),
      ]);
      expect(rows.error).toBeNull(); expect(rows.count).toBe(SCALE_ROWS);
      expect(valuations.error).toBeNull(); expect(valuations.count).toBe(SCALE_ROWS);
      console.log(JSON.stringify({ scenario: "asset-import-scale", runId: scenario.runId, rows: SCALE_ROWS, processDurationMs: scenario.processDurationsMs.at(-1), persistedRows: rows.count, persistedValuations: valuations.count, comparison: result.comparison, cleanup: "afterAll exact isolated resources" }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
