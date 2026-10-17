import "server-only";
import { Readable } from "node:stream";
import type { EventEmitter } from "node:events";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { canonicalizeWorkbookAdapter, type WorkbookSheetData, type ReadAssetWorkbookOptions } from "../../lib/spreadsheet/read-asset-workbook";
import { observeFormulaMetadata } from "./read-formula-metadata";

/** Two bounded XML passes: keep only 70 header/sample rows per sheet, then
 * canonicalize the selected sheet. The full ExcelJS document is never retained. */
export async function readNodeAssetWorkbook(bytes: Uint8Array, options: ReadAssetWorkbookOptions) {
  const started = performance.now();
  const archive = await JSZip.loadAsync(bytes);
  if (!archive.file("xl/workbook.xml") || !archive.file("xl/_rels/workbook.xml.rels")) throw new Error("Invalid workbook metadata");
  // A valid inline-string workbook may omit this part. An empty cache entry
  // prevents ExcelJS's missing-shared-strings worksheet temporary-file fallback.
  if (!archive.file("xl/sharedStrings.xml")) archive.file("xl/sharedStrings.xml", '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>');
  // ExcelJS 4.4's streaming reader assumes workbook.xml precedes worksheets.
  // Valid XLSX files may order ZIP entries differently. Reorder entry streams
  // with the public ZIP API; never materialize worksheet XML in memory.
  const priority = (name: string) => ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml", "xl/styles.xml"].indexOf(name);
  const reader = () => {
    const ordered = new JSZip();
    const metadata = new Map<string, ReturnType<typeof observeFormulaMetadata>>();
    let current: ReturnType<typeof observeFormulaMetadata> | undefined;
    for (const file of Object.values(archive.files).filter(file => !file.dir).sort((a, b) => (priority(a.name) < 0 ? 10 : priority(a.name)) - (priority(b.name) < 0 ? 10 : priority(b.name)))) {
      const source = file.nodeStream();
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)) {
        const observer = observeFormulaMetadata(); metadata.set(file.name, observer);
        source.on("error", () => observer.stream.destroy(new Error("Invalid worksheet stream")));
        ordered.file(file.name, source.pipe(observer.stream));
      } else ordered.file(file.name, source);
    }
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(new Readable().wrap(ordered.generateNodeStream({ streamFiles: true, compression: "STORE" })), { entries: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "cache", worksheets: "emit" });
    // ExcelJS's installed WorkbookReader inherits EventEmitter at runtime, but
    // its 4.4 declaration incorrectly inherits the document Workbook instead.
    (workbook as unknown as EventEmitter).on("entry", (entry: { type: string; id?: string }) => { if (entry.type === "worksheet") current = metadata.get(`xl/worksheets/sheet${entry.id}.xml`); });
    return { workbook, context() {
      if (!current) throw new Error("Invalid worksheet metadata");
      const properties = Reflect.get(workbook, "properties") as { model?: { date1904?: boolean } } | undefined;
      return { formulas: current, date1904: properties?.model?.date1904 === true };
    } };
  };
  const sheets: WorkbookSheetData[] = [];
  const first = reader();
  for await (const worksheet of first.workbook) {
    const { formulas, date1904 } = first.context();
    const name: unknown = Reflect.get(worksheet, "name"); if (typeof name !== "string") throw new Error("Invalid worksheet name");
    const sample: unknown[][] = []; let rowCount = 0, columnCount = 0;
    for await (const chunk of worksheet) for (const row of Array.isArray(chunk) ? chunk : [chunk]) {
      rowCount = Math.max(rowCount, row.number); columnCount = Math.max(columnCount, row.cellCount);
      if (row.number <= 70) sample[row.number - 1] = formulas.rowValues(row, date1904); else formulas.discard(row.number);
    }
    formulas.assertValid();
    sheets.push({ name, rows: Array.from({ length: Math.min(70, rowCount) }, (_, index) => sample[index] ?? []), rowCount, columnCount });
  }
  options.onPhase?.({ phase: "workbookParse", durationMs: performance.now() - started });
  return canonicalizeWorkbookAdapter({ sheets, async *rows(sheetName) {
    const second = reader();
    for await (const worksheet of second.workbook) {
      const { formulas, date1904 } = second.context();
      const name: unknown = Reflect.get(worksheet, "name"); if (typeof name !== "string") throw new Error("Invalid worksheet name");
      let previous = 0;
      for await (const chunk of worksheet) for (const row of Array.isArray(chunk) ? chunk : [chunk]) {
        if (name !== sheetName) { formulas.discard(row.number); continue; }
        // Sparse XML omits spacers. The shared browser adapter visits them.
        while (++previous < row.number) yield { rowNumber: previous, values: [] };
        yield { rowNumber: row.number, values: formulas.rowValues(row, date1904) };
      }
      formulas.assertValid();
    }
  } }, options);
}
