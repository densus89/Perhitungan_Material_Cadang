import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as browser from "../../src/lib/supabase/browser";
import InvitePage from "../../app/auth/invite/page";
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const actualFactory = browser.createBrowserSupabaseClient;
const user = { id: "40000000-0000-4000-8000-000000000002", email: "recipient@pln.co.id", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-10-14T00:00:00Z" };
const accessToken = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), role: "authenticated", aud: "authenticated" })).toString("base64url"), "synthetic-signature"].join(".");
const refreshToken = "synthetic-invite-refresh";
const validFragment = `#access_token=${accessToken}&expires_at=${Math.floor(Date.now() / 1000) + 3600}&expires_in=3600&refresh_token=${refreshToken}&token_type=bearer&type=invite`;
let factory: ReturnType<typeof vi.spyOn>; let setSession: ReturnType<typeof vi.spyOn> | undefined;
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, "", "/auth/invite/");
  for (const cookie of document.cookie.split(";")) document.cookie = `${cookie.split("=")[0].trim()}=; Max-Age=0; Path=/`;
  localStorage.clear(); sessionStorage.clear(); setSession = undefined;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-public");
  logs = ["log", "warn", "error", "info", "debug"].map((name) => vi.spyOn(console, name as "log").mockImplementation(() => {}));
  vi.stubGlobal("fetch", vi.fn(async () => { expect(window.location.hash).toBe(""); return Response.json(user); }));
  factory = vi.spyOn(browser, "createBrowserSupabaseClient").mockImplementation(() => {
    expect(window.location.hash).toBe(""); const client = actualFactory(); setSession = vi.spyOn(client.auth, "setSession"); return client;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function putFragment(fragment: string) { window.history.replaceState(null, "", `/auth/invite/?next=//untrusted.example${fragment}`); }
function assertNoTokenExposure() {
  const loggedValues = logs.flatMap((log) => log.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => `${String(value)} ${JSON.stringify(value)}`)));
  const publicOutput = [document.body.textContent, window.location.href, JSON.stringify(navigation.replace.mock.calls), ...loggedValues].join("|");
  expect(publicOutput).not.toContain(accessToken); expect(publicOutput).not.toContain(refreshToken);
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(window.location.hash).toBe(""); expect(window.location.search).toBe("");
}
describe("default Supabase invitation landing", () => {
  it("scrubs history before real SSR browser setSession writes cookies and replace-navigates once in Strict Mode", async () => {
    putFragment(validFragment); const scrub = vi.spyOn(window.history, "replaceState"); render(<StrictMode><InvitePage /></StrictMode>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/auth/set-password/"));
    expect(scrub).toHaveBeenCalledWith(null, "", "/auth/invite/"); expect(factory).toHaveBeenCalledTimes(1); expect(setSession).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledWith({ access_token: accessToken, refresh_token: refreshToken });
    expect(scrub.mock.invocationCallOrder[0]).toBeLessThan(factory.mock.invocationCallOrder[0]); expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain("sb-fixture-auth-token"); expect((await actualFactory().auth.getSession()).data.session?.access_token).toBe(accessToken);
    expect(screen.getByRole("heading", { name: /undangan/i })).toBeInTheDocument(); assertNoTokenExposure();
  });
  it("announces non-secret loading while verification is pending, then safely announces failure", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>((resolve) => { finish = resolve; })));
    putFragment(validFragment); render(<InvitePage />); expect(screen.getByRole("status")).toHaveTextContent(/memproses/i);
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1)); expect(navigation.replace).not.toHaveBeenCalled(); assertNoTokenExposure();
    await act(async () => finish(Response.json({ msg: `${accessToken} ${refreshToken}`, error_code: "bad_jwt" }, { status: 403 })));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/undangan tidak valid/i)); expect(navigation.replace).toHaveBeenCalledWith("/login/?error=invalid-link"); assertNoTokenExposure();
  });
  it("accepts a default fragment without an optional type marker", async () => {
    putFragment(validFragment.replace("&type=invite", "")); render(<InvitePage />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/auth/set-password/")); expect(setSession).toHaveBeenCalledTimes(1); assertNoTokenExposure();
  });
  it.each([
    "", `#access_token=${accessToken}`, `#access_token=&refresh_token=${refreshToken}`, `#access_token=${accessToken}&refresh_token=`,
    `${validFragment}&access_token=duplicate`, `${validFragment}&refresh_token=duplicate`, `${validFragment}&type=invite`,
    validFragment.replace("&type=invite", "&type=recovery"), validFragment.replace("&type=invite", "&type="),
    `${validFragment}&error=access_denied`, `${validFragment}&error_description=secret`, `${validFragment}&error_code=bad_jwt`,
    validFragment.replace(refreshToken, "%ZZ"), validFragment.replace(refreshToken, "%C3%28"),
    `#access_token=%20&refresh_token=${refreshToken}`, "#access_token=malformed&refresh_token=malformed&type=invite", `${validFragment}&code=untrusted`,
  ])("rejects malformed/duplicate/provider-error fragment %s before setSession", async (fragment) => {
    putFragment(fragment); render(<InvitePage />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login/?error=invalid-link")); expect(factory).not.toHaveBeenCalled(); expect(setSession).toBeUndefined();
    expect(screen.getByRole("alert")).toHaveTextContent(/undangan tidak valid/i); assertNoTokenExposure();
  });
});
