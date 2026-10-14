// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { GET } from "../../../app/auth/callback/route";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document; close(): void } } };
const cookieState = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [...cookieState.values].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => cookieState.values.set(name, value) }) }));
const user = { id: "40000000-0000-4000-8000-000000000002", email: "recipient@pln.co.id", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-10-14T00:00:00Z" };
const accessToken = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), role: "authenticated", aud: "authenticated" })).toString("base64url"), "synthetic-signature"].join(".");
let requests: { url: string; body: unknown }[];
beforeEach(() => {
  cookieState.values.clear(); requests = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-public");
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => { requests.push({ url: String(url), body: options?.body ? JSON.parse(String(options.body)) : null }); return Response.json(String(url).endsWith("/user") ? user : { access_token: accessToken, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user }); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("recipient invitation callback using real SSR Auth cookie storage", () => {
  it("verifies a token hash and makes the recipient session readable from server cookies", async () => {
    const response = await GET(new Request("https://material.example/auth/callback?token_hash=synthetic-hash&type=invite&next=/auth/set-password"));
    expect(response.headers.get("location")).toBe("https://material.example/auth/set-password/");
    expect(requests).toContainEqual({ url: "https://fixture.supabase.co/auth/v1/verify", body: expect.objectContaining({ token_hash: "synthetic-hash", type: "invite" }) });
    expect([...cookieState.values.keys()].some((name) => name.startsWith("sb-fixture-auth-token"))).toBe(true);
    const recipientClient = await createServerSupabaseClient();
    expect((await recipientClient.auth.getSession()).data.session?.access_token).toBe(accessToken);
    expect((await recipientClient.auth.getUser()).data.user?.id).toBe(user.id);
    expect(response.headers.get("cache-control")).toMatch(/no-store/); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("location")).not.toMatch(/synthetic-hash|access_token|refresh_token/);
  });
  it.each(["token_hash=x&type=invite&code=y", "token_hash=x&token_hash=y&type=invite", "token_hash=x&type=invite&type=invite", "token_hash=x&type=recovery", "token_hash=x", "token_hash=&type=invite", "token_hash=x&type=invite&next=//evil.example", "token_hash=x&type=invite&next=/&next=/auth/set-password", "code=x&type=invite", "token_hash=x&type=invite&error=provider-secret"])("rejects mixed, ambiguous or unsafe input: %s", async (query) => {
    const response = await GET(new Request(`https://material.example/auth/callback?${query}`)); expect(response.headers.get("location")).toBe("https://material.example/login/?error=invalid-link"); expect(requests).toEqual([]); expect(cookieState.values.size).toBe(0);
  });
  it("maps provider errors without creating a session or reflecting token/error content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error_code: "otp_expired", msg: "provider-secret synthetic-hash" }, { status: 403 })));
    const response = await GET(new Request("https://material.example/auth/callback?token_hash=synthetic-hash&type=invite")); expect(response.headers.get("location")).toBe("https://material.example/login/?error=invalid-link"); expect(cookieState.values.size).toBe(0); expect(await response.text()).not.toMatch(/provider-secret|synthetic-hash/);
  });
  it("renders the source-controlled invitation template into exactly the compatible callback shape", async () => {
    const template = readFileSync(new URL("../../../supabase/templates/invite.html", import.meta.url), "utf8");
    const html = template.replaceAll("{{ .RedirectTo }}", "https://material.example/auth/callback?next=/auth/set-password").replaceAll("{{ .TokenHash }}", "synthetic-hash");
    const parsed = new JSDOM(html); const link = parsed.window.document.querySelector("a")!.href; const url = new URL(link);
    expect(url.origin + url.pathname).toBe("https://material.example/auth/callback"); expect([...url.searchParams]).toEqual([["next", "/auth/set-password"], ["token_hash", "synthetic-hash"], ["type", "invite"]]);
    const response = await GET(new Request(link)); expect(response.headers.get("location")).toBe("https://material.example/auth/set-password/"); expect(cookieState.values.size).toBeGreaterThan(0); parsed.window.close();
  });
});
