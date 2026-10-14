import { describe, expect, it } from "vitest";
import { requireE2eData, requireE2eSuccess } from "../e2e/support/users";

describe("E2E Supabase response guard", () => {
  it("returns non-null data and fails closed for errors or null data", () => {
    expect(requireE2eData({ data: { id: "synthetic" }, error: null }, "fixture")).toEqual({ id: "synthetic" });
    expect(() => requireE2eData({ data: null, error: null }, "fixture")).toThrow("Synthetic E2E fixture failed");
    expect(() => requireE2eData({ data: { id: "synthetic" }, error: new Error("provider-secret") }, "fixture")).toThrow("Synthetic E2E fixture failed");
    try {
      requireE2eData({ data: null, error: new Error("provider-secret") }, "fixture");
    } catch (error) {
      expect(String(error)).not.toContain("provider-secret");
    }
  });

  it("accepts a successful mutation with null data while still rejecting provider errors", () => {
    expect(() => requireE2eSuccess({ data: null, error: null }, "fixture mutation")).not.toThrow();
    expect(() => requireE2eSuccess({ data: null, error: new Error("provider-secret") }, "fixture mutation"))
      .toThrow("Synthetic E2E fixture mutation failed");
  });
});
