import { expect, type Page } from "@playwright/test";
import { E2E_IDENTITIES } from "./environment";

export async function loginAs(page: Page, email: string): Promise<void> {
  if (!Object.values(E2E_IDENTITIES).some((identity) => identity.email === email)) {
    throw new Error("Refusing to authenticate a non-synthetic E2E identity");
  }
  const password = process.env.E2E_TEST_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("Missing or invalid E2E environment variable: E2E_TEST_PASSWORD");
  }

  await page.goto("/login/");
  await page.getByLabel("Email PLN").fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/ringkasan\/$/);
}
