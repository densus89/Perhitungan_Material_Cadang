import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { E2E_IDENTITIES } from "./support/environment";
import { loginAs } from "./support/session";

test.beforeEach(async ({ page }) => {
  await loginAs(page, E2E_IDENTITIES.operator.email);
});

test("dashboard to approval, policy, P0 locations, and current demo export", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Data Demo", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Lewati ke konten utama" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  await expect(nav.getByRole("link", { name: "Pemetaan RFQ" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Pemetaan RFQ" })).toBeVisible();
  await page.getByRole("row", { name: /mapping-near\s/ }).getByRole("button", { name: "Setujui", exact: true }).click();
  await nav.getByRole("link", { name: "Ringkasan", exact: true }).click();
  await expect(page.getByRole("article", { name: "Menunggu approval" }).locator(".kpi-value")).toHaveText("1");
  await expect(page.getByRole("status")).toContainText("1 pemetaan RFQ menunggu approval");
  await expect(page.getByText("2 spesifikasi mandiri", { exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Inventory Policy", exact: true }).click();
  await expect(page.getByRole("row", { name: /PMT Demo Tipe X/ })).toContainText("Disetujui");
  await nav.getByRole("link", { name: "Prioritas Lokasi", exact: true }).click();
  await page.getByLabel("Kondisi lokasi").selectOption("P0");
  await expect(page.getByText("2 dari 8 lokasi", { exact: false })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await nav.getByRole("link", { name: "Ekspor", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ekspor Demo" })).toBeVisible();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh snapshot JSON" }).click();
  const json = await jsonDownload;
  const payload = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(payload.approvalAudit.find((row: { id: string }) => row.id === "mapping-near")).toMatchObject({ status: "DISETUJUI", approvalMethod: "ONE" });
  expect(payload.locations).toHaveLength(8);
  expect(payload.locations.every((row: { allocationStatus: string; idealQuantityReference: number }) => row.allocationStatus === "REFERENCE_ONLY" && row.idealQuantityReference === 3)).toBe(true);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh lokasi CSV" }).click();
  const csv = await csvDownload;
  expect(await readFile((await csv.path())!, "utf8")).toContain('"idealQuantityReference","allocationStatus"');
  await expect(page.getByText("Data Demo", { exact: true })).toBeVisible();
});

test("rejection round trips refresh standalone counts and completed dashboard status", async ({ page }) => {
  await page.goto("/ringkasan/");
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  await page.getByRole("link", { name: "Tinjau pemetaan" }).click();
  await page.getByRole("row", { name: /mapping-near\s/ }).getByRole("button", { name: "Tolak", exact: true }).click();
  await nav.getByRole("link", { name: "Ringkasan", exact: true }).click();
  await expect(page.getByRole("article", { name: "Menunggu approval" }).locator(".kpi-value")).toHaveText("1");
  await expect(page.getByText("4 spesifikasi mandiri", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Tinjau pemetaan" }).click();
  await page.getByRole("row", { name: /mapping-transformer-guard/ }).getByRole("button", { name: "Tolak", exact: true }).click();
  await nav.getByRole("link", { name: "Ringkasan", exact: true }).click();
  await expect(page.getByRole("article", { name: "Menunggu approval" }).locator(".kpi-value")).toHaveText("0");
  await expect(page.getByText("5 spesifikasi mandiri", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Semua pemetaan RFQ telah ditinjau");
  await expect(page.getByRole("status")).not.toContainText("draft");
});

test("manual RFQ choices preserve material family and transformer capacity through dashboard completion", async ({ page }) => {
  await page.goto("/pemetaan-rfq/");
  const breaker = page.getByRole("row", { name: /mapping-near\s/ });
  await breaker.getByRole("button", { name: "Detail audit" }).click();
  const drawer = page.getByRole("dialog", { name: "Audit pemetaan RFQ" });
  await expect(drawer.locator('option[value="rfq-demo-t02"]')).toBeDisabled();
  await drawer.getByRole("button", { name: "Tutup dialog" }).click();
  await breaker.getByRole("button", { name: "Setujui", exact: true }).click();
  await page.getByRole("row", { name: /mapping-transformer-guard/ }).getByRole("button", { name: "Detail audit" }).click();
  for (const id of ["rfq-demo-t01", "rfq-demo-t03", "rfq-demo-t05", "rfq-demo-cb"]) {
    await expect(drawer.locator(`option[value="${id}"]`)).toBeDisabled();
  }
  await drawer.getByLabel("Target RFQ manual").selectOption("rfq-demo-t02");
  await drawer.getByRole("button", { name: "Terapkan target manual" }).click();
  await expect(drawer).toContainText("DISETUJUI");
  await drawer.getByRole("button", { name: "Tutup dialog" }).click();
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Ringkasan", exact: true }).click();
  await expect(page.getByRole("article", { name: "Menunggu approval" }).locator(".kpi-value")).toHaveText("0");
  await expect(page.getByText("2 spesifikasi mandiri", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Semua pemetaan RFQ telah ditinjau");
});

for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "narrow", width: 390, height: 844 }]) {
  test(`${viewport.name}: readable pages, filter emptiness, modal focus, and private QA captures`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const scratch = ".superpowers/sdd/2026-10-12-material-cadang-mockup-v1/visual-qa";
    for (const route of ["ringkasan", "impor", "pemetaan-rfq", "analisis-abc", "inventory-policy", "prioritas-lokasi", "ekspor"]) {
      await page.goto(`/${route}/`);
      if (route === "impor") {
        await expect(page.getByRole("heading", { level: 1, name: "Impor & kualitas data" })).toBeVisible();
        await expect(page.getByLabel("Berkas snapshot XLSX")).toBeVisible();
        await expect(page.getByText("Data Demo", { exact: true })).toHaveCount(0);
      } else await expect(page.getByText("Data Demo", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator("body").innerText()).not.toMatch(/C:\\|D:\\|source-demo-|PRD\.md|SESSION_HANDOFF|\.superpowers|OPERASIONAL RAHASIA/);
      const tableBounds = await page.locator(".table-scroll").evaluateAll((tables) => tables.map((element) => ({ right: element.getBoundingClientRect().right, left: element.getBoundingClientRect().left })));
      for (const bounds of tableBounds) { expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(viewport.width); }
      const lowContrast = await page.locator(".page-description, .record-id, .button:not(:disabled), .badge, .section-note, .eyebrow, .sidebar nav a").evaluateAll((elements) => {
        const luminance = (rgb: string) => {
          const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        return elements.flatMap((element) => {
          let parent: Element | null = element;
          let background = "rgba(0, 0, 0, 0)";
          while (parent && background === "rgba(0, 0, 0, 0)") { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
          const foreground = luminance(getComputedStyle(element).color);
          const backdrop = luminance(background === "rgba(0, 0, 0, 0)" ? "rgb(255,255,255)" : background);
          const ratio = (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05);
          return ratio < 4.5 ? [`${element.textContent?.trim()}: ${ratio.toFixed(2)}`] : [];
        });
      });
      expect(lowContrast).toEqual([]);
      const clippedSelections = await page.locator(".mapping-filters select").evaluateAll((elements) => elements.flatMap((element) => {
        const select = element as HTMLSelectElement;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        context.font = getComputedStyle(select).font;
        const label = select.selectedOptions[0].textContent ?? "";
        return context.measureText(label).width + 40 > select.clientWidth ? [label] : [];
      }));
      expect(clippedSelections).toEqual([]);
      await page.screenshot({ path: `${scratch}/${viewport.name}-${route}.png`, fullPage: true });
      const scrolls = page.locator(".table-scroll");
      for (let index = 0; index < await scrolls.count(); index++) {
        const scroll = scrolls.nth(index);
        const reachable = await scroll.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
          const end = element.querySelector("thead th:last-child")?.getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return !end || (end.right <= bounds.right + 1 && end.right > bounds.left);
        });
        expect(reachable).toBe(true);
      }
    }
    await page.goto("/ringkasan/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Lewati ke konten utama" });
    await expect(skip).toBeFocused();
    expect(await skip.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.goto("/pemetaan-rfq/");
    const detailButton = page.getByRole("button", { name: "Detail audit" }).first();
    await detailButton.click();
    const mappingDialog = page.getByRole("dialog", { name: "Audit pemetaan RFQ" });
    await expect(mappingDialog).toBeVisible();
    await expect(mappingDialog.getByRole("button", { name: "Tutup dialog" })).toBeFocused();
    for (let count = 0; count < 5; count++) {
      await page.keyboard.press("Tab");
      expect(await mappingDialog.evaluate((element) => element.contains(document.activeElement)), `Tab ${count + 1}: ${await page.evaluate(() => document.activeElement?.tagName)}`).toBe(true);
    }
    await page.screenshot({ path: `${scratch}/${viewport.name}-mapping-dialog.png` });
    await page.keyboard.press("Escape");
    await expect(mappingDialog).not.toBeVisible();
    await expect(detailButton).toBeFocused();
    await page.getByLabel("Cari spesifikasi atau ID").fill("tidak-ada-hasil-demo");
    await expect(page.getByText(/Tidak ada pemetaan sesuai filter/)).toBeVisible();
    await page.goto("/analisis-abc/");
    await page.getByRole("tab", { name: "Filtered" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Whitelist" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Whitelist" })).toBeFocused();
    await page.getByLabel("Cari material ABC").fill("tidak-ada-hasil-demo");
    await expect(page.getByText("Tidak ada material pada filter ini.")).toBeVisible();
    await page.goto("/inventory-policy/");
    await page.getByRole("button", { name: "Penjelasan" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const policyClose = await page.getByRole("dialog").getByRole("button", { name: "Tutup dialog" }).boundingBox();
    expect(policyClose!.x + policyClose!.width).toBeLessThanOrEqual(viewport.width);
    expect(policyClose!.y, JSON.stringify(policyClose)).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: `${scratch}/${viewport.name}-policy-dialog.png` });
    await page.keyboard.press("Escape");
    await page.getByLabel("Cari material policy").fill("tidak-ada-hasil-demo");
    await expect(page.getByText("Tidak ada material pada filter ini.")).toBeVisible();
    await page.goto("/prioritas-lokasi/");
    await page.getByRole("button", { name: "Detail", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: `${scratch}/${viewport.name}-location-dialog.png` });
    await page.keyboard.press("Escape");
    await page.getByLabel("Cari GI").fill("tidak-ada-hasil-demo");
    await expect(page.getByText("Tidak ada lokasi pada filter ini.")).toBeVisible();
    await page.screenshot({ path: `${scratch}/${viewport.name}-location-empty.png`, fullPage: true });
    await page.getByRole("button", { name: "Reset filter" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(8);
  });
}
