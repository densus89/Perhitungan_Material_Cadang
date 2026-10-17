// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/admin/users/invite/route";
import { PATCH } from "../../../app/api/admin/users/[userId]/route";
import { ActorAccessError } from "../../../src/server/auth/actor";
const boundary = vi.hoisted(() => ({ requireActor: vi.fn(), session: vi.fn(), admin: vi.fn(), invite: vi.fn(), update: vi.fn(), dependencies: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: boundary.session }));
vi.mock("../../../src/lib/supabase/admin", () => ({ createAdminSupabaseClient: boundary.admin }));
vi.mock("../../../src/server/auth/actor", async (original) => ({ ...await original<object>(), requireActor: boundary.requireActor }));
vi.mock("../../../src/server/admin/user-service", () => ({ createUserAdminDependencies: boundary.dependencies, inviteUser: boundary.invite, updateUserAccess: boundary.update }));
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs(); boundary.requireActor.mockResolvedValue({ userId: "30000000-0000-4000-8000-000000000001", role: "RST_ADMIN", status: "ACTIVE" });
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture", SUPABASE_SECRET_KEY: "secret-fixture", NEXT_PUBLIC_SITE_URL: "https://material.example" })) vi.stubEnv(key, value);
  boundary.invite.mockResolvedValue({ status: 201, code: "USER_INVITED", message: "Berhasil" }); boundary.update.mockResolvedValue({ status: 200, code: "ACCESS_UPDATED", message: "Berhasil" });
});
function request(body: unknown, method = "POST", origin = "https://material.example") { return new Request("https://material.example/api/admin/users/invite/", { method, headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }); }
const input = { email: "new@pln.co.id", displayName: "New", role: "VIEWER", unitIndukIds: [] };
describe("admin JSON mutation routes", () => {
  it("accepts the exact trusted preview origin without changing invitation audience", async () => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_URL", "asset-preview-123-team.vercel.app");
    expect((await POST(request(input, "POST", "https://asset-preview-123-team.vercel.app"))).status).toBe(201);
    expect(boundary.dependencies).toHaveBeenCalledWith(undefined, "https://material.example");
    expect((await POST(request(input))).status).toBe(403);
  });
  it("rejects missing Origin and cross-site metadata before privilege", async () => {
    const missing = request(input); missing.headers.delete("Origin");
    const crossSite = request(input); crossSite.headers.set("Sec-Fetch-Site", "cross-site");
    expect((await POST(missing)).status).toBe(403); expect((await POST(crossSite)).status).toBe(403); expect(boundary.admin).not.toHaveBeenCalled();
  });
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("maps %s without creating a privileged client", async (code) => {
    boundary.requireActor.mockRejectedValue(new ActorAccessError(code));
    expect((await POST(request(input))).status).toBe(code === "UNAUTHENTICATED" ? 401 : 403); expect(boundary.admin).not.toHaveBeenCalled();
  });
  it("rejects non-admin callers before privileged work", async () => {
    boundary.requireActor.mockResolvedValue({ role: "VIEWER" }); expect((await POST(request(input))).status).toBe(403); expect(boundary.admin).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, invalid roles, cross-origin mutations and forged IDs", async () => {
    expect((await POST(new Request("https://material.example/api/admin/users/invite/", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://material.example" }, body: "{" }))).status).toBe(422);
    expect((await POST(request({ ...input, role: "OWNER" }))).status).toBe(422);
    expect((await POST(request(input, "POST", "https://evil.example"))).status).toBe(403);
    expect((await PATCH(request({ role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, "PATCH"), { params: Promise.resolve({ userId: "forged" }) })).status).toBe(422); expect(boundary.admin).not.toHaveBeenCalled();
  });
  it("returns service conflicts and successes as private JSON without credentials", async () => {
    const success = await POST(request(input)); expect(success.status).toBe(201); expect(success.headers.get("cache-control")).toMatch(/no-store/);
    boundary.invite.mockResolvedValue({ status: 409, code: "USER_EXISTS", message: "Konflik" }); expect((await POST(request(input))).status).toBe(409);
    const update = await PATCH(request({ role: "VIEWER", unitIndukIds: [], status: "DISABLED" }, "PATCH"), { params: Promise.resolve({ userId: "30000000-0000-4000-8000-000000000002" }) }); expect(update.status).toBe(200);
    boundary.invite.mockRejectedValue(new Error("secret-fixture token")); const error = await POST(request(input)); expect(error.status).toBe(500); expect(await error.text()).not.toMatch(/secret-fixture|token/);
  });
});
