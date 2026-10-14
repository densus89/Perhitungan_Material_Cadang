// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createUserAdminDependencies } from "../../../src/server/admin/user-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
function client(failure?: string) {
  let status = "ACTIVE"; const operations: string[] = [];
  const fake = { from(table: string) { return {
    update(values: { status?: string }) { if (values.status) status = values.status; operations.push(`${table}:update:${values.status}`); return { eq() { return { select() { return Promise.resolve({ data: [{ id: "target" }], error: null }); } }; } }; },
    delete() { operations.push(`${table}:delete`); return { eq() { return Promise.resolve({ error: table === failure ? { code: "synthetic" } : null }); } }; },
    upsert() { operations.push(`${table}:upsert`); return Promise.resolve({ error: table === failure ? { code: "synthetic" } : null }); },
    insert() { operations.push(`${table}:insert`); return Promise.resolve({ error: table === failure ? { code: "synthetic" } : null }); },
  }; } } as unknown as SupabaseClient<Database>;
  return { fake, operations, getStatus: () => status };
}
const input = { userId: "30000000-0000-4000-8000-000000000002", role: "UNIT_OPERATOR" as const, unitIndukIds: ["31000000-0000-4000-8000-000000000001"], status: "ACTIVE" as const };
describe("fail-closed controlled access persistence", () => {
  it("leaves a partially updated account disabled", async () => {
    const state = client("user_unit_assignments"); const deps = createUserAdminDependencies(state.fake, "https://material.example");
    await expect(deps.replaceAccess(input, async () => {})).rejects.toThrow(); expect(state.getStatus()).toBe("DISABLED");
    expect(state.operations[0]).toBe("profiles:update:DISABLED"); expect(state.operations).not.toContain("profiles:update:ACTIVE");
  });
  it("restores requested status after every assignment step succeeds", async () => {
    const state = client(); const deps = createUserAdminDependencies(state.fake, "https://material.example"); await deps.replaceAccess(input, async () => {});
    expect(state.getStatus()).toBe("ACTIVE"); expect(state.operations).toEqual(["profiles:update:DISABLED", "user_role_assignments:upsert", "user_unit_assignments:delete", "user_unit_assignments:insert", "profiles:update:ACTIVE"]);
  });
  it("keeps access disabled when the success audit cannot be persisted", async () => {
    const state = client(); const deps = createUserAdminDependencies(state.fake, "https://material.example");
    await expect(deps.replaceAccess(input, async () => { throw new Error("audit unavailable"); })).rejects.toThrow();
    expect(state.getStatus()).toBe("DISABLED");
  });
});
