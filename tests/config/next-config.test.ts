import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js server runtime configuration", () => {
  it("allows server features by omitting static export output", () => {
    expect(nextConfig).not.toHaveProperty("output");
  });

  it("preserves trailing slash URLs", () => {
    expect(nextConfig.trailingSlash).toBe(true);
  });

  it("preserves unoptimized image handling", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
