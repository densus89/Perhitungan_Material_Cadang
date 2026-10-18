// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ASSET_ROW_BATCH_COLUMNS, ASSET_VALUATION_BATCH_COLUMNS, createImportDependencies, packedRecords } from "../../../src/server/import/dependencies";

vi.mock("server-only", () => ({}));

describe("import persistence adapter", () => {
  it("encodes records as compact row arrays in an explicit column order", () => {
    expect(packedRecords([{ id: "a", value: 1 }, { id: "b", value: null }], ["id", "value"])).toEqual([["a", 1], ["b", null]]);
    expect(() => packedRecords([{ id: "a" }], ["id", "value"])).toThrow("Inconsistent packed batch");
    expect(() => packedRecords([{ id: "a", value: 1, extra: true }], ["id", "value"])).toThrow("Inconsistent packed batch");
  });
  it("sends paired packed rows through one actor-checked RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const deps = createImportDependencies({ rpc } as never);
    const complete = (columns: readonly string[], values: Record<string, unknown>) => Object.fromEntries(columns.map((column) => [column, values[column] ?? null]));
    const rows = ["r1", "r2"].map((id) => complete(ASSET_ROW_BATCH_COLUMNS, { id, import_run_id: "run" })) as never;
    const valuations = ["r1", "r2"].map((id) => complete(ASSET_VALUATION_BATCH_COLUMNS, { asset_row_id: id, import_run_id: "run" })) as never;
    await deps.insertAssetBatch("actor", "run", rows, valuations);
    const call = rpc.mock.calls[0][1];
    expect(call.p_rows).toHaveLength(2); expect(call.p_valuations).toHaveLength(2);
    expect(call.p_rows[0][ASSET_ROW_BATCH_COLUMNS.indexOf("id")]).toBe("r1");
    expect(call.p_rows[1][ASSET_ROW_BATCH_COLUMNS.indexOf("import_run_id")]).toBe("run");
    expect(call.p_valuations[1][ASSET_VALUATION_BATCH_COLUMNS.indexOf("asset_row_id")]).toBe("r2");
    await expect(deps.insertAssetBatch("actor", "run", Array.from({ length: 2001 }, () => rows[0]), Array.from({ length: 2001 }, () => valuations[0]))).rejects.toThrow("Invalid asset import batch");
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
