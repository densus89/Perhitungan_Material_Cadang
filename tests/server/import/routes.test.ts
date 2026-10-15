// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/imports/route";
import { GET } from "../../../app/api/imports/[importId]/route";
import { POST as complete } from "../../../app/api/imports/[importId]/upload-complete/route";
import { POST as mapping } from "../../../app/api/imports/[importId]/mapping/route";
import { POST as processWorkbook } from "../../../app/api/imports/[importId]/process/route";
import { POST as submit } from "../../../app/api/imports/[importId]/submit/route";
import { actor, unitId } from "./fakes";
const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), session: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/server/auth/actor", async (original) => ({ ...await original<object>(), requireActor: mocks.requireActor }));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.session }));
vi.mock("../../../src/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.admin }));
beforeEach(() => { vi.resetAllMocks(); mocks.requireActor.mockResolvedValue(actor); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://material.example"); });
it("all item handlers await params and reject invalid IDs before privileged work", async () => {
  const context = { params: Promise.resolve({ importId: "invalid" }) };
  for (const route of [complete, mapping, processWorkbook, submit]) {
    const response = await route(new Request("https://material.example/api/imports/invalid/", { method: "POST", headers: { Origin: "https://material.example", "Content-Type": "application/json" }, body: "{}" }), context);
    expect(response.status).toBe(422); expect(response.headers.get("cache-control")).toContain("no-store");
  }
  expect((await GET(new Request("https://material.example/api/imports/invalid/"), context)).status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled();
});
it("create route rejects forged paths and assigned-scope misuse", async () => {
  const response = await POST(new Request("https://material.example/api/imports/", { method: "POST", headers: { Origin: "https://material.example", "Content-Type": "application/json" }, body: JSON.stringify({ unitId, objectPath: "unit/other/file.xlsx" }) }));
  expect(response.status).toBe(422); expect(mocks.admin).not.toHaveBeenCalled();
});
