import "server-only";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { SaxesParser } from "saxes";
import type ExcelJS from "exceljs";
import { assetCellValue, assetFormulaValue } from "../../lib/spreadsheet/read-asset-workbook";

interface FormulaMetadata { address: string; type?: string; formula?: string; attributes: Record<string, string>; cache?: string; sharedFormula?: string }

/** Observe unchanged XML under stream backpressure. Keep only formula metadata
 * queued ahead of consumed rows, plus one address per shared-formula anchor.
 * ExcelJS still owns cell/style decoding; expressions are never evaluated. */
export function observeFormulaMetadata() {
  const rows = new Map<number, Map<string, FormulaMetadata>>(), anchors = new Map<string, string>();
  const parser = new SaxesParser({ xmlns: false }), decoder = new StringDecoder("utf8");
  let cell: FormulaMetadata | undefined, current: "formula" | "cache" | undefined;
  let inSheetData = false, inRow = false, invalid = false;
  const fail = () => { invalid = true; rows.clear(); anchors.clear(); cell = undefined; current = undefined; };
  parser.on("opentag", tag => {
    if (tag.name === "sheetData") inSheetData = true;
    else if (tag.name === "row" && inSheetData) inRow = true;
    else if (tag.name === "c" && inSheetData && inRow) cell = { address: tag.attributes.r, type: tag.attributes.t, attributes: {} };
    else if (cell && tag.name === "f") { cell.formula = ""; cell.attributes = tag.attributes; current = "formula"; }
    else if (cell && tag.name === "v") { cell.cache = ""; current = "cache"; }
  });
  const text = (value: string) => { if (cell && current) cell[current] = (cell[current] ?? "") + value; };
  parser.on("text", text); parser.on("cdata", text);
  parser.on("closetag", tag => {
    if (tag.name === "sheetData") inSheetData = false;
    if (tag.name === "row") inRow = false;
    if (tag.name === "f" || tag.name === "v") current = undefined;
    if (tag.name !== "c" || !cell) return;
    if (cell.formula !== undefined) {
      const row = Number(/\d+$/.exec(cell.address)?.[0]);
      if (!Number.isInteger(row) || row < 1) throw new Error("Invalid formula address");
      if (cell.attributes.t === "shared") {
        const sharedId = String(Number.parseInt(cell.attributes.si, 10));
        if (cell.attributes.ref) anchors.set(sharedId, cell.address);
        else { cell.sharedFormula = anchors.get(sharedId); if (!cell.sharedFormula) throw new Error("Invalid shared formula anchor"); }
      }
      const entries = rows.get(row) ?? new Map<string, FormulaMetadata>(); entries.set(cell.address, cell); rows.set(row, entries);
    }
    cell = undefined;
  });
  parser.on("doctype", () => { throw new Error("Workbook DTD is not supported"); });
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try { if (!invalid) parser.write(decoder.write(chunk)); } catch { fail(); }
      // Do not break ZIP production halfway through a worksheet: ExcelJS's
      // unzip iterator otherwise waits forever for the unfinished archive.
      // Reject after the worksheet is drained, before any parsed result escapes.
      callback(null, chunk);
    },
    flush(callback) { try { if (!invalid) parser.write(decoder.end()).close(); } catch { fail(); } callback(); },
  });
  return {
    stream,
    assertValid() { if (invalid) throw new Error("Invalid worksheet XML"); },
    discard(row: number) { rows.delete(row); },
    rowValues(row: ExcelJS.Row, date1904: boolean) {
      const entries = rows.get(row.number); rows.delete(row.number);
      return Array.from({ length: row.cellCount }, (_, index) => {
        const cell = row.getCell(index + 1), metadata = entries?.get(cell.address);
        if (!metadata) return assetCellValue(cell);
        // Streaming ExcelJS parses all non-string formula caches as numbers.
        // Recover their XML type before applying the same date-style conversion
        // as its document reader (including the workbook's 1904 offset).
        let result: unknown;
        if (metadata.cache) {
          if (metadata.type === "str") {
            const entities: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&apos;": "'", "&quot;": '"' };
            result = metadata.cache.replace(/&([a-z]*);/g, entity => entities[entity] ?? entity);
          } else if (metadata.type === "b") result = Number.parseInt(metadata.cache, 10) !== 0;
          else if (metadata.type === "e") result = { error: metadata.cache };
          else result = Number.parseFloat(metadata.cache);
        }
        const format = cell.numFmt?.replace(/\[[^\]]*]/g, "").replace(/"[^"]*"/g, "");
        if (result !== undefined && format && /[ymdhMsb]+/.test(format)) result = new Date(Math.round((Number(result) - 25569 + (date1904 ? 1462 : 0)) * 86400000));
        return assetFormulaValue(metadata.sharedFormula ? { sharedFormula: metadata.sharedFormula } : {
          formula: metadata.formula,
          ...(metadata.attributes.t ? { shareType: metadata.attributes.t } : {}),
          ...(metadata.attributes.ref ? { ref: metadata.attributes.ref } : {}),
        }, result);
      });
    },
  };
}
