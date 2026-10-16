// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { workbookBytes, headers, assetRow } from "../../fixtures/asset-workbooks";
import type { AssetImportWorkerRequest, AssetImportWorkerResult } from "../../../src/features/import/asset-import.worker";
it("returns serializable hashes, candidate totals and only the first 100 preview rows", async () => {
  const postMessage = vi.fn(); const scope = { postMessage, onmessage: null as null | ((event: { data: AssetImportWorkerRequest }) => Promise<void>) };
  vi.stubGlobal("self", scope); await import("../../../src/features/import/asset-import.worker");
  const bytes = await workbookBytes([{ name: "DATA", rows: [headers, ...Array.from({ length: 125 }, () => assetRow)] }]);
  await scope.onmessage!({ data: { file: new File([bytes], "synthetic.xlsx"), ruleVersion: "synthetic-v1" } });
  const result = postMessage.mock.calls.at(-1)![0] as Extract<AssetImportWorkerResult, { type: "result" }>;
  expect(result.type).toBe("result"); expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(result.summary.candidateRows).toBe(125); expect(result.preview).toHaveLength(100); expect(result).not.toHaveProperty("rows");
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});
it("recovers alternate duplicate-header proposals, preserves ambiguity and accepts indexed edits and switching back", async () => {
  vi.resetModules();
  const postMessage = vi.fn(); const scope = { postMessage, onmessage: null as null | ((event: { data: AssetImportWorkerRequest }) => Promise<void>) };
  vi.stubGlobal("self", scope); await import("../../../src/features/import/asset-import.worker");
  const bytes = await workbookBytes([{ name: "PRIMARY", rows: [headers, assetRow] }, { name: "ALTERNATE", rows: [[...headers, "UPT"], [...assetRow, "UPT ALTERNATE"]] }]);
  const file = new File([bytes], "two-sheets.xlsx");
  async function read(mapping?: AssetImportWorkerRequest["mapping"]) {
    await scope.onmessage!({ data: { file, ruleVersion: "synthetic-v1", mapping } });
    const result = postMessage.mock.calls.at(-1)![0] as AssetImportWorkerResult;
    expect(result.type).toBe("result");
    if (result.type !== "result") throw new Error("Expected recoverable preview");
    return result;
  }
  const initial = await read();
  const alternate = initial.layout.candidates.find(candidate => candidate.sheetName === "ALTERNATE")!;
  expect(alternate.ambiguousFields).toContain("upt");
  const selected = await read(alternate);
  expect(selected.layout.selected!.ambiguousFields).toContain("upt");
  expect(selected.layout.requiresConfirmation).toBe(true);
  expect(selected.layout.selected!.columns.filter(column => column.field === "upt")).toHaveLength(1);
  expect(selected.layout.selected!.columns.at(-1)).toMatchObject({ columnIndex: 14, columnLetter: "N", header: "UPT", field: null });
  const edited = { ...selected.layout.selected!, ambiguousFields: [], columns: selected.layout.selected!.columns.map(column => ({ ...column, field: column.columnIndex === 14 ? "upt" as const : column.field === "upt" ? null : column.field })) };
  const corrected = await read(edited);
  expect(corrected.preview[0].asset.upt).toBe("UPT ALTERNATE");
  await scope.onmessage!({ data: { file, ruleVersion: "synthetic-v1", mapping: { ...edited, headerRow: 999 } } });
  expect(postMessage.mock.calls.at(-1)![0].type).toBe("error");
  const restored = await read(initial.layout.candidates.find(candidate => candidate.sheetName === "PRIMARY")!);
  expect(restored.layout.selected!.sheetName).toBe("PRIMARY");
  expect(restored.preview[0].asset.upt).toBe("UPT DEMO");
});
