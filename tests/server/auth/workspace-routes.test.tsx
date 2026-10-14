// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceLayout from "../../../app/(workspace)/layout";
import Home from "../../../app/page";

const boundary = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: boundary.createClient }));
vi.mock("../../../app/auth/actions", () => ({ logoutAction: async () => ({ status: "idle" }) }));
// Only external session/database I/O is replaced; requireActor/loadActor stay real.
type Fixture = {
  authenticated: boolean;
  authError: boolean;
  status: "ACTIVE" | "DISABLED" | "INVITED";
  roles: { role: string }[];
  assignedIds: string[];
  unitRows: { id: string; name: string }[] | null;
  unitError: boolean;
};
let fixture: Fixture;
let unitQueries: string[][];

beforeEach(() => {
  fixture = {
    authenticated: true, authError: false, status: "ACTIVE", roles: [{ role: "UNIT_OPERATOR" }],
    assignedIds: ["unit-jbb", "unit-jbt"],
    // Deliberately return a different order from the authoritative assignments.
    unitRows: [{ id: "unit-jbt", name: "UIT Jawa Bagian Tengah" }, { id: "unit-jbb", name: "UIT Jawa Bagian Barat" }],
    unitError: false,
  };
  unitQueries = [];
  boundary.createClient.mockReset().mockResolvedValue({
    auth: { async getUser() {
      return { data: { user: fixture.authenticated ? { id: "workspace-user", email: "operator@pln.co.id" } : null }, error: fixture.authError ? { message: "stale-session" } : null };
    } },
    from(table: string) {
      return { select() { return {
        async eq() {
          const rows: Record<string, object[]> = {
            profiles: [{ id: "workspace-user", email: "operator@pln.co.id", display_name: "Operator Perencanaan", status: fixture.status }],
            user_role_assignments: fixture.roles,
            user_unit_assignments: fixture.assignedIds.map((unit_induk_id) => ({ unit_induk_id })),
          };
          return { data: rows[table], error: null };
        },
        async in(column: string, ids: string[]) {
          if (table !== "unit_induk" || column !== "id") throw new Error("Wrong assigned-unit lookup");
          unitQueries.push([...ids]);
          return { data: fixture.unitRows, error: fixture.unitError ? { message: "private database error" } : null };
        },
      }; } };
    },
  });
});

describe("protected workspace server boundary", () => {
  it("renders the verified actor and assigned names in assignment order", async () => {
    const markup = renderToStaticMarkup(await WorkspaceLayout({ children: <p>Protected calculation</p> }));
    expect(markup).toContain("Operator Perencanaan");
    expect(markup).toContain("operator@pln.co.id");
    expect(markup).toContain("Protected calculation");
    expect(markup).toContain("UIT Jawa Bagian Barat");
    expect(markup.indexOf("UIT Jawa Bagian Barat")).toBeLessThan(markup.indexOf("UIT Jawa Bagian Tengah"));
    expect(unitQueries).toEqual([["unit-jbb", "unit-jbt"]]);
  });

  it.each(["absent", "stale"])("redirects %s sessions before rendering workspace children", async (session) => {
    fixture.authenticated = session !== "absent";
    fixture.authError = session === "stale";
    await expect(Promise.resolve().then(() => WorkspaceLayout({ children: <p>Protected calculation</p> }))).rejects.toMatchObject({ digest: expect.stringContaining("/login/") });
    expect(unitQueries).toEqual([]);
  });

  it.each(["DISABLED", "INVITED"] as const)("denies a %s profile even with an Auth user", async (status) => {
    fixture.status = status;
    const markup = renderToStaticMarkup(await WorkspaceLayout({ children: <p>Protected calculation</p> }));
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Protected calculation");
    expect(markup).not.toContain("Navigasi utama");
    expect(unitQueries).toEqual([]);
  });

  it("rechecks removed relational access on the next server render", async () => {
    expect(renderToStaticMarkup(await WorkspaceLayout({ children: <p>Protected calculation</p> }))).toContain("Protected calculation");
    fixture.roles = [];
    expect(renderToStaticMarkup(await WorkspaceLayout({ children: <p>Protected calculation</p> }))).not.toContain("Protected calculation");
  });

  it.each(["error", "missing", "null"])("fails closed on %s assigned-unit data", async (failure) => {
    fixture.unitError = failure === "error";
    fixture.unitRows = failure === "missing" ? [{ id: "unit-jbb", name: "UIT Jawa Bagian Barat" }] : null;
    const markup = renderToStaticMarkup(await WorkspaceLayout({ children: <p>Protected calculation</p> }));
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Protected calculation");
    expect(markup).not.toContain("private database error");
  });

  it("allows an RST actor with no assigned units without querying unit data", async () => {
    fixture.roles = [{ role: "RST_REVIEWER" }];
    fixture.assignedIds = [];
    const markup = renderToStaticMarkup(await WorkspaceLayout({ children: <p>Protected calculation</p> }));
    expect(markup).toContain("Protected calculation");
    expect(markup).toContain("Belum ada Unit Induk ditugaskan");
    expect(unitQueries).toEqual([]);
  });
});

describe("root session redirect", () => {
  it("redirects an active authenticated actor to ringkasan", async () => {
    await expect(Promise.resolve().then(() => Home())).rejects.toMatchObject({ digest: expect.stringContaining("/ringkasan/") });
  });

  it.each(["absent", "stale", "disabled", "missing-role"])("redirects %s access to login", async (access) => {
    fixture.authenticated = access !== "absent";
    fixture.authError = access === "stale";
    fixture.status = access === "disabled" ? "DISABLED" : "ACTIVE";
    fixture.roles = access === "missing-role" ? [] : [{ role: "UNIT_OPERATOR" }];
    await expect(Promise.resolve().then(() => Home())).rejects.toMatchObject({ digest: expect.stringContaining("/login/") });
  });
});
