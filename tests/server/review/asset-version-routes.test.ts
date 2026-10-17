// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../../../app/api/reviews/asset-versions/route";
import { GET as detail } from "../../../app/api/reviews/asset-versions/[versionId]/route";
import { POST as approve } from "../../../app/api/reviews/asset-versions/[versionId]/approve/route";
import { POST as returnVersion } from "../../../app/api/reviews/asset-versions/[versionId]/return/route";
import { POST as trash } from "../../../app/api/reviews/asset-versions/[versionId]/trash/route";
import { actor } from "../import/fakes";
import ReviewPage from "../../../app/(workspace)/review-snapshot/page";
import { renderToStaticMarkup } from "react-dom/server";
import { readFixture, unit } from "./review-read-fixture";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), session: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/server/auth/actor", async original => ({ ...await original<object>(), requireActor: mocks.actor }));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.session }));
vi.mock("../../../src/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.admin }));
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.spyOn(console, "warn").mockImplementation(() => {}); mocks.actor.mockResolvedValue({ ...actor, role: "RST_REVIEWER" }); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://material.example"); });
afterEach(() => { vi.restoreAllMocks(); });
const context = { params: Promise.resolve({ versionId: actor.userId }) };
it.each(["UNIT_OPERATOR", "VIEWER"])("denies %s on all review routes before service client", async role => { mocks.actor.mockResolvedValue({ ...actor, role }); for (const handler of [GET, detail, approve, returnVersion, trash]) { const result = await handler(new Request("https://material.example/api/reviews/asset-versions/", { method: handler === GET || handler === detail ? "GET" : "POST" }), context); expect(result.status).toBe(403); expect(result.headers.get("cache-control")).toContain("no-store"); } expect(mocks.admin).not.toHaveBeenCalled(); });
it("rejects injected filters and malformed ids without privilege", async () => { expect((await GET(new Request("https://material.example/api/reviews/asset-versions/?issue=BAD),x.eq.secret"))).status).toBe(422); expect((await detail(new Request("https://material.example/"), { params: Promise.resolve({ versionId: "bad" }) })).status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled(); });
it("rejects cross-origin mutations and reviewer trash before privilege", async () => { for (const handler of [approve, returnVersion, trash]) expect((await handler(new Request("https://material.example/", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}" }), context)).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled(); });
it.each(["UNIT_OPERATOR", "VIEWER"])("server page denies %s without unit or private queries", async role => { mocks.actor.mockResolvedValue({ ...actor, role }); expect(renderToStaticMarkup(await ReviewPage())).toContain("Akses DIV RST diperlukan"); expect(mocks.admin).not.toHaveBeenCalled(); });
it("returns a no-store bounded filtered queue for RST", async () => { const rpc = vi.fn(async () => ({ data: { versions: [], total: 0, offset: 50 }, error: null })); mocks.admin.mockReturnValue({ rpc }); const response = await GET(new Request("https://material.example/api/reviews/asset-versions/?offset=50&status=HISTORICAL&filter=WARNING")); expect(response.status).toBe(200); expect(await response.json()).toEqual({ versions: [], total: 0, offset: 50 }); expect(rpc).toHaveBeenCalledWith("list_asset_version_reviews", { p_filters: { offset: 50, status: "HISTORICAL", filter: "WARNING" } }); });
it("validates independent comparison/mapping query pages before privileged reads", async () => { for (const query of ["view=comparison&offset=-1", "view=comparison&kind=REMOVED),unit.eq.secret", "view=mapping&offset=16384", "view=RAW"]) expect((await detail(new Request(`https://material.example/?${query}`), context)).status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled(); });
it("accepts safe real-state unprocessed DRAFT trash for admin without synthetic run UUIDs", async () => {
  const f = readFixture(), expected = { kind: "UNPROCESSED_DRAFT", unitId: unit, sourceFileId: actor.userId, mappingRevision: actor.userId, updatedAt: "2026-10-16T00:00:00Z" };
  Object.assign(f.state, { versionId: actor.userId, status: "DRAFT", eligibleDraftTrash: true, runId: null, expected }); mocks.actor.mockResolvedValue({ ...actor, role: "RST_ADMIN" }); mocks.admin.mockReturnValue(f.client);
  const result = await trash(new Request("https://material.example/", { method: "POST", headers: { origin: "https://material.example", "content-type": "application/json" }, body: JSON.stringify({ expected, notes: "Duplicate digest checked", confirmed: true }) }), context);
  expect(result.status).toBe(200); expect(f.client.rpc).toHaveBeenCalledWith("review_asset_version", expect.objectContaining({ p_expected: expected, p_action: "TRASH" }));
});
it("accepts only this deployment's trusted preview origin for review decisions", async () => {
  const f = readFixture(), expected = { kind: "UNPROCESSED_DRAFT", unitId: unit, sourceFileId: actor.userId, mappingRevision: actor.userId, updatedAt: "2026-10-16T00:00:00Z" };
  Object.assign(f.state, { versionId: actor.userId, status: "DRAFT", eligibleDraftTrash: true, runId: null, expected }); mocks.actor.mockResolvedValue({ ...actor, role: "RST_ADMIN" }); mocks.admin.mockReturnValue(f.client);
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_URL", "asset-preview-123-team.vercel.app");
  const request = (origin: string) => new Request("https://asset-preview-123-team.vercel.app/", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ expected, notes: "Synthetic duplicate digest checked", confirmed: true }) });
  expect((await trash(request("https://asset-preview-123-team.vercel.app"), context)).status).toBe(200);
  mocks.admin.mockClear(); expect((await trash(request("https://material.example"), context)).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled();
});
