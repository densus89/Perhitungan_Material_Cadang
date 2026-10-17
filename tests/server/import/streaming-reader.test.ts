// @vitest-environment node
import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
import { readNodeAssetWorkbook } from "../../../src/server/import/read-node-workbook";
import { headers, assetRow, workbookBytes } from "../../fixtures/asset-workbooks";
vi.mock("server-only", () => ({}));
it("preserves cached formula zero as valid SAP value and age through both real XLSX adapters", async () => {
  const row = assetRow.map((value, index) => index === 11 || index === 12 ? { formula: "0", result: 0 } : value);
  const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, row] }]);
  for (const read of [readAssetWorkbook, readNodeAssetWorkbook]) {
    const parsed = await read(bytes, { ruleVersion: "test", collectRows: true });
    expect(parsed.rows![0].asset.nilaiBukuSap).toBe(0);
    expect(parsed.rows![0].asset.usiaAsetTahun).toBe(0);
    expect(parsed.rows![0].issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_FORMULA_RESULT" })]));
  }
});
it("streams the authoritative workbook with exactly the browser's mapping, counts, provenance and hashes", async () => {
  const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, assetRow, [], [...assetRow.slice(0, 12), { formula: "NA()", result: { error: "#N/A" } }], [...assetRow.slice(0, 12), "1.234,50"]] }, { name: "helper", rows: [["not asset data"]] }]);
  const browser = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  const streamed = await readNodeAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  expect(streamed).toEqual(browser);
  expect(streamed.summary).toMatchObject({ candidateRows: 3, rejectedRows: 1, errorRows: 1 });
});
it("preserves date1904 cached dates and refuses forged mappings identically", async () => {
  const workbook = new ExcelJS.Workbook(); workbook.properties.date1904 = true;
  const sheet = workbook.addWorksheet("renamed"); sheet.addRow(["synthetic title"]); sheet.addRow(headers); sheet.addRow([...assetRow.slice(0, 10), new Date("2010-01-01T00:00:00Z"), null, 0]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const browser = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  expect(await readNodeAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true })).toEqual(browser);
  const bad = { ...browser.layout.selected!, columns: browser.layout.selected!.columns.map((column, index) => index ? column : { ...column, normalizedHeader: "FORGED" }) };
  await expect(readNodeAssetWorkbook(bytes, { ruleVersion: "test", confirmedMapping: bad })).rejects.toThrow(/mapping/);
});
