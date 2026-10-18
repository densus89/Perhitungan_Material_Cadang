import { expect as baseExpect, test } from "@playwright/test";
import { createAssetScenario, cleanupAssetScenario, loginAssetActor, uploadAssetWorkbook, type AssetScenario } from "./support/asset-scenario";
const expect = baseExpect.configure({ timeout: 30000 });

async function logFailureState(scenario: AssetScenario) {
  const runResult = await scenario.client.from("asset_import_runs")
    .select("id,status,expected_row_count,expected_valuation_count,dataset_version_id,created_at")
    .eq("unit_induk_id", scenario.unitId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const run = runResult.data;
  if (runResult.error || !run) {
    console.log(JSON.stringify({ scenario: "asset-import-diagnostic", run: null, code: runResult.error?.code ?? "NO_RUN" }));
    return;
  }
  const [rows, valuations, version] = await Promise.all([
    scenario.client.from("asset_snapshot_rows").select("id", { count: "exact", head: true }).eq("import_run_id", run.id),
    scenario.client.from("asset_valuations").select("asset_row_id", { count: "exact", head: true }).eq("import_run_id", run.id),
    scenario.client.from("dataset_versions").select("status").eq("id", run.dataset_version_id).single(),
  ]);
  console.log(JSON.stringify({ scenario: "asset-import-diagnostic", run: { status: run.status, expectedRows: run.expected_row_count, expectedValuations: run.expected_valuation_count }, versionStatus: version.data?.status ?? null, persistedRows: rows.count, persistedValuations: valuations.count, queryCodes: [rows.error?.code ?? null, valuations.error?.code ?? null, version.error?.code ?? null] }));
}

test.describe.serial("private, versioned synthetic asset import", () => {
  test.describe.configure({ timeout: 600000 });
  let scenario: AssetScenario;
  test.beforeAll(async () => { scenario = await createAssetScenario(); });
  test.afterAll(async () => { if (scenario) await cleanupAssetScenario(scenario); });
  test("operator template, error correction, resume, return/resubmit, approval, history and cross-unit denial", async ({ page, browser }) => {
    test.setTimeout(600000);
    await loginAssetActor(page, scenario, "operator");
    await page.goto("/impor/");
    const download = page.waitForEvent("download"); await page.getByRole("link", { name: /Unduh template/ }).click();
    expect((await download).suggestedFilename()).toBe("template-snapshot-aset.xlsx");
    const bad = await uploadAssetWorkbook(page, scenario, "invalid", { invalid: true });
    expect(bad.summary?.blockingErrors).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Tinjau perbandingan" })).toBeDisabled();
    await page.getByRole("button", { name: "Impor snapshot baru" }).click();
    const first = await uploadAssetWorkbook(page, scenario, "first");
    expect(first.summary?.blockingErrors).toBe(0);
    await expect(page.getByText(/nilaiABC adalah nilai buku/)).toBeVisible();
    await expect(page.getByText(/A1, A2, B1, B2, dan C/)).toBeVisible();
    await scenario.assertPrivateSource(first.importId);
    await page.reload(); await page.getByRole("button", { name: `Lanjutkan ${scenario.fileName("first")}` }).click();
    await expect(page.getByRole("heading", { name: "Kualitas & bukti nilai" })).toBeVisible();
    await page.getByRole("button", { name: "Tinjau perbandingan" }).click();
    await expect(page.getByText("Snapshot lengkap Unit Induk.")).toBeVisible();
    await page.getByRole("button", { name: "Ajukan persetujuan DIV RST" }).click();
    await expect(page.getByText("Status server: PENDING_RST")).toBeVisible();
    const reviewContext = await browser.newContext(); const reviewer = await reviewContext.newPage();
    const otherContext = await browser.newContext(); const other = await otherContext.newPage();
    try {
      await loginAssetActor(other, scenario, "other");
      expect((await other.request.get(`/api/imports/${first.importId}/`)).status()).toBe(404);
      expect((await other.request.post(`/api/imports/${first.importId}/process/`, { data: {}, headers: { Origin: new URL(page.url()).origin } })).status()).toBe(404);
      await loginAssetActor(reviewer, scenario, "reviewer");
      const openReview = async (name: string) => { await reviewer.goto("/review-snapshot/"); await reviewer.getByLabel("Unit induk", { exact: true }).selectOption(scenario.unitId); await reviewer.getByRole("button", { name: "Terapkan filter" }).click(); await reviewer.getByRole("button", { name: `Tinjau ${scenario.fileName(name)}` }).click(); };
      const decide = async (name: string, note: string) => { await reviewer.getByLabel("Catatan keputusan").fill(note); await reviewer.getByLabel("Saya mengonfirmasi keputusan dan lingkup yang ditampilkan").check(); await reviewer.getByRole("button", { name, exact: true }).click(); };
      await openReview("first"); await decide("Kembalikan untuk perbaikan", "Synthetic RST return: review source and resubmit");
      await expect(reviewer.getByRole("status").filter({ hasText: "Keputusan tersimpan: NEEDS_FIX" })).toBeVisible();
      await page.getByRole("button", { name: "Periksa status" }).click();
      await page.getByRole("button", { name: "Proses ulang sebagai run baru" }).click();
      await expect(page.getByText("Status server: READY_TO_SUBMIT")).toBeVisible();
      await page.getByRole("button", { name: "Tinjau perbandingan" }).click(); await page.getByRole("button", { name: "Ajukan persetujuan DIV RST" }).click();
      await expect(page.getByText("Status server: PENDING_RST")).toBeVisible();
      await openReview("first"); await decide("Setujui & aktifkan", "Synthetic reviewed first snapshot");
      await expect(reviewer.getByRole("status").filter({ hasText: "Versi aktif:" })).toBeVisible();
      await page.getByRole("button", { name: "Impor snapshot baru" }).click();
      let next;
      try { next = await uploadAssetWorkbook(page, scenario, "second", { revised: true }); }
      catch (error) { await logFailureState(scenario); throw error; }
      await page.getByRole("button", { name: "Tinjau perbandingan" }).click();
      expect(next.comparison?.hasActiveVersion).toBe(true);
      await page.getByRole("button", { name: "Ajukan persetujuan DIV RST" }).click(); await expect(page.getByText("Status server: PENDING_RST")).toBeVisible();
      await openReview("second"); await reviewer.getByRole("button", { name: "Muat perubahan versi" }).click();
      await expect(reviewer.getByRole("region", { name: "Perubahan sebelum dan sesudah" })).toContainText("CHANGED");
      await decide("Setujui & aktifkan", "Synthetic second snapshot retains history");
      await expect(reviewer.getByRole("status").filter({ hasText: `Versi dipindahkan ke riwayat: ${first.versionId}` })).toBeVisible();
      expect(await scenario.status(first.versionId)).toBe("HISTORICAL"); expect(await scenario.status(next.versionId)).toBe("ACTIVE");
      await reviewer.goto(`/api/reviews/asset-versions/${first.versionId}/`); expect((await reviewer.locator("body").innerText())).toContain('"status":"HISTORICAL"');
      expect(Math.max(...scenario.processDurationsMs)).toBeLessThan(300000);
      console.log(JSON.stringify({ scenario: "asset-import", runId: scenario.runId, processDurationsMs: scenario.processDurationsMs, privateSource: "denied unsigned/foreign session; signed access verified", history: "verified", cleanup: "afterAll exact isolated resources" }));
    } finally { await reviewContext.close(); await otherContext.close(); }
  });
});
