// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
import { assetRow, gridFixture, headers, workbookBytes } from "../../fixtures/asset-workbooks";

describe("shared asset workbook reader", () => {
  it("scans all sheets, excludes examples, spacers, totals and helper columns", async () => {
    const rows = [[...headers, "NILAI_ABC_FINAL"], ["CONTOH", ...assetRow.slice(1), 999], [], [...assetRow, 999], ["SUBTOTAL", ...assetRow.slice(1)], [...assetRow, 999]];
    const source = gridFixture("3400", 50);
    source.sheets[0].rows = [...source.sheets[0].rows.slice(0, 49), ...rows];
    const bytes = await workbookBytes([{ name: "HELPER", rows: [["MARA"], [123]] }, ...source.sheets]);
    const parsed = await readAssetWorkbook(bytes, { ruleVersion: "rule-1", previewLimit: 1, collectRows: true });
    expect(parsed.layout.selected).toMatchObject({ sheetName: "3400", headerRow: 50 });
    expect(parsed.summary).toMatchObject({ candidateRows: 2, rejectedRows: 3, rejectionReasons: { EXAMPLE: 1, BLANK: 1, SUBTOTAL: 1 } });
    expect(parsed.preview).toHaveLength(1);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows?.[0].asset).not.toHaveProperty("nilaiAbcFinal");
    expect(parsed.rows?.[0].provenance.rowNumber).toBe(53);
  });
  it("hashes deterministically and includes rule version in canonical evidence", async () => {
    const bytes = await workbookBytes(gridFixture().sheets);
    const a = await readAssetWorkbook(bytes, { ruleVersion: "v1", collectRows: false });
    const b = await readAssetWorkbook(bytes, { ruleVersion: "v1", collectRows: false });
    const c = await readAssetWorkbook(bytes, { ruleVersion: "v2", collectRows: false });
    expect(a.layoutHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.canonicalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.layoutHash).toBe(b.layoutHash);
    expect(a.canonicalHash).toBe(b.canonicalHash);
    expect(a.canonicalHash).not.toBe(c.canonicalHash);
    expect(a.rows).toBeUndefined();
  });
  it("awaits bounded batches without retaining all rows when collection is disabled", async () => {
    const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, ...Array.from({ length: 5 }, () => [...assetRow])] }]);
    const batches: number[][] = [];
    const parsed = await readAssetWorkbook(bytes, { ruleVersion: "v1", collectRows: false, previewLimit: 2, batchSize: 2, onBatch: async (rows) => { batches.push(rows.map((row) => row.provenance.rowNumber)); } });
    expect(batches).toEqual([[2, 3], [4, 5], [6]]);
    expect(parsed.summary.candidateRows).toBe(5);
    expect(parsed.preview).toHaveLength(2);
    expect(parsed.rows).toBeUndefined();
    await expect(readAssetWorkbook(bytes, { ruleVersion: "v1", onBatch: async () => { throw new Error("batch failed"); } })).rejects.toThrow("batch failed");
  });
  it("requires explicit mapping confirmation before reading ambiguous layouts", async () => {
    const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [[...headers, "JUMLAH"], [...assetRow, 2]] }]);
    const proposal = await readAssetWorkbook(bytes, { ruleVersion: "v1" });
    expect(proposal.layout.requiresConfirmation).toBe(true);
    expect(proposal.summary.candidateRows).toBe(0);
    const confirmedMapping = { ...proposal.layout.selected!, columns: proposal.layout.selected!.columns.filter((column) => column.columnIndex !== 14) };
    expect((await readAssetWorkbook(bytes, { ruleVersion: "v1", confirmedMapping })).summary.candidateRows).toBe(1);
    await expect(readAssetWorkbook(bytes, { ruleVersion: "v1", confirmedMapping: { ...confirmedMapping, headerRow: 999 } })).rejects.toThrow(/mapping/i);
  });

  it("parses confirmed partial legacy mappings while preserving missing required fields", async () => {
    const indexes = headers.map((_, index) => index).filter((index) => index !== 0 && index !== 9);
    const bytes = await workbookBytes([{ name: "3400", rows: [indexes.map((index) => headers[index]), indexes.map((index) => assetRow[index])] }]);
    const proposal = await readAssetWorkbook(bytes, { ruleVersion: "v1" });
    expect(proposal.layout.requiresConfirmation).toBe(true);
    const result = await readAssetWorkbook(bytes, { ruleVersion: "v1", confirmedMapping: proposal.layout.selected!, collectRows: true });
    expect(result.layout.requiresConfirmation).toBe(true);
    expect(result.summary).toMatchObject({ candidateRows: 1, errorRows: 1 });
    expect(result.rows?.[0].asset).toMatchObject({ unitInduk: null, kondisiAset: null });
    expect(result.rows?.[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_REQUIRED_FIELD", field: "unitInduk" }),
      expect.objectContaining({ code: "MISSING_REQUIRED_FIELD", field: "kondisiAset" }),
    ]));
  });

  it("rejects duplicate source indexes, duplicate target fields and stale header fingerprints", async () => {
    const bytes = await workbookBytes(gridFixture().sheets);
    const proposal = await readAssetWorkbook(bytes, { ruleVersion: "v1" });
    const mapping = proposal.layout.selected!;
    for (const columns of [
      [...mapping.columns, { ...mapping.columns[0] }],
      mapping.columns.map((column, index) => index === 1 ? { ...column, field: mapping.columns[0].field } : column),
      mapping.columns.map((column, index) => index === 0 ? { ...column, normalizedHeader: "STALE" } : column),
    ]) {
      await expect(readAssetWorkbook(bytes, { ruleVersion: "v1", confirmedMapping: { ...mapping, columns } })).rejects.toThrow(/mapping/i);
    }
  });

  it("keeps hashes independent of preview, collection and batch sizes across chunk boundaries", async () => {
    const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, ...Array.from({ length: 260 }, () => [...assetRow])] }]);
    const a = await readAssetWorkbook(bytes, { ruleVersion: "v1", collectRows: true, previewLimit: 1, batchSize: 2, onBatch: () => {} });
    const b = await readAssetWorkbook(bytes, { ruleVersion: "v1", collectRows: false, previewLimit: 0, batchSize: 1000, onBatch: () => {} });
    expect(a.canonicalHash).toBe(b.canonicalHash);
    expect(b.summary.candidateRows).toBe(260);
    expect(b.preview).toHaveLength(0);
  });

  it("normalizes confirmed column order before computing hashes", async () => {
    const bytes = await workbookBytes(gridFixture().sheets);
    const proposal = await readAssetWorkbook(bytes, { ruleVersion: "v1" });
    const mapping = proposal.layout.selected!;
    const reordered = await readAssetWorkbook(bytes, { ruleVersion: "v1", confirmedMapping: { ...mapping, columns: [...mapping.columns].reverse() } });
    expect(reordered.layoutHash).toBe(proposal.layoutHash);
    expect(reordered.canonicalHash).toBe(proposal.canonicalHash);
  });

  it("reports deliberately unmapped required fields even in canonical workbooks", async () => {
    const bytes = await workbookBytes(gridFixture().sheets);
    const proposal = await readAssetWorkbook(bytes, { ruleVersion: "v1" });
    const mapping = proposal.layout.selected!;
    const partial = await readAssetWorkbook(bytes, { ruleVersion: "v1", confirmedMapping: { ...mapping, columns: mapping.columns.map((column) => column.field === "kondisiAset" ? { ...column, field: null } : column) } });
    expect(partial.layout.requiresConfirmation).toBe(true);
    expect(partial.layout.selected?.missingRequiredFields).toContain("kondisiAset");
    expect(partial.summary.errorRows).toBe(1);
  });
});
