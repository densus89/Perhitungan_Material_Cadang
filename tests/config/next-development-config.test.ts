import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js development origin configuration", () => {
  it("allows the loopback hostname used by Playwright so client components hydrate", () => {
    expect(nextConfig).toMatchObject({ allowedDevOrigins: ["127.0.0.1"] });
  });
});
