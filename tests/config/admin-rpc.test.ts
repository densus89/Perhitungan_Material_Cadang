// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wrapTapSql } from "../../scripts/db-test.mjs";
const migration = readFileSync(new URL("../../supabase/migrations/202610140001_admin_user_access.sql", import.meta.url), "utf8");
describe("pending admin RPC static security contract", () => {
  it("is a service-role-only definer with a pinned empty search path", () => {
    expect(migration).toMatch(/security definer\s+set search_path = ''/i);
    expect(migration).toMatch(/revoke all on function public\.admin_replace_user_access\([^;]+from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.admin_replace_user_access\([^;]+to service_role/i);
    expect(migration).toMatch(/profile\.status = 'ACTIVE'/); expect(migration).toMatch(/assignment\.role = 'RST_ADMIN'/);
  });
  it("locks the target before disabling and performs replacement inside a caught subtransaction", () => {
    const lock = migration.indexOf("for update"); const disable = migration.indexOf("set status = 'DISABLED'");
    const protectedBlock = migration.indexOf("-- Protected replacement"); const replacement = migration.indexOf("insert into public.user_role_assignments");
    expect(lock).toBeGreaterThan(0); expect(disable).toBeGreaterThan(lock); expect(protectedBlock).toBeGreaterThan(disable); expect(replacement).toBeGreaterThan(protectedBlock);
    expect(migration).toMatch(/exception when others then/); expect(migration).not.toMatch(/sqlerrm|raise exception.*%/i);
  });
  it("keeps failure auditing in a separately caught block so it cannot revive the target", () => {
    expect(migration).toMatch(/exception when others then\s+begin[\s\S]+USER_ACCESS_UPDATE_FAILED[\s\S]+exception when others then\s+null;/);
    expect(migration).toMatch(/return 'FAILED'/); expect(migration).toMatch(/return 'UPDATED'/);
  });
  it("wraps the RPC behavioral pgTAP suite without any fixture commit", () => {
    const test = readFileSync(new URL("../../supabase/tests/003_admin_user_access.test.sql", import.meta.url), "utf8"); expect(() => wrapTapSql(test)).not.toThrow();
    expect(test).toContain("activate_my_profile"); expect(test).toContain("forged"); expect(test).toContain("USER_ACCESS_UPDATED");
  });
});
