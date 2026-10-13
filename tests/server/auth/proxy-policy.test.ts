// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
// Next 16.4's bundled guide names doesProxyMatch, but the installed export still
// uses doesMiddlewareMatch; this helper executes Next's actual matcher parser.
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import type { CookieMethodsServer } from "@supabase/ssr";
import { config, proxy } from "../../../proxy";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, error: null as object | null, throws: false, refresh: false }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/config/env", () => ({ getPublicEnv: () => ({ supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public-test-key" }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({ auth: { async getUser() {
  if (auth.refresh) {
    await options.cookies.setAll!([{ name: "session", value: "refreshed", options: { path: "/", httpOnly: true, sameSite: "lax", secure: true } }], { "Cache-Control": "private, no-store", Expires: "0", Pragma: "no-cache" });
    await options.cookies.setAll!([{ name: "old-chunk", value: "", options: { path: "/", maxAge: 0 } }], {});
  }
  if (auth.throws) throw new Error("Auth unavailable");
  return { data: { user: auth.user }, error: auth.error };
} } }) }));

beforeEach(() => { Object.assign(auth, { user: null, error: null, throws: false, refresh: false }); });

describe("Proxy route policy", () => {
  it.each(["/login", "/login/", "/auth/callback", "/auth/callback/", "/auth/set-password", "/auth/set-password/"])("keeps public route %s reachable", async (path) => {
    expect((await proxy(new NextRequest(`https://app.example${path}`))).headers.get("location")).toBeNull();
  });

  it.each(["/", "/ringkasan", "/impor/", "/login/extra", "/auth/set-password/extra", "/api/private"])("redirects unauthenticated %s to login", async (path) => {
    const response = await proxy(new NextRequest(`https://app.example${path}?next=https://evil.com`));
    expect(response.headers.get("location")).toBe("https://app.example/login");
  });

  it("redirects authenticated login to the national summary", async () => {
    auth.user = { id: "user" };
    expect((await proxy(new NextRequest("https://app.example/login/?next=https://evil.com"))).headers.get("location")).toBe("https://app.example/ringkasan");
  });

  it("allows authenticated workspace requests", async () => {
    auth.user = { id: "user" };
    expect((await proxy(new NextRequest("https://app.example/ringkasan/"))).headers.get("location")).toBeNull();
  });

  it.each(["error", "throws"])("denies stale/unverifiable authentication: %s", async (failure) => {
    auth.user = { id: "stale" };
    if (failure === "error") auth.error = {};
    else auth.throws = true;
    expect((await proxy(new NextRequest("https://app.example/ringkasan"))).headers.get("location")).toBe("https://app.example/login");
  });

  it.each([false, true])("preserves refreshed cookies and cache headers across redirect=%s", async (redirect) => {
    auth.refresh = true;
    if (!redirect) auth.user = { id: "user" };
    const request = new NextRequest("https://app.example/ringkasan", { headers: { cookie: "session=stale; old-chunk=stale" } });
    const response = await proxy(request);
    expect(request.cookies.get("session")?.value).toBe("refreshed");
    expect(response.cookies.get("session")).toMatchObject({ value: "refreshed", path: "/", httpOnly: true, sameSite: "lax", secure: true });
    expect(response.cookies.get("old-chunk")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    if (!redirect) expect(response.headers.get("x-middleware-request-cookie")).toContain("session=refreshed");
  });
});

describe("Proxy matcher", () => {
  it.each(["/_next/static/chunk.js", "/_next/image?url=test.png", "/favicon.ico", "/logo.svg", "/photo.png", "/photo.jpg", "/photo.jpeg", "/photo.gif", "/photo.webp", "/font.woff2", "/styles.css", "/script.js", "/robots.txt", "/sitemap.xml", "/auth/callback", "/auth/callback/", "/auth/callback/resource"])("excludes %s", (url) => {
    expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(false);
  });
  it.each(["/", "/login", "/login/", "/ringkasan/", "/auth/set-password", "/api/private", "/auth/callback-trick"])("covers %s", (url) => {
    expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
  });
});
