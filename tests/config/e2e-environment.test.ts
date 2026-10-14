import { describe, expect, it } from "vitest";
import {
  E2E_IDENTITIES,
  E2E_SYNTHETIC_MARKER,
  assertSyntheticE2eUser,
  safeE2eFailure,
  parseE2eEnvironment,
} from "../e2e/support/environment";

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  SUPABASE_SECRET_KEY: "secret-test-key",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  E2E_TEST_PASSWORD: "synthetic-password-only",
  E2E_CONFIRM_SYNTHETIC_DEV_PROJECT: "yes-delete-synthetic-users",
};

describe("E2E environment contract", () => {
  it("accepts only an explicitly confirmed hosted development project", () => {
    expect(parseE2eEnvironment(validEnvironment)).toMatchObject({
      supabaseUrl: validEnvironment.NEXT_PUBLIC_SUPABASE_URL,
      siteUrl: validEnvironment.NEXT_PUBLIC_SITE_URL,
      password: validEnvironment.E2E_TEST_PASSWORD,
    });
  });

  it("fails closed without every runtime value and never includes supplied secrets", () => {
    expect(() => parseE2eEnvironment({
      ...validEnvironment,
      SUPABASE_SECRET_KEY: "do-not-print-this-secret",
      E2E_TEST_PASSWORD: undefined,
    })).toThrow(/E2E_TEST_PASSWORD/);
    try {
      parseE2eEnvironment({
        ...validEnvironment,
        SUPABASE_SECRET_KEY: "do-not-print-this-secret",
        E2E_TEST_PASSWORD: undefined,
      });
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print-this-secret");
    }
  });

  it("rejects non-hosted targets and missing destructive-operation confirmation", () => {
    expect(() => parseE2eEnvironment({
      ...validEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: "https://database.example.com",
    })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseE2eEnvironment({
      ...validEnvironment,
      E2E_CONFIRM_SYNTHETIC_DEV_PROJECT: "true",
    })).toThrow(/E2E_CONFIRM_SYNTHETIC_DEV_PROJECT/);
  });

  it("recognizes only the exact synthetic users and immutable marker", () => {
    expect(E2E_IDENTITIES.admin.email).toMatch(/\.synthetic@pln\.co\.id$/);
    expect(E2E_IDENTITIES.operator.email).toMatch(/\.synthetic@pln\.co\.id$/);
    expect(() => assertSyntheticE2eUser({
      email: E2E_IDENTITIES.admin.email,
      app_metadata: { e2e_marker: E2E_SYNTHETIC_MARKER },
    })).not.toThrow();
    expect(() => assertSyntheticE2eUser({
      email: "employee@pln.co.id",
      app_metadata: { e2e_marker: E2E_SYNTHETIC_MARKER },
    })).toThrow(/synthetic/i);
    expect(() => assertSyntheticE2eUser({
      email: E2E_IDENTITIES.operator.email,
      app_metadata: {},
    })).toThrow(/synthetic/i);
  });

  it("preserves only known synthetic operation errors", () => {
    expect(safeE2eFailure(new Error("Synthetic E2E unit lookup failed"), "fallback")).toBe("Synthetic E2E unit lookup failed");
    expect(safeE2eFailure(new Error("provider-secret"), "fallback")).toBe("fallback");
    expect(safeE2eFailure("provider-secret", "fallback")).toBe("fallback");
  });
});
