// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ASSET_ROW_BATCH_COLUMNS, ASSET_VALUATION_BATCH_COLUMNS, type Insert } from "../../../src/server/import/dependencies";
import type { AssetChunk } from "../../../src/server/import/resumable";
import { actor, unitId } from "./fakes";
import { resumableFixture } from "./lifecycle-fixture";

vi.mock("server-only", () => ({}));

const complete = (columns: readonly string[], values: Record<string, unknown>) => Object.fromEntries(columns.map((column) => [column, values[column] ?? null]));

function chunk(runId: string, index = 0, count = 2): AssetChunk<Insert<"asset_snapshot_rows">, Insert<"asset_valuations">> {
  const startOrdinal = index * 2_000;
  const rows = Array.from({ length: count }, (_, offset) => {
    const suffix = String(startOrdinal + offset + 1).padStart(12, "0");
    return complete(ASSET_ROW_BATCH_COLUMNS, { id: `90000000-0000-4000-8000-${suffix}`, import_run_id: runId, unit_induk_id: unitId, source_row_number: startOrdinal + offset + 1, error_codes: [], warning_codes: [] });
  });
  const valuations = rows.map((row) => complete(ASSET_VALUATION_BATCH_COLUMNS, { asset_row_id: row.id, import_run_id: runId, unit_induk_id: unitId, value_source: "SAP_BOOK_VALUE", warning_codes: [], selected_donor_ids: [] }));
  return { chunkIndex: index, startOrdinal, rowCount: count, rows, valuations, rowsHash: "e".repeat(64), valuationsHash: "f".repeat(64) } as unknown as AssetChunk<Insert<"asset_snapshot_rows">, Insert<"asset_valuations">>;
}

describe("resumable import fake lifecycle", () => {
  it("models lease conflict, expiry, reclaim, release, and keeps tokens private", async () => {
    const f = await resumableFixture(2);
    const first = await f.deps.claimProcessing(actor.userId, f.claimInput);
    expect(first.run).not.toHaveProperty("processing_lease_token");
    await expect(f.deps.claimProcessing(actor.userId, f.claimInput)).rejects.toThrow("Processing lease conflict");
    f.advance(241_000);
    const reclaimed = await f.deps.claimProcessing(actor.userId, f.claimInput);
    expect(reclaimed.leaseToken).not.toBe(first.leaseToken);
    await expect(f.deps.releaseProcessing(actor.userId, first.run.id, first.leaseToken)).rejects.toThrow("Invalid processing lease");
    await f.deps.releaseProcessing(actor.userId, reclaimed.run.id, reclaimed.leaseToken);
    expect(f.tables.asset_import_runs[0].processing_lease_token).toBeNull();
  });

  it("commits paired data and its marker atomically and replays matching chunks", async () => {
    const f = await resumableFixture(2);
    const claim = await f.deps.claimProcessing(actor.userId, f.claimInput);
    const firstChunk = chunk(claim.run.id);
    await expect(f.deps.commitChunk(actor.userId, claim.run.id, claim.leaseToken, firstChunk)).resolves.toBeUndefined();
    await expect(f.deps.commitChunk(actor.userId, claim.run.id, claim.leaseToken, firstChunk)).resolves.toBeUndefined();
    expect(f.tables.asset_snapshot_rows).toHaveLength(2);
    expect(f.tables.asset_valuations).toHaveLength(2);
    expect(f.tables.asset_import_chunks).toHaveLength(1);
    await expect(f.deps.commitChunk(actor.userId, claim.run.id, claim.leaseToken, { ...firstChunk, rowsHash: "0".repeat(64) })).rejects.toThrow("Chunk replay mismatch");
  });

  it("does not leave rows or a marker when an atomic chunk write fails", async () => {
    const f = await resumableFixture(2);
    const claim = await f.deps.claimProcessing(actor.userId, f.claimInput);
    f.fail("asset_valuations");
    await expect(f.deps.commitChunk(actor.userId, claim.run.id, claim.leaseToken, chunk(claim.run.id))).rejects.toThrow("private service failure");
    expect(f.tables.asset_snapshot_rows ?? []).toHaveLength(0);
    expect(f.tables.asset_valuations ?? []).toHaveLength(0);
    expect(f.tables.asset_import_chunks ?? []).toHaveLength(0);
  });

  it("rejects manifest holes and only finalizes a complete leased run", async () => {
    const hole = await resumableFixture(4_001);
    const holeClaim = await hole.deps.claimProcessing(actor.userId, hole.claimInput);
    hole.tables.asset_import_chunks = [
      { import_run_id: holeClaim.run.id, unit_induk_id: unitId, chunk_index: 0, start_ordinal: 0, row_count: 2_000, rows_hash: "a".repeat(64), valuations_hash: "b".repeat(64) },
      { import_run_id: holeClaim.run.id, unit_induk_id: unitId, chunk_index: 2, start_ordinal: 4_000, row_count: 1, rows_hash: "c".repeat(64), valuations_hash: "d".repeat(64) },
    ];
    await expect(hole.deps.finalize(actor.userId, holeClaim.run.id, holeClaim.leaseToken)).rejects.toThrow("Incomplete chunk manifest");

    const complete = await resumableFixture(2);
    const completeClaim = await complete.deps.claimProcessing(actor.userId, complete.claimInput);
    await complete.deps.commitChunk(actor.userId, completeClaim.run.id, completeClaim.leaseToken, chunk(completeClaim.run.id));
    await expect(complete.deps.finalize(actor.userId, completeClaim.run.id, completeClaim.leaseToken)).rejects.toThrow("Prepared finalization evidence required");
    for (const part of ["ROWS_HASH", "VALUATIONS_HASH", "SUMMARY"] as const) {
      await complete.deps.prepareFinalization(actor.userId, completeClaim.run.id, completeClaim.leaseToken, part);
    }
    await complete.deps.finalize(actor.userId, completeClaim.run.id, completeClaim.leaseToken);
    expect(complete.tables.asset_import_runs[0].status).toBe("COMPLETE");
  });
});
