import ExcelJS from "exceljs";
import { canonicalizeAssetRow } from "../../domain/asset-import/canonicalize-row";
import { detectWorkbookLayout } from "../../domain/asset-import/detect-layout";
import { CANONICAL_ASSET_FIELDS } from "../../domain/asset-import/fields";
import { normalizeHeader } from "../../domain/asset-import/normalize-header";
import { readCellScalar } from "../../domain/asset-import/parse-value";
import type { AssetSheetMapping, CanonicalizedAssetRow, WorkbookLayoutProposal } from "../../domain/asset-import/types";

export interface ReadAssetWorkbookOptions {
  ruleVersion: string;
  confirmedMapping?: AssetSheetMapping;
  previewLimit?: number;
  collectRows?: boolean;
  batchSize?: number;
  onBatch?: (rows: CanonicalizedAssetRow[]) => void | Promise<void>;
  onPhase?: (measurement: { phase: "workbookParse" | "canonicalization"; durationMs: number }) => void;
}

export interface ParsedAssetWorkbook {
  layout: WorkbookLayoutProposal;
  layoutHash: string;
  canonicalHash: string;
  preview: CanonicalizedAssetRow[];
  rows?: CanonicalizedAssetRow[];
  summary: { candidateRows: number; rejectedRows: number; errorRows: number; rejectionReasons: Record<string, number> };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assetCellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  // ExcelJS 4.4 Cell.value omits falsy formula caches. Its public result
  // accessor retains 0, which must remain a valid book value and asset age.
  return cell.type === ExcelJS.ValueType.Formula && value && typeof value === "object" ? { ...value, result: cell.result } : value;
}
function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  const row = sheet.getRow(rowNumber);
  return Array.from({ length: row.cellCount }, (_, index) => assetCellValue(row.getCell(index + 1)));
}

export interface WorkbookSheetData { name: string; rows: unknown[][]; rowCount: number; columnCount: number }
export interface WorkbookRowAdapter {
  sheets: WorkbookSheetData[];
  rows(sheetName: string): AsyncIterable<{ rowNumber: number; values: unknown[] }>;
}
function validateMapping(mapping: AssetSheetMapping, sheets: WorkbookSheetData[]): AssetSheetMapping {
  const sheet = sheets.find(sheet => sheet.name === mapping.sheetName);
  if (!sheet || !Number.isInteger(mapping.headerRow) || mapping.headerRow < 1 || mapping.headerRow > Math.min(50, sheet.rowCount)) throw new Error("Invalid confirmed mapping sheet/header");
  const indexes = new Set<number>();
  const fields = new Set<string>();
  for (const column of mapping.columns) {
    if (!Number.isInteger(column.columnIndex) || column.columnIndex < 1 || column.columnIndex > sheet.columnCount || indexes.has(column.columnIndex) || normalizeHeader(readCellScalar(sheet.rows[mapping.headerRow - 1]?.[column.columnIndex - 1]).value) !== column.normalizedHeader) throw new Error("Invalid confirmed mapping column");
    indexes.add(column.columnIndex);
    if (!column.field) continue;
    if (!CANONICAL_ASSET_FIELDS.some((field) => field.key === column.field) || fields.has(column.field)) throw new Error("Invalid confirmed mapping field");
    fields.add(column.field);
  }
  return {
    ...mapping,
    columns: [...mapping.columns].sort((a, b) => a.columnIndex - b.columnIndex),
    missingRequiredFields: CANONICAL_ASSET_FIELDS.filter((field) => field.requirement === "REQUIRED" && !fields.has(field.key)).map((field) => field.key),
    ambiguousFields: [],
  };
}

/** ExcelJS is only an adapter; detection and canonicalization are platform independent. */
export async function readAssetWorkbook(bytes: Uint8Array | ArrayBuffer, options: ReadAssetWorkbookOptions): Promise<ParsedAssetWorkbook> {
  const previewLimit = options.previewLimit ?? 100;
  const batchSize = options.batchSize ?? 1000;
  if (!options.ruleVersion.trim() || !Number.isInteger(previewLimit) || previewLimit < 0 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("Invalid workbook reader options");
  const workbook = new ExcelJS.Workbook();
  const parseStarted = performance.now();
  // An owned ArrayBuffer works in browsers and Node without a Buffer dependency.
  const buffer = (bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes)).buffer;
  await workbook.xlsx.load(buffer);
  options.onPhase?.({ phase: "workbookParse", durationMs: performance.now() - parseStarted });
  return canonicalizeWorkbookAdapter({
    sheets: workbook.worksheets.map(sheet => ({ name: sheet.name, rows: Array.from({ length: Math.min(70, sheet.rowCount) }, (_, index) => rowValues(sheet, index + 1)), rowCount: sheet.rowCount, columnCount: sheet.columnCount })),
    async *rows(sheetName) { const sheet = workbook.getWorksheet(sheetName)!; for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) { const values = rowValues(sheet, rowNumber); sheet.getRow(rowNumber).values = []; yield { rowNumber, values }; } },
  }, options);
}

/** Both adapters use this one row, rejection and hash contract. */
export async function canonicalizeWorkbookAdapter(adapter: WorkbookRowAdapter, options: ReadAssetWorkbookOptions): Promise<ParsedAssetWorkbook> {
  const previewLimit = options.previewLimit ?? 100, batchSize = options.batchSize ?? 1000;
  if (!options.ruleVersion.trim() || !Number.isInteger(previewLimit) || previewLimit < 0 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("Invalid workbook reader options");
  const canonicalizationStarted = performance.now();
  const layout = detectWorkbookLayout({ sheets: adapter.sheets });
  if (options.confirmedMapping) {
    layout.selected = validateMapping(options.confirmedMapping, adapter.sheets);
    layout.requiresConfirmation ||= layout.selected.missingRequiredFields.length > 0;
  }
  const mapping = layout.selected;
  const layoutHash = await sha256(JSON.stringify(mapping ? { sheetName: mapping.sheetName, headerRow: mapping.headerRow, columns: mapping.columns.map(({ columnIndex, normalizedHeader, field }) => ({ columnIndex, normalizedHeader, field })) } : null));
  const summary: ParsedAssetWorkbook["summary"] = { candidateRows: 0, rejectedRows: 0, errorRows: 0, rejectionReasons: {} };
  const preview: CanonicalizedAssetRow[] = [];
  const rows = options.collectRows ? [] as CanonicalizedAssetRow[] : undefined;
  let batch: CanonicalizedAssetRow[] = [];
  let hashChunk: string[] = [];
  let chain = await sha256(JSON.stringify({ ruleVersion: options.ruleVersion, layoutHash }));
  // Fixed 256-row chunks make the evidence independent of preview/collection/batch options.
  const flushHash = async () => {
    if (hashChunk.length) chain = await sha256(chain + "\n" + hashChunk.join("\n"));
    hashChunk = [];
  };
  if (mapping && (options.confirmedMapping || !layout.requiresConfirmation)) {
    for await (const { rowNumber, values } of adapter.rows(mapping.sheetName)) {
      if (rowNumber <= mapping.headerRow) continue;
      const row = canonicalizeAssetRow(values, mapping, { sheetName: mapping.sheetName, rowNumber });
      if (!row.candidate) {
        summary.rejectedRows++;
        const reason = row.rejectionReason!;
        summary.rejectionReasons[reason] = (summary.rejectionReasons[reason] ?? 0) + 1;
        continue;
      }
      summary.candidateRows++;
      if (row.issues.some((issue) => issue.severity === "ERROR")) summary.errorRows++;
      hashChunk.push(JSON.stringify(row));
      if (hashChunk.length === 256) await flushHash();
      if (preview.length < previewLimit) preview.push(row);
      rows?.push(row);
      if (options.onBatch) {
        batch.push(row);
        if (batch.length === batchSize) { await options.onBatch(batch); batch = []; }
      }
    }
    if (batch.length) await options.onBatch!(batch);
  }
  await flushHash();
  const canonicalHash = await sha256(JSON.stringify({ chain, summary }));
  options.onPhase?.({ phase: "canonicalization", durationMs: performance.now() - canonicalizationStarted });
  return { layout, layoutHash, canonicalHash, summary, preview, ...(rows ? { rows } : {}) };
}
