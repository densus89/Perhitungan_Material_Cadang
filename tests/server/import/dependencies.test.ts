// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createImportDependencies } from "../../../src/server/import/dependencies";

vi.mock("server-only", () => ({}));

describe("import persistence adapter", () => {
  it("reads every PostgREST page in bounded parallel windows and preserves order", async () => {
    const source = Array.from({ length: 9001 }, (_, index) => ({ id: String(index).padStart(5, "0") }));
    const ranges: [number, number][] = [];
    let active = 0, peakActive = 0;
    const client = {
      from() {
        let exactCount = false;
        const chain = {
          select(_columns: string, options?: { count?: string }) { exactCount = options?.count === "exact"; return chain; },
          match() { return chain; },
          order() { return chain; },
          async range(start: number, end: number) {
            ranges.push([start, end]); active += 1; peakActive = Math.max(peakActive, active);
            await new Promise<void>((resolve) => setTimeout(resolve, 1));
            active -= 1;
            return { data: source.slice(start, end + 1), error: null, count: exactCount ? source.length : null };
          },
        };
        return chain;
      },
    };

    const rows = await createImportDependencies(client as never).list("unit_induk", {});
    expect(rows).toEqual(source);
    expect(ranges).toHaveLength(10);
    expect(peakActive).toBe(8);
  });
});
