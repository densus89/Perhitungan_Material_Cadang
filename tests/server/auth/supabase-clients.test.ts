// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";
import { createBrowserSupabaseClient } from "../../../src/lib/supabase/browser";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";
import { createAdminSupabaseClient } from "../../../src/lib/supabase/admin";

const adapters = vi.hoisted(() => ({
  browser: vi.fn(() => ({ kind: "browser" })),
  server: vi.fn((_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({ kind: "server", cookies: options.cookies })),
  admin: vi.fn(() => ({ kind: "admin" })),
  publicEnv: vi.fn(() => ({ supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public-test-key" })),
  serverEnv: vi.fn(() => ({ supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public-test-key", supabaseSecretKey: "server-test-key", siteUrl: "https://app.example" })),
  cookies: vi.fn(),
  cookieStore: { getAll: vi.fn(() => [{ name: "session", value: "session-value" }]), set: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/config/env", () => ({ getPublicEnv: adapters.publicEnv, getServerEnv: adapters.serverEnv }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: adapters.browser, createServerClient: adapters.server }));
vi.mock("@supabase/supabase-js", () => ({ createClient: adapters.admin }));
vi.mock("next/headers", () => ({ cookies: adapters.cookies }));

beforeEach(() => {
  vi.clearAllMocks();
  adapters.cookieStore.set.mockReset();
  adapters.cookies.mockResolvedValue(adapters.cookieStore);
});

describe("Supabase client boundaries", () => {
  it("creates browser clients with only public configuration", () => {
    createBrowserSupabaseClient();
    expect(adapters.browser).toHaveBeenCalledWith("https://example.supabase.co", "public-test-key");
    expect(adapters.serverEnv).not.toHaveBeenCalled();
  });

  it("awaits request cookies and exposes getAll/setAll on a new server client", async () => {
    await createServerSupabaseClient();
    const cookieAdapter = adapters.server.mock.calls[0][2].cookies;
    expect(cookieAdapter.getAll()).toEqual([{ name: "session", value: "session-value" }]);
    await cookieAdapter.setAll!([{ name: "session", value: "renewed", options: { path: "/", secure: true } }], {});
    expect(adapters.cookieStore.set).toHaveBeenCalledWith("session", "renewed", { path: "/", secure: true });
    expect(adapters.serverEnv).not.toHaveBeenCalled();
    await createServerSupabaseClient();
    expect(adapters.cookies).toHaveBeenCalledTimes(2);
    expect(adapters.server).toHaveBeenCalledTimes(2);
  });

  it("supports read-only Server Component cookies while Proxy handles refresh", async () => {
    adapters.cookieStore.set.mockImplementation(() => { throw new Error("Cookies can only be modified in a Server Action or Route Handler."); });
    await createServerSupabaseClient();
    await expect(Promise.resolve().then(() => adapters.server.mock.calls[0][2].cookies.setAll!([{ name: "session", value: "renewed", options: {} }], {}))).resolves.toBeUndefined();
  });

  it("does not swallow unrelated cookie storage failures", async () => {
    adapters.cookieStore.set.mockImplementation(() => { throw new Error("Storage unavailable"); });
    await createServerSupabaseClient();
    expect(() => adapters.server.mock.calls[0][2].cookies.setAll!([{ name: "session", value: "renewed", options: {} }], {})).toThrow("Storage unavailable");
  });

  it("creates privileged clients without persistence, refresh or URL sessions", () => {
    createAdminSupabaseClient();
    expect(adapters.admin).toHaveBeenCalledWith("https://example.supabase.co", "server-test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(adapters.serverEnv).toHaveBeenCalledTimes(1);
  });

  it("does not read runtime configuration when importing clients", async () => {
    vi.resetModules();
    await Promise.all([import("../../../src/lib/supabase/browser"), import("../../../src/lib/supabase/server"), import("../../../src/lib/supabase/admin")]);
    expect(adapters.publicEnv).not.toHaveBeenCalled();
    expect(adapters.serverEnv).not.toHaveBeenCalled();
  });
});
