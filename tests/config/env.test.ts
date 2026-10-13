import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicEnv, getServerEnv, parsePublicEnv, parseServerEnv } from "../../src/config/env";

const publicInput = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
};

const serverInput = {
  ...publicInput,
  SUPABASE_SECRET_KEY: "test-secret-key",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

afterEach(() => vi.unstubAllEnvs());

describe("public environment contract", () => {
  it("returns the named public settings without server secrets", () => {
    expect(parsePublicEnv(serverInput)).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "test-publishable-key",
    });
  });

  it.each([undefined, "", "   ", "not-a-url"])("rejects an invalid Supabase URL: %s", (value) => {
    expect(() => parsePublicEnv({ ...publicInput, NEXT_PUBLIC_SUPABASE_URL: value }))
      .toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it.each([undefined, "", "   "])("requires a publishable key: %s", (value) => {
    expect(() => parsePublicEnv({ ...publicInput, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value }))
      .toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("server environment contract", () => {
  it("returns public settings, the secret key, and site URL", () => {
    expect(parseServerEnv(serverInput)).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "test-publishable-key",
      supabaseSecretKey: "test-secret-key",
      siteUrl: "http://localhost:3000",
    });
  });

  it.each([undefined, "", "   "])("requires a secret key: %s", (value) => {
    expect(() => parseServerEnv({ ...serverInput, SUPABASE_SECRET_KEY: value }))
      .toThrow(/SUPABASE_SECRET_KEY/);
  });

  it.each([undefined, "", "   ", "not-a-url"])("requires a valid site URL: %s", (value) => {
    expect(() => parseServerEnv({ ...serverInput, NEXT_PUBLIC_SITE_URL: value }))
      .toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("also validates the public settings", () => {
    expect(() => parseServerEnv({ ...serverInput, NEXT_PUBLIC_SUPABASE_URL: undefined }))
      .toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseServerEnv({ ...serverInput, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }))
      .toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("names invalid variables without exposing supplied values in error output", () => {
    let caught: unknown;
    try {
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "invalid-sensitive-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sensitive-publishable-value",
        SUPABASE_SECRET_KEY: "sensitive-secret-value",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const output = `${String(caught)} ${JSON.stringify(caught)} ${(caught as Error).stack}`;
    expect(output).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(output).toContain("NEXT_PUBLIC_SITE_URL");
    expect(output).not.toMatch(/invalid-sensitive-url|sensitive-publishable-value|sensitive-secret-value/);
  });
});

describe("lazy environment getters", () => {
  it("can be imported without configured environment values", async () => {
    for (const name of Object.keys(serverInput)) vi.stubEnv(name, undefined);
    vi.resetModules();
    await expect(import("../../src/config/env")).resolves.toBeDefined();
  });

  it("reads current public values each time without requiring server values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", publicInput.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publicInput.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(getPublicEnv()).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "test-publishable-key",
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://updated.supabase.co");
    expect(getPublicEnv().supabaseUrl).toBe("https://updated.supabase.co");
  });

  it("reads current server values when called", () => {
    for (const [name, value] of Object.entries(serverInput)) vi.stubEnv(name, value);
    expect(getServerEnv()).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "test-publishable-key",
      supabaseSecretKey: "test-secret-key",
      siteUrl: "http://localhost:3000",
    });
    vi.stubEnv("SUPABASE_SECRET_KEY", "updated-test-secret");
    expect(getServerEnv().supabaseSecretKey).toBe("updated-test-secret");
  });

  it("validates missing settings only when called", () => {
    for (const name of Object.keys(serverInput)) vi.stubEnv(name, undefined);
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getServerEnv()).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
