import { expect, type Page } from "@playwright/test";
import { E2E_IDENTITIES, parseE2eEnvironment } from "./environment";
import { createE2EAdminClient, resetSyntheticE2EAdminMfa } from "./users";
import { createTotpCode } from "./totp";

export async function loginAs(page: Page, email: string): Promise<void> {
  if (!Object.values(E2E_IDENTITIES).some((identity) => identity.email === email)) {
    throw new Error("Refusing to authenticate a non-synthetic E2E identity");
  }
  const password = process.env.E2E_TEST_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("Missing or invalid E2E environment variable: E2E_TEST_PASSWORD");
  }

  const isAdmin = email === E2E_IDENTITIES.admin.email;
  if (isAdmin) {
    const environment = parseE2eEnvironment(process.env);
    await resetSyntheticE2EAdminMfa(createE2EAdminClient(environment));
  }

  await page.goto("/login/");
  await page.getByLabel("Email PLN").fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  if (isAdmin) {
    await expect(page).toHaveURL(/\/auth\/mfa\/$/);
    await page.getByRole("button", { name: "Siapkan autentikator" }).click();
    const secret = (await page.locator("code").textContent())?.trim();
    if (!secret) throw new Error("Synthetic E2E MFA enrollment returned no secret");
    await page.getByLabel("Kode autentikator 6 digit").fill(createTotpCode(secret));
    await page.getByRole("button", { name: "Verifikasi dan lanjutkan" }).click();
  }
  await expect(page).toHaveURL(/\/ringkasan\/$/);
}
