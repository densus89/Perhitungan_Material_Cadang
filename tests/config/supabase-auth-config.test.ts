import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

function section(name: string): string {
  const marker = `[${name}]`;
  const start = config.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const rest = config.slice(start + marker.length);
  const next = rest.search(/^\[/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("Supabase Auth configuration", () => {
  it("keeps public signup disabled while enabling invited email/password sign-in", () => {
    expect(section("auth")).toMatch(/^enable_signup\s*=\s*false\s*$/m);
    expect(section("auth.email")).toMatch(/^enable_signup\s*=\s*true\s*$/m);
  });
});
