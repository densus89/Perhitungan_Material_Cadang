// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database";
import { ActorAccessError, loadActor, requireActor } from "../../../src/server/auth/actor";

vi.mock("server-only", () => ({}));

type Fixture = {
  user: User | null;
  authError: object | null;
  profiles: object[] | null;
  user_role_assignments: object[] | null;
  user_unit_assignments: object[] | null;
  failedTable?: string;
  throws?: "auth" | "query";
  assurance?: { currentLevel: "aal1" | "aal2" | null; nextLevel: "aal1" | "aal2" | null };
  assuranceError?: object | null;
};

function clientWith(overrides: Partial<Fixture> = {}) {
  const fixture: Fixture = {
    user: { id: "auth-user", email: " Operator@PLN.CO.ID ", app_metadata: { role: "RST_ADMIN" }, user_metadata: { unit_induk_ids: ["forged-unit"] }, aud: "authenticated", created_at: "2026-10-13T00:00:00Z" },
    authError: null,
    profiles: [{ id: "auth-user", email: "operator@pln.co.id", display_name: "Operator", status: "ACTIVE" }],
    user_role_assignments: [{ user_id: "auth-user", role: "UNIT_OPERATOR" }],
    user_unit_assignments: [{ user_id: "auth-user", unit_induk_id: "unit-one" }, { user_id: "auth-user", unit_induk_id: "unit-two" }],
    assurance: { currentLevel: "aal1", nextLevel: "aal1" },
    assuranceError: null,
    ...overrides,
  };
  const queries: { table: string; column: string; value: string }[] = [];
  const client = {
    auth: { async getUser() {
      if (fixture.throws === "auth") throw new Error("Auth unavailable");
      return { data: { user: fixture.user }, error: fixture.authError };
    }, mfa: { async getAuthenticatorAssuranceLevel() {
      return { data: fixture.assurance, error: fixture.assuranceError };
    } } },
    from(table: "profiles" | "user_role_assignments" | "user_unit_assignments") {
      return { select() { return { async eq(column: string, value: string) {
        queries.push({ table, column, value });
        if (fixture.throws === "query") throw new Error("Database unavailable");
        return { data: fixture[table], error: fixture.failedTable === table ? { message: "denied" } : null };
      } }; } };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, queries };
}

describe("actor loading", () => {
  it("loads active actor using the authenticated ID and relational assignments", async () => {
    const { client, queries } = clientWith();
    expect(await loadActor(client)).toEqual({ userId: "auth-user", email: "operator@pln.co.id", displayName: "Operator", role: "UNIT_OPERATOR", status: "ACTIVE", unitIndukIds: ["unit-one", "unit-two"] });
    expect(queries).toEqual([
      { table: "profiles", column: "id", value: "auth-user" },
      { table: "user_role_assignments", column: "user_id", value: "auth-user" },
      { table: "user_unit_assignments", column: "user_id", value: "auth-user" },
    ]);
  });

  it.each<Partial<Fixture>>([
    { user: null },
    { authError: { message: "stale session" } },
    { profiles: [] },
    { profiles: null },
    { profiles: [{ id: "auth-user", email: "operator@pln.co.id", display_name: "Operator", status: "DISABLED" }] },
    { profiles: [{ id: "auth-user", email: "operator@pln.co.id", display_name: "Operator", status: "INVITED" }] },
    { profiles: [{ id: "auth-user", email: "other@pln.co.id", display_name: "Operator", status: "ACTIVE" }] },
    { user_role_assignments: [] },
    { user_role_assignments: null },
    { user_role_assignments: [{ role: "VIEWER" }, { role: "RST_ADMIN" }] },
    { user_role_assignments: [{ role: "OWNER" }] },
    { user_unit_assignments: null },
    { failedTable: "profiles" },
    { failedTable: "user_role_assignments" },
    { failedTable: "user_unit_assignments" },
    { throws: "auth" },
    { throws: "query" },
  ])("fails closed for invalid/missing/error data: %j", async (fixture) => {
    expect(await loadActor(clientWith(fixture).client)).toBeNull();
  });

  it("rejects a non-PLN Auth identity even if the profile claims PLN", async () => {
    const { client } = clientWith();
    const auth = await client.auth.getUser();
    const user = { ...auth.data.user!, email: "outsider@evil.com" };
    expect(await loadActor(clientWith({ user }).client)).toBeNull();
  });

  it("loads the approved Gmail guest when Auth and profile emails match", async () => {
    const email = "sitompul89@gmail.com";
    const { client } = clientWith();
    const auth = await client.auth.getUser();
    const user = { ...auth.data.user!, email };
    expect(await loadActor(clientWith({ user, profiles: [{ id: "auth-user", email, display_name: "Guest", status: "ACTIVE" }] }).client)).toMatchObject({ email });
  });

  it("allows no assigned units without granting metadata units", async () => {
    expect(await loadActor(clientWith({ user_unit_assignments: [] }).client)).toMatchObject({ unitIndukIds: [] });
  });

  it("rechecks disabled status on subsequent reads", async () => {
    expect(await loadActor(clientWith().client)).not.toBeNull();
    expect(await loadActor(clientWith({ profiles: [{ id: "auth-user", email: "operator@pln.co.id", display_name: "Operator", status: "DISABLED" }] }).client)).toBeNull();
  });
});

describe("required actor", () => {
  it("returns an authorized actor", async () => {
    expect(await requireActor(clientWith().client)).toMatchObject({ userId: "auth-user", role: "UNIT_OPERATOR" });
  });

  it("throws a typed 401 for absent/stale authentication", async () => {
    await expect(requireActor(clientWith({ user: null }).client)).rejects.toBeInstanceOf(ActorAccessError);
    await expect(requireActor(clientWith({ authError: {} }).client)).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("throws a typed 403 for missing application access", async () => {
    await expect(requireActor(clientWith({ user_role_assignments: [] }).client)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("requires AAL2 for an RST admin", async () => {
    const admin = { user_role_assignments: [{ role: "RST_ADMIN" }] };
    await expect(requireActor(clientWith(admin).client)).rejects.toMatchObject({ code: "MFA_REQUIRED", status: 403 });
    await expect(requireActor(clientWith({ ...admin, assurance: { currentLevel: "aal2", nextLevel: "aal2" } }).client))
      .resolves.toMatchObject({ role: "RST_ADMIN" });
  });

  it("fails closed when the assurance level cannot be verified", async () => {
    await expect(requireActor(clientWith({
      user_role_assignments: [{ role: "RST_ADMIN" }], assuranceError: { message: "unavailable" },
    }).client)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
