import { expect, test } from "@playwright/test";
import { E2E_IDENTITIES } from "./support/environment";
import { loginAs } from "./support/session";

test("unauthenticated workspace access redirects to login", async ({ page }) => {
  await page.goto("/ringkasan/");
  await expect(page).toHaveURL(/\/login\/?(?:\?.*)?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Masuk ke akun PLN" })).toBeVisible();
});

test("synthetic admin can sign in and open user administration", async ({ page }) => {
  await loginAs(page, E2E_IDENTITIES.admin.email);
  await expect(page.getByRole("heading", { level: 1, name: "Ringkasan Perencanaan" })).toBeVisible();
  await page.getByRole("link", { name: "Kelola Pengguna" }).click();
  await expect(page).toHaveURL(/\/admin\/pengguna\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pengguna & akses" })).toBeVisible();
});

test("synthetic operator can use the workspace but not admin pages or APIs", async ({ page }) => {
  await loginAs(page, E2E_IDENTITIES.operator.email);
  await expect(page.getByRole("heading", { level: 1, name: "Ringkasan Perencanaan" })).toBeVisible();
  await page.goto("/admin/pengguna/");
  await expect(page.getByRole("alert").filter({ hasText: "Akses administrasi DIV RST diperlukan" }))
    .toContainText("Akses administrasi DIV RST diperlukan");

  const response = await page.request.post("/api/admin/users/invite/", {
    data: {
      email: "never-created.synthetic@pln.co.id",
      displayName: "Synthetic Forbidden Probe",
      role: "VIEWER",
      unitIndukIds: [],
    },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
});

test("logout invalidates subsequent workspace access", async ({ page }) => {
  await loginAs(page, E2E_IDENTITIES.operator.email);
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/login\/$/);
  await page.goto("/ringkasan/");
  await expect(page).toHaveURL(/\/login\/?(?:\?.*)?$/);
});
