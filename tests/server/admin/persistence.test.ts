// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createUserAdminDependencies } from "../../../src/server/admin/user-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database";
vi.mock("server-only", () => ({}));
const actorId = "40000000-0000-4000-8000-000000000001";
const input = { userId: "40000000-0000-4000-8000-000000000002", role: "UNIT_OPERATOR" as const, unitIndukIds: ["41000000-0000-4000-8000-000000000001"], status: "ACTIVE" as const };
describe("database-serialized access replacement boundary", () => {
  it("supplies actor and exact validated access to one RPC, with no separate mutations", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "UPDATED", error: null });
    const client = { rpc, from() { throw new Error("unserialized mutation"); } } as unknown as SupabaseClient<Database>;
    expect(await createUserAdminDependencies(client, "https://material.example").replaceAccess(input, actorId)).toBe("UPDATED");
    expect(rpc).toHaveBeenCalledWith("admin_replace_user_access", { p_actor_id: actorId, p_user_id: input.userId, p_role: "UNIT_OPERATOR", p_unit_induk_ids: input.unitIndukIds, p_status: "ACTIVE" });
  });
  it("preserves the database's fail-closed result during overlapping calls from separate service clients", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void; const firstStarted = new Promise<void>((resolve) => { started = resolve; });
    const calls: string[] = [];
    // The shared external gateway models row-lock serialization; the separate
    // client instances must each delegate the whole replacement to that RPC.
    const rpc = vi.fn().mockImplementation(async (name: string, args: { p_role: string }) => { calls.push(name); if (args.p_role === "UNIT_OPERATOR") { started(); await gate; return { data: "UPDATED", error: null }; } await gate; return { data: "FAILED", error: null }; });
    const makeClient = () => ({ rpc, from() { throw new Error("unserialized mutation"); } }) as unknown as SupabaseClient<Database>;
    const first = createUserAdminDependencies(makeClient(), "https://material.example").replaceAccess(input, actorId);
    await Promise.race([firstStarted, first]);
    const second = createUserAdminDependencies(makeClient(), "https://material.example").replaceAccess({ ...input, role: "VIEWER", unitIndukIds: [] }, actorId);
    release(); expect(await first).toBe("UPDATED"); expect(await second).toBe("FAILED"); expect(calls).toEqual(["admin_replace_user_access", "admin_replace_user_access"]);
  });
  it("refuses unrecognized or provider-error RPC responses", async () => {
    for (const result of [{ data: "secret backend error", error: null }, { data: null, error: { message: "secret" } }]) {
      const client = { rpc: async () => result } as unknown as SupabaseClient<Database>;
      await expect(createUserAdminDependencies(client, "https://material.example").replaceAccess(input, actorId)).rejects.toThrow("ADMIN_PERSISTENCE_FAILED");
    }
  });
});
