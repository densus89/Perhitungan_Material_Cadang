import { vi } from "vitest";
import { CANONICAL_ASSET_FIELDS } from "../../src/domain/asset-import/fields";

export const units = [{ id: "10000000-0000-4000-8000-000000000001", name: "UIT Jawa Barat" }];
export const id = "20000000-0000-4000-8000-000000000001";
export const base = { importId: id, datasetId: id, versionId: id };
export const mapping = { sheetName: "DATA", headerRow: 1, confidence: 1, score: 100, missingRequiredFields: [], ambiguousFields: [], columns: CANONICAL_ASSET_FIELDS.map((f, i) => ({ columnIndex: i + 1, columnLetter: String.fromCharCode(65 + i), header: f.header, normalizedHeader: f.header, field: f.key, confidence: 1 })) };
export const preview = { type: "result", sha256: "a".repeat(64), ruleVersion: "PERDIR_0299_2016", layout: { selected: mapping, candidates: [mapping], requiresConfirmation: false }, layoutHash: "b".repeat(64), canonicalHash: "c".repeat(64), preview: [], summary: { candidateRows: 120, rejectedRows: 2, errorRows: 0, rejectionReasons: { BLANK: 2 } } };
export class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(() => { queueMicrotask(() => this.onmessage?.({ data: preview })); });
  constructor() { FakeWorker.instances.push(this); }
}
