import "server-only";
import { Readable } from "node:stream";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { assetCellValue, canonicalizeWorkbookAdapter, type WorkbookSheetData, type ReadAssetWorkbookOptions } from "../../lib/spreadsheet/read-asset-workbook";

/** Two bounded XML passes: keep only 70 header/sample rows per sheet, then
 * canonicalize the selected sheet. The full ExcelJS document is never retained. */
export async function readNodeAssetWorkbook(bytes: Uint8Array, options: ReadAssetWorkbookOptions) {
  const started = performance.now();
  const archive = await JSZip.loadAsync(bytes);
  // ExcelJS 4.4's streaming reader assumes workbook.xml precedes worksheets.
  // Valid XLSX files may order ZIP entries differently. Reorder entry streams
  // with the public ZIP API; never materialize worksheet XML in memory.
  const priority = (name: string) => ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml", "xl/styles.xml"].indexOf(name);
  const reader = () => {
    const ordered = new JSZip();
    for (const file of Object.values(archive.files).filter(file => !file.dir).sort((a, b) => (priority(a.name) < 0 ? 10 : priority(a.name)) - (priority(b.name) < 0 ? 10 : priority(b.name)))) ordered.file(file.name, file.nodeStream());
    return new ExcelJS.stream.xlsx.WorkbookReader(new Readable().wrap(ordered.generateNodeStream({ streamFiles: true, compression: "STORE" })), { entries: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "cache", worksheets: "emit" });
  };
  const sheets: WorkbookSheetData[] = [];
  for await (const worksheet of reader()) {
    const name: unknown = Reflect.get(worksheet, "name"); if (typeof name !== "string") throw new Error("Invalid worksheet name");
    const sample: unknown[][] = []; let rowCount = 0, columnCount = 0;
    for await (const chunk of worksheet) for (const row of Array.isArray(chunk) ? chunk : [chunk]) {
      rowCount = Math.max(rowCount, row.number); columnCount = Math.max(columnCount, row.cellCount);
      if (row.number <= 70) sample[row.number - 1] = Array.from({ length: row.cellCount }, (_, index) => assetCellValue(row.getCell(index + 1)));
    }
    sheets.push({ name, rows: Array.from({ length: Math.min(70, rowCount) }, (_, index) => sample[index] ?? []), rowCount, columnCount });
  }
  options.onPhase?.({ phase: "workbookParse", durationMs: performance.now() - started });
  return canonicalizeWorkbookAdapter({ sheets, async *rows(sheetName) {
    for await (const worksheet of reader()) {
      const name: unknown = Reflect.get(worksheet, "name"); if (typeof name !== "string") throw new Error("Invalid worksheet name");
      let previous = 0;
      for await (const chunk of worksheet) for (const row of Array.isArray(chunk) ? chunk : [chunk]) {
        if (name !== sheetName) continue;
        // Sparse XML omits spacers. The shared browser adapter visits them.
        while (++previous < row.number) yield { rowNumber: previous, values: [] };
        yield { rowNumber: row.number, values: Array.from({ length: row.cellCount }, (_, index) => assetCellValue(row.getCell(index + 1))) };
      }
    }
  } }, options);
}
