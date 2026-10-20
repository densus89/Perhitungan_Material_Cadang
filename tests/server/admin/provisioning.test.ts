// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createUserAdminDependencies, inviteUser } from "../../../src/server/admin/user-service";
import { bootstrapAdmin, createBootstrapGateway, parseBootstrapConfig } from "../../../scripts/bootstrap-admin.mjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database";
import type { Actor } from "../../../src/domain/access";
vi.mock("server-only", () => ({}));
const actor: Actor = { userId: "40000000-0000-4000-8000-000000000001", role: "RST_ADMIN", email: "admin@pln.co.id", displayName: "Admin", status: "ACTIVE", unitIndukIds: [] };
function provisioningClient(failAudit = false) {
  let status = "INVITED"; let role: string | null = null;
  const operations: string[] = []; const audits: unknown[] = [];
  const userId = "40000000-0000-4000-8000-000000000002";
  const client = {
    auth: { admin: { inviteUserByEmail: async () => ({ data: { user: { id: userId } }, error: null }), deleteUser: async () => ({ error: { message: "synthetic deletion failure" } }) } },
    from(table: string) { return {
      select() { const query = { eq: () => query, limit: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }), then(resolve: (value: unknown) => void) { resolve({ data: [], error: null }); } }; return query; },
      update(values: { status: string }) { status = values.status; operations.push(`status:${status}`); return { eq() { const result = { data: [{ id: userId }], error: null }; return { select: async () => result, then(resolve: (value: unknown) => void) { resolve(result); } }; } }; },
      upsert(values: { role: string }) { role = values.role; operations.push(`role:${role}`); return Promise.resolve({ error: null }); },
      delete() { return { eq: async () => ({ error: null }) }; },
      insert(event: { action: string }) { if (table === "audit_events") { operations.push(`audit:${event.action}`); if (failAudit && ["USER_INVITED", "ADMIN_BOOTSTRAPPED"].includes(event.action)) return Promise.resolve({ error: { message: "synthetic audit failure" } }); audits.push(event); } return Promise.resolve({ error: null }); },
    }; },
  } as unknown as SupabaseClient<Database>;
  return { client, operations, audits, getStatus: () => status, getRole: () => role };
}
describe("invitation provisioning is fail-closed even when compensation cannot delete Auth", () => {
  it("keeps a residual RST_ADMIN disabled after post-assignment audit and deletion failures", async () => {
    const state = provisioningClient(true); const deps = createUserAdminDependencies(state.client, "https://material.example"); deps.log = () => {};
    expect(await inviteUser(actor, { email: "new@pln.co.id", displayName: "New", role: "RST_ADMIN", unitIndukIds: [] }, deps)).toMatchObject({ status: 500 });
    expect(state.getRole()).toBe("RST_ADMIN"); expect(state.getStatus()).toBe("DISABLED"); expect(state.operations[0]).toBe("status:DISABLED");
    expect(state.audits).toContainEqual(expect.objectContaining({ action: "USER_INVITE_FAILED", details: { cleanup_failed: true, revoke_failed: false } }));
  });
  it("only permits invited self-activation after all provisioning and audit work succeeds", async () => {
    const state = provisioningClient(); const deps = createUserAdminDependencies(state.client, "https://material.example");
    expect(await inviteUser(actor, { email: "new@pln.co.id", displayName: "New", role: "RST_ADMIN", unitIndukIds: [] }, deps)).toMatchObject({ status: 201 });
    expect(state.operations).toEqual(["status:DISABLED", "role:RST_ADMIN", "audit:USER_INVITED", "status:INVITED"]);
  });
  it("applies the same staging and residual-disable guarantee to bootstrap", async () => {
    const state = provisioningClient(true);
    const config = parseBootstrapConfig({ BOOTSTRAP_ADMIN_EMAIL: "new@pln.co.id", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public", SUPABASE_SECRET_KEY: "fixture-secret", NEXT_PUBLIC_SITE_URL: "https://material.example" }, ["--confirm"]);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try { await expect(bootstrapAdmin(config, createBootstrapGateway(state.client))).rejects.toThrow("Bootstrap persistence failed"); } finally { errorLog.mockRestore(); }
    expect(state.getRole()).toBe("RST_ADMIN"); expect(state.getStatus()).toBe("DISABLED"); expect(state.operations[0]).toBe("status:DISABLED");
  });
});
