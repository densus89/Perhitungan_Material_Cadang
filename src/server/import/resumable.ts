import "server-only";
import { createHash } from "node:crypto";

export const ASSET_CHUNK_SIZE = 2_000;
export const REQUEST_CHUNK_LIMIT = 12;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rowHashExcluded = ["created_at"] as const;
const valuationHashExcluded = ["created_at", "approved_by", "approved_at", "approval_notes"] as const;

export interface AssetChunk<Row extends Record<string, unknown> = Record<string, unknown>, Valuation extends Record<string, unknown> = Record<string, unknown>> {
  chunkIndex: number;
  startOrdinal: number;
  rowCount: number;
  rows: Row[];
  valuations: Valuation[];
  rowsHash: string;
  valuationsHash: string;
}

export interface CompletedAssetChunk {
  chunkIndex: number;
  rowCount: number;
}

export interface ImportProgress {
  completedRows: number;
  expectedRows: number;
  completedChunks: number;
  expectedChunks: number;
  percent: number;
}

function uuidBytes(value: string) {
  if (!uuidPattern.test(value)) throw new Error("Invalid UUID");
  return Buffer.from(value.replaceAll("-", "").toLowerCase(), "hex");
}

function formattedUuid(bytes: Uint8Array) {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** RFC-4122 UUID v5 using the run UUID as namespace and sheet/row as name. */
export function deterministicAssetRowId(runId: string, sheetId: string, sourceRowNumber: number) {
  const namespace = uuidBytes(runId);
  const normalizedSheet = formattedUuid(uuidBytes(sheetId));
  if (!Number.isSafeInteger(sourceRowNumber) || sourceRowNumber < 1) throw new Error("Invalid source row");
  const digest = createHash("sha1").update(namespace).update(`${normalizedSheet}:${sourceRowNumber}`, "utf8").digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formattedUuid(bytes);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid hash value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("Invalid hash value");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function assetChunkHash(records: readonly Record<string, unknown>[], excluded: readonly string[]) {
  const omitted = new Set(excluded);
  const recordHashes = records.map((record) => {
    const stable = Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
    return createHash("sha256").update(canonicalJson(stable)).digest("hex");
  });
  return createHash("sha256").update(recordHashes.join("")).digest("hex");
}

function completedIndexSet(indexes: readonly number[], expectedChunks: number) {
  const completed = new Set<number>();
  for (const index of indexes) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= expectedChunks || completed.has(index)) throw new Error("Invalid completed chunk");
    completed.add(index);
  }
  return completed;
}

export function planMissingChunks<
  Row extends Record<string, unknown> & { id: string },
  Valuation extends Record<string, unknown> & { asset_row_id: string },
>(rows: readonly Row[], valuations: readonly Valuation[], completedIndexes: readonly number[]): AssetChunk<Row, Valuation>[] {
  if (rows.length !== valuations.length || rows.some((row, index) => row.id !== valuations[index]?.asset_row_id)) throw new Error("Mismatched asset import records");
  const expectedChunks = Math.ceil(rows.length / ASSET_CHUNK_SIZE);
  const completed = completedIndexSet(completedIndexes, expectedChunks);
  const chunks: AssetChunk<Row, Valuation>[] = [];
  for (let chunkIndex = 0; chunkIndex < expectedChunks && chunks.length < REQUEST_CHUNK_LIMIT; chunkIndex++) {
    if (completed.has(chunkIndex)) continue;
    const startOrdinal = chunkIndex * ASSET_CHUNK_SIZE;
    const chunkRows = rows.slice(startOrdinal, startOrdinal + ASSET_CHUNK_SIZE);
    const chunkValuations = valuations.slice(startOrdinal, startOrdinal + ASSET_CHUNK_SIZE);
    chunks.push({
      chunkIndex,
      startOrdinal,
      rowCount: chunkRows.length,
      rows: chunkRows,
      valuations: chunkValuations,
      rowsHash: assetChunkHash(chunkRows, rowHashExcluded),
      valuationsHash: assetChunkHash(chunkValuations, valuationHashExcluded),
    });
  }
  return chunks;
}

export function importProgress(expectedRows: number, completedChunks: readonly CompletedAssetChunk[]): ImportProgress {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0) throw new Error("Invalid expected rows");
  const expectedChunks = Math.ceil(expectedRows / ASSET_CHUNK_SIZE);
  completedIndexSet(completedChunks.map((chunk) => chunk.chunkIndex), expectedChunks);
  if (completedChunks.some((chunk) => !Number.isSafeInteger(chunk.rowCount) || chunk.rowCount < 1 || chunk.rowCount > ASSET_CHUNK_SIZE)) throw new Error("Invalid completed chunk");
  const completedRows = Math.min(expectedRows, completedChunks.reduce((total, chunk) => total + chunk.rowCount, 0));
  return {
    completedRows,
    expectedRows,
    completedChunks: completedChunks.length,
    expectedChunks,
    percent: expectedRows === 0 || completedRows === expectedRows ? 100 : Math.min(99, Math.floor((completedRows / expectedRows) * 100)),
  };
}
