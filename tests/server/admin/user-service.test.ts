// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { inviteUser, updateUserAccess, type UserAdminDependencies } from "../../../src/server/admin/user-service";
import type { Actor } from "../../../src/domain/access";
vi.mock("server-only", () => ({}));
const admin: Actor = { userId: "30000000-0000-4000-8000-000000000001", email: "admin@pln.co.id", displayName: "Admin", role: "RST_ADMIN", status: "ACTIVE", unitIndukIds: [] };
const input = { email: " Operator@PLN.CO.ID ", displayName: "Operator", role: "UNIT_OPERATOR" as const, unitIndukIds: ["31000000-0000-4000-8000-000000000001"] };
function dependencies() {
  const events: unknown[] = []; const calls: string[] = [];
  const deps: UserAdminDependencies = {
    siteUrl: "https://material.example", unitsExist: async () => true, emailExists: async () => false,
    invite: async (email, redirectTo) => { calls.push(`${email}|${redirectTo}`); return { userId: "30000000-0000-4000-8000-000000000002" }; },
    deleteAuthUser: async (id) => { calls.push(`delete:${id}`); },
    saveInvitation: async () => { calls.push("save"); },
    markInvited: async () => { calls.push("markInvited"); }, revokeAccess: async () => { calls.push("revoke"); },
    readUser: async () => ({ status: "ACTIVE" }),
    replaceAccess: async (input, actorId) => { calls.push("replace"); await deps.audit({ actor_id: actorId, action: "USER_ACCESS_UPDATED", target_type: "profile", target_id: input.userId, details: { role: input.role, unit_induk_ids: input.unitIndukIds, status: input.status } }); return "UPDATED"; },
    audit: async (event) => { events.push(event); }, log: (code) => { calls.push(`log:${code}`); },
  };
  return { deps, calls, events };
}
describe("RST user administration services", () => {
  it.each(["RST_REVIEWER", "UNIT_OPERATOR", "VIEWER"] as const)("denies %s mutations before privileged calls", async (role) => {
    const { deps, calls, events } = dependencies(); const actor = { ...admin, role };
    expect(await inviteUser(actor, input, deps)).toMatchObject({ status: 403 });
    expect(await updateUserAccess(actor, { userId: "30000000-0000-4000-8000-000000000002", role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, deps)).toMatchObject({ status: 403 });
    expect(calls).toEqual([]); expect(events).toEqual([]);
  });
  it("checks database units before invitation and rejects unknown units", async () => {
    const { deps, calls } = dependencies(); deps.unitsExist = async () => false;
    expect(await inviteUser(admin, input, deps)).toMatchObject({ status: 422 }); expect(calls).toEqual([]);
  });
  it("rejects invalid domain and operator assignments before calling dependencies", async () => {
    const { deps, calls, events } = dependencies();
    expect(await inviteUser(admin, { ...input, email: "operator@pln.co.id.evil" }, deps)).toMatchObject({ status: 422 });
    expect(await updateUserAccess(admin, { userId: "30000000-0000-4000-8000-000000000002", role: "UNIT_OPERATOR", unitIndukIds: [], status: "ACTIVE" }, deps)).toMatchObject({ status: 422 });
    expect(calls).toEqual([]); expect(events).toEqual([]);
  });
  it("returns a stable duplicate conflict for persistence and Auth duplicates", async () => {
    const first = dependencies(); first.deps.emailExists = async () => true;
    const conflict = await inviteUser(admin, input, first.deps);
    expect(conflict).toMatchObject({ status: 409, code: "USER_EXISTS" }); expect(first.calls).toEqual([]);
    const second = dependencies(); second.deps.invite = async () => ({ conflict: true });
    expect(await inviteUser(admin, input, second.deps)).toEqual(conflict);
  });
  it("invites to password setup, persists access, and appends a token-free success audit", async () => {
    const { deps, calls, events } = dependencies();
    expect(await inviteUser(admin, input, deps)).toMatchObject({ status: 201 });
    expect(calls).toEqual(["operator@pln.co.id|https://material.example/auth/invite", "save", "markInvited"]);
    expect(events).toEqual([expect.objectContaining({ actor_id: admin.userId, action: "USER_INVITED", target_type: "profile", target_id: "30000000-0000-4000-8000-000000000002", details: { role: "UNIT_OPERATOR", unit_induk_ids: input.unitIndukIds } })]);
    expect(JSON.stringify(events)).not.toMatch(/token|password/);
  });
  it("deletes a created Auth account and audits when access persistence fails", async () => {
    const { deps, calls, events } = dependencies(); deps.saveInvitation = async () => { throw new Error("provider secret token"); };
    const result = await inviteUser(admin, input, deps);
    expect(result).toMatchObject({ status: 500 }); expect(JSON.stringify(result)).not.toMatch(/secret|token/);
    expect(calls).toContain("delete:30000000-0000-4000-8000-000000000002");
    expect(events).toEqual([expect.objectContaining({ action: "USER_INVITE_FAILED", details: { cleanup_failed: false, revoke_failed: false } })]);
  });
  it("reports cleanup failure through sanitized audit and logs", async () => {
    const { deps, calls, events } = dependencies(); deps.saveInvitation = async () => { throw new Error("secret"); }; deps.deleteAuthUser = async () => { throw new Error("secret"); };
    expect(await inviteUser(admin, input, deps)).toMatchObject({ status: 500 });
    expect(calls).toContain("log:INVITE_CLEANUP_FAILED"); expect(events).toEqual([expect.objectContaining({ details: { cleanup_failed: true, revoke_failed: false } })]); expect(JSON.stringify({ calls, events })).not.toContain("secret");
  });
  it("replaces access and audits disabling without deleting history", async () => {
    const { deps, calls, events } = dependencies();
    expect(await updateUserAccess(admin, { userId: "30000000-0000-4000-8000-000000000002", role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, deps)).toMatchObject({ status: 200 });
    expect(calls).toEqual(["replace"]); expect(events).toEqual([expect.objectContaining({ action: "USER_ACCESS_UPDATED", details: { role: "VIEWER", unit_induk_ids: [], status: "DISABLED" } })]);
  });
  it("prevents invited activation and self access changes", async () => {
    const { deps, calls } = dependencies(); deps.readUser = async () => ({ status: "INVITED" });
    expect(await updateUserAccess(admin, { userId: "30000000-0000-4000-8000-000000000002", role: "VIEWER", unitIndukIds: [], status: "ACTIVE" }, deps)).toMatchObject({ status: 409 });
    expect(await updateUserAccess(admin, { userId: admin.userId, role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, deps)).toMatchObject({ status: 409 }); expect(calls).toEqual([]);
  });
  it("audits and safely reports an access update failure", async () => {
    const { deps, calls, events } = dependencies(); deps.replaceAccess = async () => { throw new Error("secret backend detail"); };
    const result = await updateUserAccess(admin, { userId: "30000000-0000-4000-8000-000000000002", role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, deps);
    expect(result).toMatchObject({ status: 500 }); expect(JSON.stringify(result)).not.toContain("secret");
    expect(events).toEqual([expect.objectContaining({ action: "USER_ACCESS_UPDATE_FAILED" })]); expect(calls).toContain("log:USER_ACCESS_UPDATE_FAILED");
  });
  it.each([["FORBIDDEN", 403], ["ACCESS_CONFLICT", 409], ["FAILED", 500]] as const)("honors database outcome %s without claiming success", async (outcome, status) => {
    const { deps, events } = dependencies(); deps.replaceAccess = async () => outcome;
    expect(await updateUserAccess(admin, { userId: "30000000-0000-4000-8000-000000000002", role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, deps)).toMatchObject({ status });
    expect(events).toEqual([]);
  });
});
