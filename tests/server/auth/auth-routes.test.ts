// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../app/auth/callback/route";
import { loginAction, resetPasswordAction, setPasswordAction, logoutAction } from "../../../app/auth/actions";
import PasswordPage from "../../../app/auth/set-password/page";
import LoginPage from "../../../app/login/page";
import MfaPage from "../../../app/auth/mfa/page";
import { renderToStaticMarkup } from "react-dom/server";

const boundary = vi.hoisted(() => ({
  client: {
    auth: {
      getUser: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(), signOut: vi.fn(), exchangeCodeForSession: vi.fn(),
    },
    rpc: vi.fn(),
  },
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: boundary.createClient }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://material.example");
  boundary.createClient.mockResolvedValue(boundary.client);
  for (const method of Object.values(boundary.client.auth)) method.mockResolvedValue({ error: null });
  boundary.client.auth.getUser.mockResolvedValue({ data: { user: { email: "operator@pln.co.id" } }, error: null });
  boundary.client.rpc.mockResolvedValue({ error: null });
  boundary.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("auth entry points", () => {
  it("redirects login success and keeps credentials out of serialized failures", async () => {
    const data = form({ email: "operator@pln.co.id", password: "private-password" });
    await expect(loginAction({ status: "idle" }, data)).rejects.toThrow("REDIRECT:/");
    boundary.client.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "secret" } });
    const result = await loginAction({ status: "idle" }, data);
    expect(result).toMatchObject({ status: "error" });
    expect(JSON.stringify(result)).not.toMatch(/secret|private-password/);
  });

  it("does not call Supabase for invalid action emails, malformed fields or passwords", async () => {
    expect(await loginAction({ status: "idle" }, form({ email: "user@pln.co.id.evil", password: "private-password" }))).toMatchObject({ status: "error" });
    const data = form({ password: "private-password" });
    data.set("email", new Blob(["user@pln.co.id"]));
    expect(await resetPasswordAction({ status: "idle" }, data)).toMatchObject({ status: "error" });
    expect(await setPasswordAction({ status: "idle" }, form({ password: "short", confirmPassword: "short" }))).toMatchObject({ status: "error" });
    expect(boundary.client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(boundary.client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(boundary.client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("derives recovery redirect from configured Site URL rather than posted input", async () => {
    const result = await resetPasswordAction({ status: "idle" }, form({ email: "operator@pln.co.id", siteUrl: "https://evil.example" }));
    expect(result).toMatchObject({ status: "success" });
    expect(boundary.client.auth.resetPasswordForEmail).toHaveBeenCalledWith("operator@pln.co.id", { redirectTo: "https://material.example/auth/callback?next=/auth/set-password" });
  });

  it("maps infrastructure failures safely and retains the generic recovery response", async () => {
    boundary.createClient.mockRejectedValue(new Error("secret-key"));
    const credentials = form({ email: "operator@pln.co.id", password: "private-password" });
    expect(await loginAction({ status: "idle" }, credentials)).toMatchObject({ status: "error", message: expect.any(String) });
    expect(await resetPasswordAction({ status: "idle" }, credentials)).toMatchObject({ status: "success", message: "Jika akun memenuhi syarat, tautan pemulihan akan dikirim ke email PLN tersebut." });
    expect(await logoutAction({ status: "idle" }, form({}))).toMatchObject({ status: "error" });
  });

  it("rechecks the setup session inside the action and refuses rendering without a verified user", async () => {
    boundary.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await setPasswordAction({ status: "idle" }, form({ password: "private-password", confirmPassword: "private-password" }))).toMatchObject({ status: "error" });
    expect(boundary.client.auth.updateUser).not.toHaveBeenCalled();
    await expect(PasswordPage()).rejects.toThrow("REDIRECT:/login/?error=invalid-link");
  });

  it("requires a verified allowed identity before rendering MFA setup", async () => {
    expect(await MfaPage()).toBeTruthy();
    boundary.client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(MfaPage()).rejects.toThrow("REDIRECT:/login/");
    boundary.client.auth.getUser.mockResolvedValueOnce({ data: { user: { email: "outsider@example.com" } }, error: null });
    await expect(MfaPage()).rejects.toThrow("REDIRECT:/login/");
  });

  it("renders password setup for verified PLN users and redirects only after activation succeeds", async () => {
    expect(await PasswordPage()).toBeTruthy();
    await expect(setPasswordAction({ status: "idle" }, form({ password: "private-password", confirmPassword: "private-password" }))).rejects.toThrow("REDIRECT:/");
    expect(boundary.client.rpc).toHaveBeenCalledWith("activate_my_profile");
    await expect(logoutAction({ status: "idle" }, form({}))).rejects.toThrow("REDIRECT:/login/");
  });

  it("preserves the saved-password/admin-support notice after activation failure clears session cookies", async () => {
    boundary.client.rpc.mockResolvedValueOnce({ error: { message: "secret" } });
    await expect(setPasswordAction({ status: "idle" }, form({ password: "private-password", confirmPassword: "private-password" }))).rejects.toThrow("REDIRECT:/login/?error=activation-failed");
    expect(boundary.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "activation-failed" }) }));
    expect(markup).toContain("Kata sandi telah disimpan");
    expect(markup).toContain("Hubungi admin DIV RST");
  });

  it("never reflects arbitrary callback provider errors into the login page", async () => {
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "secret-raw-provider-error" }) }));
    expect(markup).not.toContain("secret-raw-provider-error");
  });
});

describe("PKCE callback", () => {
  it.each(["/auth/set-password", "/auth/set-password/", "/"])("exchanges code and redirects internally to %s with private cache headers", async (next) => {
    const response = await GET(new Request(`https://material.example/auth/callback?code=valid-code&next=${encodeURIComponent(next)}`));
    expect(boundary.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe(`https://material.example${next === "/" ? "/" : "/auth/set-password/"}`);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("defaults invitation callbacks to password setup", async () => {
    const response = await GET(new Request("https://material.example/auth/callback?code=valid-code"));
    expect(response.headers.get("location")).toBe("https://material.example/auth/set-password/");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/auth/set-password?next=//evil.example", "/admin", "%2F%2Fevil.example"])("rejects unapproved next %s before exchanging code", async (next) => {
    const response = await GET(new Request(`https://material.example/auth/callback?code=valid-code&next=${encodeURIComponent(next)}`));
    expect(response.headers.get("location")).toBe("https://material.example/login/?error=invalid-link");
    expect(boundary.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each(["", "?code=", "?code=a&code=b", "?code=a&next=/&next=/auth/set-password", "?code=a&error=access_denied&error_description=secret"])("rejects absent or ambiguous callback state %s", async (query) => {
    const response = await GET(new Request(`https://material.example/auth/callback${query}`));
    expect(response.headers.get("location")).toBe("https://material.example/login/?error=invalid-link");
    expect(boundary.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("maps an expired PKCE code or thrown exchange failure to a generic no-store redirect", async () => {
    boundary.client.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "secret" } });
    const response = await GET(new Request("https://material.example/auth/callback?code=expired"));
    expect(response.headers.get("location")).toBe("https://material.example/login/?error=invalid-link");
    boundary.client.auth.exchangeCodeForSession.mockRejectedValueOnce(new Error("secret"));
    const thrownResponse = await GET(new Request("https://material.example/auth/callback?code=expired"));
    expect(thrownResponse.headers.get("location")).toBe(response.headers.get("location"));
    expect(thrownResponse.headers.get("cache-control")).toContain("no-store");
  });
});
