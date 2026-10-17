// @vitest-environment node
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { hasTrustedMutationOrigin } from "../../../src/server/http/mutation-origin";
vi.mock("server-only", () => ({}));

const preview = "https://asset-preview-123-team.vercel.app";
const canonical = "https://material.example";
const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
beforeEach(() => {
  vi.unstubAllEnvs(); warning.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", canonical);
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_URL", "asset-preview-123-team.vercel.app");
});
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(() => { warning.mockRestore(); });
function request(origin: string | null = canonical, crossSite = false) {
  const headers = new Headers({ "Sec-Fetch-Site": crossSite ? "cross-site" : "same-origin", Authorization: "Bearer header-secret", Cookie: "session=cookie-secret", Host: "host-secret.example", "X-Forwarded-Host": "forward-secret.example" });
  if (origin !== null) headers.set("Origin", origin);
  return new Request("https://request-secret.example/private-workbook.xlsx?token=query-secret", { method: "POST", headers, body: "raw-workbook-secret" });
}
function diagnostic() {
  expect(warning).toHaveBeenCalledTimes(1);
  const args = warning.mock.calls[0]; expect(args).toHaveLength(1);
  const value = JSON.parse(args[0] as string);
  expect(Object.keys(value).sort()).toEqual(["event", "reason", "source", "environment", "vercelFlag", "canonicalConfigured", "canonicalValid", "previewConfigured", "previewHostMatchesPattern", "originPresent", "matchesCanonical", "matchesPreview", "crossSite"].sort());
  expect(JSON.stringify(value)).not.toMatch(/https?:|\.example|\.vercel\.app|secret|workbook|token|cookie|Bearer/i);
  return value;
}
it("logs only safe reason, runtime branch and match flags when preview denies canonical Origin", () => {
  expect(hasTrustedMutationOrigin(request())).toBe(false);
  expect(diagnostic()).toEqual({ event: "MUTATION_ORIGIN_DENIED", reason: "ORIGIN_MISMATCH", source: "VERCEL_PREVIEW", environment: "PREVIEW", vercelFlag: true, canonicalConfigured: true, canonicalValid: true, previewConfigured: true, previewHostMatchesPattern: true, originPresent: true, matchesCanonical: true, matchesPreview: false, crossSite: false });
});
it.each([
  { value: "production", environment: "PRODUCTION" }, { value: "development", environment: "DEVELOPMENT" },
  { value: undefined, environment: "MISSING" }, { value: "preview-env-secret", environment: "OTHER" },
])("classifies runtime environment without logging its raw value %#", ({ value, environment }) => {
  vi.stubEnv("VERCEL_ENV", value);
  expect(hasTrustedMutationOrigin(request(preview))).toBe(false);
  expect(diagnostic()).toMatchObject({ reason: "ORIGIN_MISMATCH", source: "CANONICAL", environment, matchesCanonical: false, matchesPreview: true });
});
it.each([
  { site: undefined, configured: false }, { site: "https://env-user:env-password@env-secret.example/private?token=env-secret", configured: true },
])("diagnoses canonical configuration without exposing its value %#", ({ site, configured }) => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);
  expect(hasTrustedMutationOrigin(request(preview))).toBe(false);
  expect(diagnostic()).toMatchObject({ reason: "CANONICAL_CONFIG_INVALID", canonicalConfigured: configured, canonicalValid: false });
});
it("distinguishes absent Vercel context from a valid preview hostname", () => {
  vi.stubEnv("VERCEL", undefined);
  expect(hasTrustedMutationOrigin(request(preview))).toBe(false);
  expect(diagnostic()).toMatchObject({ reason: "PREVIEW_CONTEXT_INVALID", vercelFlag: false, previewHostMatchesPattern: true, matchesPreview: true });
});
it.each([{ host: undefined, configured: false }, { host: "host-secret.example/path?token=env-secret", configured: true }])("diagnoses missing/malformed deployment hostname without its value %#", ({ host, configured }) => {
  vi.stubEnv("VERCEL_URL", host);
  expect(hasTrustedMutationOrigin(request(preview))).toBe(false);
  expect(diagnostic()).toMatchObject({ reason: "PREVIEW_HOST_INVALID", previewConfigured: configured, previewHostMatchesPattern: false, matchesPreview: false });
});
it("distinguishes missing Origin from mismatched Origin", () => {
  expect(hasTrustedMutationOrigin(request(null))).toBe(false);
  expect(diagnostic()).toMatchObject({ reason: "ORIGIN_MISSING", originPresent: false, matchesCanonical: false, matchesPreview: false });
});
it("identifies cross-site rejection even when deployment Origin matches", () => {
  expect(hasTrustedMutationOrigin(request(preview, true))).toBe(false);
  expect(diagnostic()).toMatchObject({ reason: "CROSS_SITE", crossSite: true, matchesPreview: true });
});
it("logs no event for allowed preview or canonical requests", () => {
  expect(hasTrustedMutationOrigin(request(preview))).toBe(true);
  vi.stubEnv("VERCEL_ENV", "production"); expect(hasTrustedMutationOrigin(request())).toBe(true);
  expect(warning).not.toHaveBeenCalled();
});
it("keeps a denied request denied even if the log sink fails", () => {
  warning.mockImplementationOnce(() => { throw new Error("log-sink-secret"); });
  let allowed: boolean | undefined;
  expect(() => { allowed = hasTrustedMutationOrigin(request()); }).not.toThrow();
  expect(allowed).toBe(false);
  expect(warning).toHaveBeenCalledTimes(1);
});
