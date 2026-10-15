import { CANONICAL_ASSET_FIELDS } from "./fields";
import { columnLetter, normalizeHeader } from "./normalize-header";
import { parseAssetDate, parseLocalizedNumber, readCellScalar } from "./parse-value";
import type { AssetSheetMapping, AssetWorkbookGrid, CanonicalAssetField, WorkbookLayoutProposal } from "./types";

const required = CANONICAL_ASSET_FIELDS.filter((field) => field.requirement === "REQUIRED");

function compatibility(field: CanonicalAssetField, values: readonly unknown[]): number {
  const populated = values.map((value) => readCellScalar(value).value).filter((value) => value !== null && value !== undefined && value !== "");
  if (!populated.length) return 0.5;
  return populated.filter((value) => {
    if (field.format === "NUMBER" || field.format === "MONEY") return parseLocalizedNumber(value).value !== null;
    if (field.format === "DATE") return parseAssetDate(value) !== null;
    if (field.format === "CONDITION") return /^P[0-4]$/.test(normalizeHeader(value));
    return typeof value === "string" || typeof value === "number";
  }).length / populated.length;
}

/** Scores every sheet's first fifty rows; names are only a small preference. */
export function detectWorkbookLayout(workbook: AssetWorkbookGrid): WorkbookLayoutProposal {
  const candidates: AssetSheetMapping[] = [];
  for (const sheet of workbook.sheets) {
    for (let rowIndex = 0; rowIndex < Math.min(50, sheet.rows.length); rowIndex++) {
      const row = sheet.rows[rowIndex];
      const samples = sheet.rows.slice(rowIndex + 1, rowIndex + 21);
      const columns = Array.from(row, (value, index) => {
        const header = String(readCellScalar(value).value ?? "");
        const normalizedHeader = normalizeHeader(header);
        const matched = CANONICAL_ASSET_FIELDS.find((field) => [field.header, ...field.aliases].some((alias) => normalizeHeader(alias) === normalizedHeader));
        return { columnIndex: index + 1, columnLetter: columnLetter(index + 1), header, normalizedHeader, field: matched?.key ?? null, confidence: matched ? compatibility(matched, samples.map((sample) => sample[index])) : 0 };
      });
      let inferredDuplicate = false;
      const mara = columns.filter((column) => column.normalizedHeader === "MARA");
      if (mara.length > 1) {
        const identifiers = mara.filter((column) => {
          const values = samples.map((sample) => readCellScalar(sample[column.columnIndex - 1]).value).filter((value) => value !== null && value !== undefined && value !== "");
          return values.length > 0 && values.every((value) => /^\d{4,}$/.test(String(value).trim()));
        });
        if (identifiers.length === 1 && !columns.some((column) => column.field === "noAset")) {
          identifiers[0].field = "noAset";
          identifiers[0].confidence = 0.75;
          inferredDuplicate = true;
        }
      }
      const distinct = new Set(columns.flatMap((column) => column.field ? [column.field] : []));
      const requiredHits = required.filter((field) => distinct.has(field.key)).length;
      // A helper sheet or title cannot qualify on its name or one shared label.
      if (requiredHits < 4 || !distinct.has("jumlah") || !distinct.has("satuan") || !distinct.has("namaPeralatan") && !distinct.has("spesifikasiMara")) continue;
      const missingRequiredFields = required.filter((field) => !distinct.has(field.key)).map((field) => field.key);
      const ambiguousFields = [...distinct].filter((field) => columns.filter((column) => column.field === field).length > 1);
      if (inferredDuplicate) ambiguousFields.push("noAset");
      const conditionalHits = CANONICAL_ASSET_FIELDS.filter((field) => field.requirement === "CONDITIONAL" && distinct.has(field.key)).length;
      const typeScore = columns.filter((column) => column.field).reduce((sum, column) => sum + column.confidence, 0) / distinct.size;
      const score = requiredHits * 10 + conditionalHits * 2 + typeScore * 5 + (normalizeHeader(sheet.name) === "DATA ASET" ? 2 : 0);
      candidates.push({ sheetName: sheet.name, headerRow: rowIndex + 1, columns, score, confidence: Math.min(1, requiredHits / required.length * 0.8 + typeScore * 0.2), missingRequiredFields, ambiguousFields });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.sheetName.localeCompare(b.sheetName) || a.headerRow - b.headerRow);
  const selected = candidates[0] ?? null;
  return { selected, candidates, requiresConfirmation: !selected || selected.missingRequiredFields.length > 0 || selected.ambiguousFields.length > 0 || Boolean(candidates[1] && candidates[1].score === selected.score) };
}
