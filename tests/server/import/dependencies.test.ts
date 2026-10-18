// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { columnarRecords, createImportDependencies } from "../../../src/server/import/dependencies";

vi.mock("server-only", () => ({}));

describe("import persistence adapter", () => {
  it("encodes repeated records as aligned column arrays", () => {
    expect(columnarRecords([{ id: "a", value: 1 }, { id: "b", value: null }])).toEqual({ id: ["a", "b"], value: [1, null] });
    expect(() => columnarRecords([{ id: "a" }, { value: 1 }])).toThrow("Inconsistent columnar batch");
    expect(() => columnarRecords([{ id: "a" }, { id: "b", extra: true }])).toThrow("Inconsistent columnar batch");
  });
  it("sends paired snapshot and valuation columns through one actor-checked RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const deps = createImportDependencies({ rpc } as never);
    const rows = [{ id: "r1", import_run_id: "run" }, { id: "r2", import_run_id: "run" }] as never;
    const valuations = [{ asset_row_id: "r1", import_run_id: "run" }, { asset_row_id: "r2", import_run_id: "run" }] as never;
    await deps.insertAssetBatch("actor", "run", rows, valuations);
    expect(rpc).toHaveBeenCalledWith("insert_asset_import_batch", { p_actor_id: "actor", p_run_id: "run", p_rows: { id: ["r1", "r2"], import_run_id: ["run", "run"] }, p_valuations: { asset_row_id: ["r1", "r2"], import_run_id: ["run", "run"] } });
  });
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
