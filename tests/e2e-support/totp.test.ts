// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTotpCode } from "../e2e/support/totp";

describe("E2E TOTP helper", () => {
  it("matches the RFC 6238 SHA-1 vector", () => {
    expect(createTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000, 8)).toBe("94287082");
  });
});
