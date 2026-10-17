import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";
import { E2E_IDENTITIES } from "./support/environment";

test("waits for the final summary when chained auth navigation exceeds five seconds", async ({ browser }) => {
  test.setTimeout(40000);
  const page = await browser.newPage({ baseURL: "https://synthetic-navigation.invalid" });
  try {
    // Exercise the real helper/browser without another Auth mutation or network.
    await page.route("https://synthetic-navigation.invalid/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const body = path === "/login/"
        ? '<form onsubmit="event.preventDefault(); location.href=\'/\'"><label>Email PLN<input></label><label>Kata sandi<input type="password"></label><button>Masuk</button></form>'
        : path === "/" ? '<p>Authenticating</p><script>setTimeout(() => location.href="/ringkasan/", 6500)</script>' : '<h1>Ringkasan</h1>';
      await route.fulfill({ contentType: "text/html", body });
    });
    await loginAs(page, E2E_IDENTITIES.operator.email);
    await expect(page).toHaveURL("https://synthetic-navigation.invalid/ringkasan/");
  } finally { await page.close(); }
});
