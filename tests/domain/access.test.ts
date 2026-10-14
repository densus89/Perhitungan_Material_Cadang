import { describe, expect, it } from "vitest";
import { can, isAllowedPlnEmail, normalizePlnEmail, type AppRole, type Permission } from "../../src/domain/access";

describe("PLN email boundary", () => {
  it("normalizes trimmed mixed-case PLN email", () => {
    expect(normalizePlnEmail("  Operator@PLN.CO.ID  ")).toBe("operator@pln.co.id");
    expect(isAllowedPlnEmail("  Operator@PLN.CO.ID  ")).toBe(true);
  });

  it("allows only the explicitly approved Gmail guest account", () => {
    expect(isAllowedPlnEmail("  Sitompul89@GMAIL.COM  ")).toBe(true);
    expect(isAllowedPlnEmail("other@gmail.com")).toBe(false);
    expect(isAllowedPlnEmail("sitompul89+alias@gmail.com")).toBe(false);
  });

  it.each(["user@gmail.com", "user@sub.pln.co.id", "user@pln.co.id.evil.com", "@pln.co.id", "", "user@@pln.co.id", "two words@pln.co.id"])("rejects %s", (email) => {
    expect(isAllowedPlnEmail(email)).toBe(false);
  });
});

describe("role permissions", () => {
  const permissions: Permission[] = ["MANAGE_USERS", "REVIEW_DATASET", "WRITE_OWN_UNIT", "READ_NATIONAL_SUMMARY"];
  it.each<{ role: AppRole; allowed: boolean[] }>([
    { role: "RST_ADMIN", allowed: [true, true, true, true] },
    { role: "RST_REVIEWER", allowed: [false, true, false, true] },
    { role: "UNIT_OPERATOR", allowed: [false, false, true, true] },
    { role: "VIEWER", allowed: [false, false, false, true] },
  ])("enforces permissions for $role", ({ role, allowed }) => {
    expect(permissions.map((permission) => can(role, permission))).toEqual(allowed);
  });

  it("denies unknown runtime role and permission values", () => {
    expect(can("OWNER" as AppRole, "MANAGE_USERS")).toBe(false);
    expect(can("RST_ADMIN", "DELETE_EVERYTHING" as Permission)).toBe(false);
  });
});
