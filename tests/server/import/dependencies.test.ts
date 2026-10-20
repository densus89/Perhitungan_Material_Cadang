// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ASSET_ROW_BATCH_COLUMNS, ASSET_VALUATION_BATCH_COLUMNS, createImportDependencies, packedRecords } from "../../../src/server/import/dependencies";

vi.mock("server-only", () => ({}));

const complete = (columns: readonly string[], values: Record<string, unknown>) => Object.fromEntries(columns.map((column) => [column, values[column] ?? null]));
const runId = "30000000-0000-4000-8000-000000000001";
const leaseToken = "40000000-0000-4000-8000-000000000001";
const importId = "50000000-0000-4000-8000-000000000001";
const revision = "60000000-0000-4000-8000-000000000001";
const runEvidence = { id: runId, expected_row_count: 2, expected_valuation_count: 2, source_hash: "a".repeat(64), mapping_hash: "b".repeat(64), rule_version: "rules-v1", expected_rows_hash: "c".repeat(64), expected_valuations_hash: "d".repeat(64) };

describe("import persistence adapter", () => {
  it("encodes records as compact row arrays in an explicit column order", () => {
    expect(packedRecords([{ id: "a", value: 1 }, { id: "b", value: null }], ["id", "value"])).toEqual([["a", 1], ["b", null]]);
    expect(() => packedRecords([{ id: "a" }], ["id", "value"])).toThrow("Inconsistent packed batch");
    expect(() => packedRecords([{ id: "a", value: 1, extra: true }], ["id", "value"])).toThrow("Inconsistent packed batch");
  });
  it("sends paired packed rows through one actor-checked RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const deps = createImportDependencies({ rpc } as never);
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
  it("claims a resumable run without exposing its lease inside the public run object", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      ...runEvidence,
      import_session_id: importId,
      unit_induk_id: "10000000-0000-4000-8000-000000000001",
      dataset_version_id: "70000000-0000-4000-8000-000000000001",
      mapping_revision: revision,
      status: "PROCESSING",
      processing_protocol_version: "resumable-v1",
      processing_lease_token: leaseToken,
      processing_lease_expires_at: "2026-10-20T00:04:00.000Z",
      processing_attempts: 1,
      last_progress_at: "2026-10-20T00:00:00.000Z",
      completed_chunks: [{ chunk_index: 0, row_count: 2 }],
    }, error: null });
    const deps = createImportDependencies({ rpc } as never);
    const claim = await deps.claimProcessing("actor", { importId, expectedRevision: revision, run: runEvidence });
    expect(rpc).toHaveBeenCalledWith("claim_asset_import_processing", { p_actor_id: "actor", p_import_id: importId, p_expected_revision: revision, p_run: runEvidence, p_lease_token: null });
    expect(claim.leaseToken).toBe(leaseToken);
    expect(claim.completedChunks).toEqual([{ chunkIndex: 0, rowCount: 2 }]);
    expect(claim.run).not.toHaveProperty("processing_lease_token");
  });
  it("commits exact packed chunks, validates replay counts, and sanitizes failures", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce({ data: null, error: { code: "XX001", message: "secret lease payload" } });
    const deps = createImportDependencies({ rpc } as never);
    const rows = ["r1", "r2"].map((id) => complete(ASSET_ROW_BATCH_COLUMNS, { id, import_run_id: runId })) as never;
    const valuations = ["r1", "r2"].map((id) => complete(ASSET_VALUATION_BATCH_COLUMNS, { asset_row_id: id, import_run_id: runId })) as never;
    const chunk = { chunkIndex: 0, startOrdinal: 0, rowCount: 2, rows, valuations, rowsHash: "e".repeat(64), valuationsHash: "f".repeat(64) };
    await deps.commitChunk("actor", runId, leaseToken, chunk);
    expect(rpc).toHaveBeenCalledWith("commit_asset_import_chunk", {
      p_actor_id: "actor", p_run_id: runId, p_lease_token: leaseToken, p_chunk_index: 0, p_start_ordinal: 0,
      p_rows: expect.any(Array), p_valuations: expect.any(Array), p_rows_hash: "e".repeat(64), p_valuations_hash: "f".repeat(64),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(deps.commitChunk("actor", runId, leaseToken, chunk)).rejects.toThrow("Import persistence unavailable");
    expect(warn.mock.calls.flat().join(" ")).toContain("commitChunk");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("secret lease payload");
    warn.mockRestore();
    rpc.mockResolvedValueOnce({ data: 1, error: null });
    await expect(deps.commitChunk("actor", runId, leaseToken, chunk)).rejects.toThrow("Incomplete asset import chunk");
  });
  it("reads completed manifest entries in chunk order", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ chunk_index: 0, row_count: 2 }, { chunk_index: 1, row_count: 1 }], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const deps = createImportDependencies({ from: vi.fn(() => ({ select })) } as never);
    await expect(deps.completedChunks(runId)).resolves.toEqual([{ chunkIndex: 0, rowCount: 2 }, { chunkIndex: 1, rowCount: 1 }]);
    expect(order).toHaveBeenCalledWith("chunk_index", { ascending: true });
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
