import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  cleanupAssetScenario,
  createAssetScenario,
  loginAssetActor,
  uploadAssetWorkbookPath,
  writeSyntheticAssetWorkbook,
  type AssetScenario,
} from "./support/asset-scenario";

const SCALE_ROWS = 141105;
const requestedRows = Number(process.env.E2E_SCALE_ROWS ?? 0);

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
    processResponses: scenario.processResponses.map(({ status, durationMs, body }) => ({ status, durationMs, stage: body.stage, progress: body.progress })),
  }));
}

test.describe.serial("hosted 141105-row asset snapshot acceptance", () => {
  test.skip(requestedRows !== SCALE_ROWS, `Set E2E_SCALE_ROWS=${SCALE_ROWS} to run the destructive, isolated scale gate.`);
  test.describe.configure({ timeout: 2100000 });
  let scenario: AssetScenario;

  test.beforeAll(async () => { scenario = await createAssetScenario(); });
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(600000);
    if (scenario) await cleanupAssetScenario(scenario, { timeoutMs: 600000 });
  });

  test("persists, reconciles and reloads every synthetic row inside the hosted limit", async ({ page }) => {
    test.setTimeout(2100000);
    const directory = await mkdtemp(join(tmpdir(), "asset-e2e-scale-"));
    const path = join(directory, scenario.fileName("scale-141105"));
    try {
      await writeSyntheticAssetWorkbook(path, scenario, SCALE_ROWS);
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
      const processing = scenario.processResponses.filter(response => response.status === 202);
      expect(processing.length).toBeGreaterThanOrEqual(2);
      expect(scenario.processResponses.at(-1)).toMatchObject({ status: 200, body: { stage: "READY_TO_SUBMIT" } });
      expect(Math.max(...scenario.processResponses.map(response => response.durationMs))).toBeLessThan(240000);
      expect(processing.map(response => response.body.progress?.completedRows)).toEqual(
        [...processing].map(response => response.body.progress!.completedRows).sort((left, right) => left - right),
      );
      expect(processing.every(response => response.body.progress?.expectedRows === SCALE_ROWS)).toBe(true);

      const session = await scenario.client.from("import_sessions").select("current_run_id").eq("id", result.importId).single();
      expect(session.error).toBeNull();
      expect(session.data?.current_run_id).toBeTruthy();
      const runId = session.data!.current_run_id!;
      const run = await scenario.client.from("asset_import_runs").select("status,expected_row_count,expected_valuation_count").eq("id", runId).single();
      expect(run.error).toBeNull();
      expect(run.data).toMatchObject({ status: "COMPLETE", expected_row_count: SCALE_ROWS, expected_valuation_count: SCALE_ROWS });

      const [rows, valuations, chunks] = await Promise.all([
        scenario.client.from("asset_snapshot_rows").select("id", { count: "exact", head: true }).eq("import_run_id", runId),
        scenario.client.from("asset_valuations").select("asset_row_id", { count: "exact", head: true }).eq("import_run_id", runId),
        scenario.client.from("asset_import_chunks").select("chunk_index,row_count").eq("import_run_id", runId).order("chunk_index"),
      ]);
      expect(rows.error).toBeNull(); expect(rows.count).toBe(SCALE_ROWS);
      expect(valuations.error).toBeNull(); expect(valuations.count).toBe(SCALE_ROWS);
      expect(chunks.error).toBeNull();
      expect(chunks.data).toHaveLength(Math.ceil(SCALE_ROWS / 2000));
      expect(chunks.data?.reduce((total, chunk) => total + chunk.row_count, 0)).toBe(SCALE_ROWS);
      console.log(JSON.stringify({ scenario: "asset-import-scale", runId: scenario.runId, rows: SCALE_ROWS, processResponses: scenario.processResponses.map(({ status, durationMs, body }) => ({ status, durationMs, stage: body.stage, progress: body.progress })), persistedRows: rows.count, persistedValuations: valuations.count, manifestChunks: chunks.data?.length, comparison: result.comparison, cleanup: "afterAll exact isolated resources" }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
