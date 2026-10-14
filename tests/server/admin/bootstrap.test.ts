// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bootstrapAdmin, parseBootstrapConfig } from "../../../scripts/bootstrap-admin.mjs";
const env = { BOOTSTRAP_ADMIN_EMAIL: " Admin@PLN.CO.ID ", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture", SUPABASE_SECRET_KEY: "secret-fixture", NEXT_PUBLIC_SITE_URL: "https://material.example" };
describe("local bootstrap guards", () => {
  it("requires explicit confirmation, exact email, and every required key without leaking values", () => {
    expect(() => parseBootstrapConfig(env, [])).toThrow(/confirm/);
    expect(() => parseBootstrapConfig({ ...env, BOOTSTRAP_ADMIN_EMAIL: "x@pln.co.id.evil" }, ["--confirm"])).toThrow();
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "BOOTSTRAP_ADMIN_EMAIL"]) expect(() => parseBootstrapConfig({ ...env, [key]: "" }, ["--confirm"])).toThrow();
    expect(parseBootstrapConfig(env, ["--confirm"]).email).toBe("admin@pln.co.id");
  });
  it("allows only the explicitly approved Gmail guest for bootstrap", () => {
    expect(parseBootstrapConfig({ ...env, BOOTSTRAP_ADMIN_EMAIL: " Sitompul89@GMAIL.COM " }, ["--confirm"]).email).toBe("sitompul89@gmail.com");
    expect(() => parseBootstrapConfig({ ...env, BOOTSTRAP_ADMIN_EMAIL: "other@gmail.com" }, ["--confirm"])).toThrow(/email/i);
  });
  it("refuses a second active admin unless explicitly allowed", async () => {
    const calls: string[] = [];
    const gateway = { hasActiveAdmin: async () => true, findProfile: async () => null, invite: async () => { calls.push("invite"); return "new-user"; }, stage: async () => { calls.push("stage"); }, restore: async () => { calls.push("restore"); }, assign: async () => { calls.push("assign"); }, remove: async () => { calls.push("remove"); }, audit: async () => { calls.push("audit"); } };
    await expect(bootstrapAdmin(parseBootstrapConfig(env, ["--confirm"]), gateway)).rejects.toThrow(/active/i); expect(calls).toEqual([]);
    await bootstrapAdmin(parseBootstrapConfig(env, ["--confirm", "--allow-existing"]), gateway); expect(calls).toEqual(["invite", "stage", "assign", "audit", "restore"]);
  });
  it("compensates a failed new-user assignment", async () => {
    const removed: string[] = [];
    await expect(bootstrapAdmin(parseBootstrapConfig(env, ["--confirm"]), { hasActiveAdmin: async () => false, findProfile: async () => null, invite: async () => "new-user", stage: async () => {}, restore: async () => {}, assign: async () => { throw new Error("secret-fixture"); }, remove: async (id: string) => { removed.push(id); }, audit: async () => {} })).rejects.toThrow("Bootstrap persistence failed");
    expect(removed).toEqual(["new-user"]);
  });
  it("uses the fixed default-email invite landing without a next parameter", async () => {
    let redirect: string | undefined;
    await bootstrapAdmin(parseBootstrapConfig({ ...env, NEXT_PUBLIC_SITE_URL: "https://material.example/" }, ["--confirm"]), { hasActiveAdmin: async () => false, findProfile: async () => null, invite: async (_email: string, target: string) => { redirect = target; return "new-user"; }, stage: async () => {}, restore: async () => {}, assign: async () => {}, audit: async () => {}, remove: async () => {} });
    expect(redirect).toBe("https://material.example/auth/invite");
  });
});
