import { describe, expect, it } from "vitest";
import { inviteUserSchema, updateUserAccessSchema, validateUserAccess } from "../../src/domain/user-admin";

describe("user access validation", () => {
  it("normalizes exact PLN emails and preserves validated role and unit IDs", () => {
    expect(inviteUserSchema.parse({ email: " Operator@PLN.CO.ID ", displayName: " Operator ", role: "UNIT_OPERATOR", unitIndukIds: ["31000000-0000-4000-8000-000000000001"] })).toEqual({ email: "operator@pln.co.id", displayName: "Operator", role: "UNIT_OPERATOR", unitIndukIds: ["31000000-0000-4000-8000-000000000001"] });
  });
  it.each(["x@sub.pln.co.id", "x@pln.co.id.evil", "x@@pln.co.id", "x@evil.example"])("rejects %s", (email) => {
    expect(inviteUserSchema.safeParse({ email, displayName: "X", role: "VIEWER", unitIndukIds: [] }).success).toBe(false);
  });
  it("requires operator units and rejects malformed/duplicate IDs and unknown roles", () => {
    for (const input of [{ role: "UNIT_OPERATOR", unitIndukIds: [] }, { role: "OWNER", unitIndukIds: [] }, { role: "VIEWER", unitIndukIds: ["forged"] }, { role: "VIEWER", unitIndukIds: ["31000000-0000-4000-8000-000000000001", "31000000-0000-4000-8000-000000000001"] }]) expect(validateUserAccess(input).success).toBe(false);
  });
  it.each(["RST_ADMIN", "RST_REVIEWER", "VIEWER"])("allows %s without unit assignment", (role) => {
    expect(validateUserAccess({ role, unitIndukIds: [] }).success).toBe(true);
  });
  it("permits disable but never lets the browser skip invited password setup", () => {
    expect(updateUserAccessSchema.safeParse({ userId: "30000000-0000-4000-8000-000000000001", role: "VIEWER", unitIndukIds: [], status: "DISABLED" }).success).toBe(true);
    expect(updateUserAccessSchema.safeParse({ userId: "bad", role: "VIEWER", unitIndukIds: [], status: "ACTIVE", unexpected: true }).success).toBe(false);
  });
});
