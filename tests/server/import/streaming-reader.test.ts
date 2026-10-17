// @vitest-environment node
import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import fs from "node:fs";
import JSZip from "jszip";
import { PassThrough } from "node:stream";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
import { readNodeAssetWorkbook } from "../../../src/server/import/read-node-workbook";
import { headers, assetRow, workbookBytes } from "../../fixtures/asset-workbooks";
vi.mock("server-only", () => ({}));
it("ignores non-cell extension XML while preserving the same canonical asset hash", async () => {
  const archive = await JSZip.loadAsync(await workbookBytes([{ name: "DATA_ASET", rows: [headers, assetRow] }]));
  const sheet = archive.file("xl/worksheets/sheet1.xml")!;
  archive.file(sheet.name, (await sheet.async("string")).replace("</worksheet>", '<extLst><ext uri="synthetic"><c xmlns="urn:synthetic" r="not-an-asset-cell"><f>opaque extension</f><v>opaque</v></c></ext></extLst></worksheet>'));
  const bytes = await archive.generateAsync({ type: "uint8array" });
  const browser = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  expect(browser.summary.candidateRows).toBe(1);
  expect(await readNodeAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true })).toEqual(browser);
});
it("rejects orphan shared metadata instead of stalling the ordered ZIP stream", async () => {
  const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, assetRow.map((value, index) => index === 12 ? { formula: "0", result: 0 } : value)] }]);
  const archive = await JSZip.loadAsync(bytes), sheet = archive.file("xl/worksheets/sheet1.xml")!;
  archive.file(sheet.name, (await sheet.async("string")).replace("<f>0</f>", '<f t="shared" si="99"/>'));
  await expect(readNodeAssetWorkbook(await archive.generateAsync({ type: "uint8array" }), { ruleVersion: "test" })).rejects.toThrow("Invalid worksheet XML");
});
it("preserves shared-formula anchors, followers and hashes across the header sample boundary", async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("DATA_ASET");
  sheet.addRow(headers); for (let index = 0; index < 72; index++) sheet.addRow(assetRow);
  sheet.fillFormula("M2:M73", "H2*100", Array(72).fill(200));
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const browser = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  expect(browser.rows![0].asset.nilaiBukuSap).toBe(200);
  expect(browser.rows![71].asset.nilaiBukuSap).toBe(200);
  const server = await readNodeAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true, confirmedMapping: browser.layout.selected! });
  expect(server).toEqual(browser);
  expect(server.canonicalHash).toBe(browser.canonicalHash);
});
it("keeps a cached DATE formula in the workbook's 1904 date system, including canonical evidence", async () => {
  const workbook = new ExcelJS.Workbook(); workbook.properties.date1904 = true;
  const sheet = workbook.addWorksheet("DATA_ASET"); sheet.addRow(headers); sheet.addRow(assetRow);
  sheet.getCell("K2").value = { formula: "DATE(2010,1,1)", result: new Date("2010-01-01T00:00:00Z") };
  sheet.getCell("K2").numFmt = "yyyy-mm-dd";
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const browser = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  expect(browser.rows![0].asset.tanggalOperasi).toBe("2010-01-01");
  const server = await readNodeAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true, confirmedMapping: browser.layout.selected! });
  expect(server).toEqual(browser);
});
it.each([false, true])("rejects a cached boolean %s as a SAP formula value instead of coercing it to a number", async result => {
  const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, assetRow.map((value, index) => index === 12 ? { formula: result ? "TRUE()" : "FALSE()", result } : value)] }]);
  const browser = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true });
  expect(browser.rows![0].asset.nilaiBukuSap).toBeNull();
  expect(browser.rows![0].issues).toContainEqual(expect.objectContaining({ field: "nilaiBukuSap", code: "INVALID_FORMULA_RESULT" }));
  expect(await readNodeAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true, confirmedMapping: browser.layout.selected! })).toEqual(browser);
});
it("reads an inline-string XLSX without spooling worksheet XML to temporary disk", async () => {
  const stream = new PassThrough(), chunks: Buffer[] = []; stream.on("data", chunk => chunks.push(chunk));
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useSharedStrings: false });
  const sheet = workbook.addWorksheet("DATA_ASET"); sheet.addRow(headers).commit(); sheet.addRow(assetRow).commit(); await workbook.commit();
  const bytes = new Uint8Array(Buffer.concat(chunks));
  expect((await JSZip.loadAsync(bytes)).file("xl/sharedStrings.xml")).toBeNull();
  const writes = vi.spyOn(fs, "createWriteStream");
  try { expect((await readNodeAssetWorkbook(bytes, { ruleVersion: "test" })).summary.candidateRows).toBe(1); expect(writes).not.toHaveBeenCalled(); }
  finally { writes.mockRestore(); }
});
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
