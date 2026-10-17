// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImportSchema } from "../../../src/domain/asset-import/schemas";
import { assetImportMutation } from "../../../src/server/import/http";
import { ActorAccessError } from "../../../src/server/auth/actor";
import { actor, unitId } from "./fakes";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), session: vi.fn(), admin: vi.fn(), deps: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/server/auth/actor", async (original) => ({ ...await original<object>(), requireActor: mocks.actor }));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.session }));
vi.mock("../../../src/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.admin }));
vi.mock("../../../src/server/import/dependencies", () => ({ createImportDependencies: mocks.deps }));
export const createInput = { unitId, fileName: "synthetic.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", byteSize: 123, sha256: "a".repeat(64) };
export function request(body: unknown, origin = "https://material.example", type = "application/json") { return new Request("https://material.example/api/imports/", { method: "POST", headers: { Origin: origin, "Content-Type": type }, body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs(); mocks.actor.mockResolvedValue(actor);
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture", SUPABASE_SECRET_KEY: "secret-fixture", NEXT_PUBLIC_SITE_URL: "https://material.example" })) vi.stubEnv(key, value);
});
const handler = async () => ({ importId: "30000000-0000-4000-8000-000000000001", stage: "UPLOAD" });
describe("import mutation boundary", () => {
  const accepted = async () => ({ importId: "30000000-0000-4000-8000-000000000001", datasetId: "30000000-0000-4000-8000-000000000002", versionId: "30000000-0000-4000-8000-000000000003", stage: "UPLOAD" });
  it.each([
    { site: "https://material.example\r\n", status: 403 },
    { site: "https://material.example\n", status: 403 },
    { site: "https://material.example", status: 200 },
  ])("requires newline-free canonical configuration even for a trusted preview %#", async ({ site, status }) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", site); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_URL", "asset-preview-123-team.vercel.app");
    expect((await assetImportMutation(request(createInput, "https://asset-preview-123-team.vercel.app"), createImportSchema, accepted)).status).toBe(status);
    if (status === 403) expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    { environment: "preview", vercel: "1", url: "asset-preview-123-team.vercel.app", origin: "https://asset-preview-123-team.vercel.app", status: 200 },
    { environment: "production", vercel: "1", url: "asset-preview-123-team.vercel.app", origin: "https://material.example", status: 200 },
    { environment: "production", vercel: "1", url: "asset-preview-123-team.vercel.app", origin: "https://asset-preview-123-team.vercel.app", status: 403 },
    { environment: "preview", vercel: "1", url: "asset-preview-123-team.vercel.app", origin: "https://material.example", status: 403 },
    { environment: "preview", vercel: "1", url: "asset-preview-123-team.vercel.app", origin: "https://other-preview.vercel.app", status: 403 },
    { environment: undefined, vercel: undefined, url: "asset-preview-123-team.vercel.app", origin: "https://asset-preview-123-team.vercel.app", status: 403 },
    { environment: undefined, vercel: undefined, url: undefined, origin: "https://material.example", status: 200 },
  ])("uses only the trusted deployment origin %#", async ({ environment, vercel, url, origin, status }) => {
    vi.stubEnv("VERCEL_ENV", environment); vi.stubEnv("VERCEL", vercel); vi.stubEnv("VERCEL_URL", url);
    expect((await assetImportMutation(request(createInput, origin), createImportSchema, accepted)).status).toBe(status);
  });
  it.each([undefined, "", "https://asset-preview.vercel.app", "asset-preview.vercel.app/", "asset-preview.vercel.app/path", "asset-preview.vercel.app?query=1", "asset-preview.vercel.app#fragment", "actor@asset-preview.vercel.app", "asset-preview.vercel.app:443", "asset-preview.vercel.app.evil.example", "evil.example", "asset-preview.vercel.app\n", "UPPER.vercel.app", "-asset.vercel.app", "asset-.vercel.app"])("fails closed for malformed preview configuration %#", async url => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_URL", url);
    expect((await assetImportMutation(request(createInput), createImportSchema, accepted)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not trust preview flags without Vercel system context", async () => {
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_URL", "asset-preview.vercel.app");
    expect((await assetImportMutation(request(createInput), createImportSchema, accepted)).status).toBe(403);
  });
  it.each(["https://user:pass@material.example", "https://material.example/path", "https://material.example?x=1", "https://material.example#x", "ftp://material.example", "not-a-url"])("fails closed for invalid canonical origin %#", async site => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);
    expect((await assetImportMutation(request(createInput), createImportSchema, accepted)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("never derives trusted origins from request or forwarding hosts", async () => {
    const forged = new Request("https://evil.example/api/imports/", { method: "POST", headers: { Origin: "https://evil.example", Host: "evil.example", "X-Forwarded-Host": "evil.example", "Content-Type": "application/json" }, body: JSON.stringify(createInput) });
    expect((await assetImportMutation(forged, createImportSchema, accepted)).status).toBe(403);
    const crossSite = request(createInput); crossSite.headers.set("Sec-Fetch-Site", "cross-site");
    expect((await assetImportMutation(crossSite, createImportSchema, accepted)).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("rejects %s before privilege", async (code) => {
    mocks.actor.mockRejectedValue(new ActorAccessError(code));
    expect((await assetImportMutation(request(createInput), createImportSchema, handler)).status).toBe(code === "UNAUTHENTICATED" ? 401 : 403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["RST_ADMIN", "RST_REVIEWER", "VIEWER"] as const)("rejects %s as uploader", async (role) => {
    mocks.actor.mockResolvedValue({ ...actor, role }); expect((await assetImportMutation(request(createInput), createImportSchema, handler)).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    { ...createInput, unitId: "10000000-0000-4000-8000-000000000002" },
  ])("rejects another unit before privilege", async (input) => { expect((await assetImportMutation(request(input), createImportSchema, handler)).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled(); });
  it.each([
    { ...createInput, unitId: "bad" }, { ...createInput, fileName: "data.xls" }, { ...createInput, fileName: "../data.xlsx" },
    { ...createInput, mimeType: "text/plain" }, { ...createInput, byteSize: 52428801 }, { ...createInput, objectPath: "unit/forged.xlsx" },
    { ...createInput, actorId: actor.userId }, { ...createInput, datasetId: actor.userId },
  ])("rejects malformed or forged authority %#", async (input) => { expect((await assetImportMutation(request(input), createImportSchema, handler)).status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled(); });
  it("rejects origin and content type before privilege", async () => {
    expect((await assetImportMutation(request(createInput, "https://evil.example"), createImportSchema, handler)).status).toBe(403);
    expect((await assetImportMutation(request(createInput, undefined, "text/plain"), createImportSchema, handler)).status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("rejects missing origin and malformed JSON before privilege", async () => {
    const missing = new Request("https://material.example/api/imports/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createInput) });
    expect((await assetImportMutation(missing, createImportSchema, handler)).status).toBe(403);
    const malformed = new Request("https://material.example/api/imports/", { method: "POST", headers: { Origin: "https://material.example", "Content-Type": "application/json" }, body: "{" });
    expect((await assetImportMutation(malformed, createImportSchema, handler)).status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("checks an item's relational unit with the session client before privilege", async () => {
    mocks.session.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { unit_induk_id: "10000000-0000-4000-8000-000000000002" }, error: null }) }) }) }) });
    const { importIdSchema } = await import("../../../src/domain/asset-import/schemas");
    expect((await assetImportMutation(request({}), importIdSchema, handler, { importId: "30000000-0000-4000-8000-000000000001" })).status).toBe(404); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("returns private sanitized errors", async () => {
    const response = await assetImportMutation(request(createInput), createImportSchema, async () => { throw new Error("secret-fixture bearer token unit/other raw workbook"); });
    expect(response.status).toBe(500); expect(response.headers.get("cache-control")).toContain("private, no-store"); expect(await response.text()).not.toMatch(/secret-fixture|bearer|unit\/other|raw workbook/);
  });
});
