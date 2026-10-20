// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  ASSET_CHUNK_SIZE,
  REQUEST_CHUNK_LIMIT,
  assetChunkHash,
  deterministicAssetRowId,
  importProgress,
  planMissingChunks,
} from "../../../src/server/import/resumable";

vi.mock("server-only", () => ({}));

const runId = "30000000-0000-4000-8000-000000000001";
const sheetId = "40000000-0000-4000-8000-000000000001";

function records(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `row-${index + 1}`,
    import_sheet_id: sheetId,
    source_row_number: index + 2,
    created_at: "2026-10-20T00:00:00.000Z",
  }));
  const valuations = rows.map((row, index) => ({
    asset_row_id: row.id,
    nilai_abc: index + 1,
    approved_by: null,
    approved_at: null,
    approval_notes: null,
    created_at: "2026-10-20T00:00:00.000Z",
  }));
  return { rows, valuations };
}

describe("deterministicAssetRowId", () => {
  it("creates a stable RFC-4122 v5 UUID from run, sheet, and source row", () => {
    const first = deterministicAssetRowId(runId, sheetId, 2);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deterministicAssetRowId(runId, sheetId, 2)).toBe(first);
    expect(deterministicAssetRowId(runId, sheetId, 3)).not.toBe(first);
    expect(deterministicAssetRowId(runId, "40000000-0000-4000-8000-000000000002", 2)).not.toBe(first);
    expect(deterministicAssetRowId("30000000-0000-4000-8000-000000000002", sheetId, 2)).not.toBe(first);
  });

  it("rejects invalid namespaces and source row numbers", () => {
    expect(() => deterministicAssetRowId("not-a-uuid", sheetId, 2)).toThrow("Invalid UUID");
    expect(() => deterministicAssetRowId(runId, "not-a-uuid", 2)).toThrow("Invalid UUID");
    expect(() => deterministicAssetRowId(runId, sheetId, 0)).toThrow("Invalid source row");
    expect(() => deterministicAssetRowId(runId, sheetId, 1.5)).toThrow("Invalid source row");
  });
});

describe("assetChunkHash", () => {
  it("is stable across object key order and excluded audit fields", () => {
    const first = assetChunkHash([{ b: 2, nested: { y: 2, x: 1 }, a: 1, created_at: "one" }], ["created_at"]);
    const replay = assetChunkHash([{ created_at: "two", a: 1, nested: { x: 1, y: 2 }, b: 2 }], ["created_at"]);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(replay).toBe(first);
    expect(assetChunkHash([{ a: 2, b: 2, nested: { x: 1, y: 2 } }], ["created_at"])).not.toBe(first);
  });
});

describe("planMissingChunks", () => {
  it("uses fixed 2,000-row chunks and preserves a final short chunk", () => {
    const { rows, valuations } = records(ASSET_CHUNK_SIZE * 2 + 1);
    const chunks = planMissingChunks(rows, valuations, []);
    expect(ASSET_CHUNK_SIZE).toBe(2_000);
    expect(chunks.map(({ chunkIndex, startOrdinal, rowCount }) => ({ chunkIndex, startOrdinal, rowCount }))).toEqual([
      { chunkIndex: 0, startOrdinal: 0, rowCount: 2_000 },
      { chunkIndex: 1, startOrdinal: 2_000, rowCount: 2_000 },
      { chunkIndex: 2, startOrdinal: 4_000, rowCount: 1 },
    ]);
    expect(chunks.every((chunk) => chunk.rowsHash.length === 64 && chunk.valuationsHash.length === 64)).toBe(true);
  });

  it("selects manifest holes in index order and returns at most twelve chunks", () => {
    const { rows, valuations } = records(ASSET_CHUNK_SIZE * 13 + 1);
    const chunks = planMissingChunks(rows, valuations, [0, 2]);
    expect(REQUEST_CHUNK_LIMIT).toBe(12);
    expect(chunks).toHaveLength(12);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("pins replay hashes while ignoring only the approved audit fields", () => {
    const { rows, valuations } = records(1);
    const [first] = planMissingChunks(rows, valuations, []);
    const [replay] = planMissingChunks(
      [{ ...rows[0], created_at: "later" }],
      [{ ...valuations[0], created_at: "later", approved_by: "reviewer", approved_at: "later", approval_notes: "approved" }],
      [],
    );
    expect(replay.rowsHash).toBe(first.rowsHash);
    expect(replay.valuationsHash).toBe(first.valuationsHash);
    expect(planMissingChunks(rows, [{ ...valuations[0], nilai_abc: 99 }], [])[0].valuationsHash).not.toBe(first.valuationsHash);
  });

  it("rejects unpaired records and invalid completed indexes", () => {
    const { rows, valuations } = records(2);
    expect(() => planMissingChunks(rows, valuations.slice(1), [])).toThrow("Mismatched asset import records");
    expect(() => planMissingChunks(rows, [{ ...valuations[0], asset_row_id: "other" }, valuations[1]], [])).toThrow("Mismatched asset import records");
    expect(() => planMissingChunks(rows, valuations, [-1])).toThrow("Invalid completed chunk");
    expect(() => planMissingChunks(rows, valuations, [1])).toThrow("Invalid completed chunk");
    expect(() => planMissingChunks(rows, valuations, [0, 0])).toThrow("Invalid completed chunk");
  });
});

describe("importProgress", () => {
  it("derives zero, partial, and complete progress from manifest counts", () => {
    expect(importProgress(4_001, [])).toEqual({ completedRows: 0, expectedRows: 4_001, completedChunks: 0, expectedChunks: 3, percent: 0 });
    expect(importProgress(4_001, [{ chunkIndex: 0, rowCount: 2_000 }, { chunkIndex: 2, rowCount: 1 }])).toEqual({ completedRows: 2_001, expectedRows: 4_001, completedChunks: 2, expectedChunks: 3, percent: 50 });
    expect(importProgress(4_001, [{ chunkIndex: 0, rowCount: 2_000 }, { chunkIndex: 1, rowCount: 2_000 }, { chunkIndex: 2, rowCount: 1 }])).toEqual({ completedRows: 4_001, expectedRows: 4_001, completedChunks: 3, expectedChunks: 3, percent: 100 });
    expect(importProgress(4_001, [{ chunkIndex: 0, rowCount: 2_000 }, { chunkIndex: 1, rowCount: 2_000 }]).percent).toBe(99);
    expect(importProgress(0, [])).toEqual({ completedRows: 0, expectedRows: 0, completedChunks: 0, expectedChunks: 0, percent: 100 });
  });

  it("clamps displayed rows and percent without trusting invalid indexes", () => {
    expect(importProgress(1_000, [{ chunkIndex: 0, rowCount: 1_500 }])).toEqual({ completedRows: 1_000, expectedRows: 1_000, completedChunks: 1, expectedChunks: 1, percent: 100 });
    expect(() => importProgress(1_000, [{ chunkIndex: 1, rowCount: 1 }])).toThrow("Invalid completed chunk");
    expect(() => importProgress(-1, [])).toThrow("Invalid expected rows");
  });
});
