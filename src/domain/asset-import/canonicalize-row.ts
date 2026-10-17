import { CANONICAL_ASSET_FIELDS } from "./fields";
import { columnLetter, normalizeHeader } from "./normalize-header";
import { parseAssetDate, parseLocalizedNumber, readCellScalar } from "./parse-value";
import type { AssetCondition, AssetRowProvenance, AssetSheetMapping, CanonicalAssetInput, CanonicalizedAssetRow } from "./types";

const conditions: readonly AssetCondition[] = ["P0", "P1", "P2", "P3", "P4"];
const rowLabelFields: readonly (keyof CanonicalAssetInput)[] = [
  "unitInduk", "upt", "namaGi", "bayPenghantar", "tid", "noAset", "namaPeralatan",
];

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string" && !value.trim();
}

export function canonicalizeAssetRow(row: readonly unknown[], mapping: AssetSheetMapping, provenance: AssetRowProvenance): CanonicalizedAssetRow {
  const asset = Object.fromEntries(CANONICAL_ASSET_FIELDS.map((field) => [field.key, null])) as unknown as CanonicalAssetInput;
  const sources: CanonicalizedAssetRow["sources"] = {};
  const issues: CanonicalizedAssetRow["issues"] = [];
  for (const column of mapping.columns) {
    if (!column.field) continue;
    const field = CANONICAL_ASSET_FIELDS.find((definition) => definition.key === column.field)!;
    const rawValue = row[column.columnIndex - 1] ?? null;
    const scalar = readCellScalar(rawValue);
    const address = `${columnLetter(column.columnIndex)}${provenance.rowNumber}`;
    // Adapters differ in how they expose invalid/missing cached formula results.
    // Keep formula/address and the explicit invalid-cache state reproducible;
    // the private original workbook retains the exact error token for audit.
    const evidenceValue = scalar.formula !== undefined && scalar.issue ? { formula: scalar.formula, cacheStatus: "INVALID_OR_MISSING" } : rawValue;
    sources[field.key] = { ...provenance, columnIndex: column.columnIndex, address, rawValue: evidenceValue, ...(scalar.formula === undefined ? {} : { formula: scalar.formula }) };
    const issue = (code: string) => issues.push({ code, severity: "ERROR", message: `Invalid ${field.header} at ${address}`, field: field.key, address });
    if (scalar.issue) { issue(scalar.issue); continue; }
    const value = scalar.value;
    if (value === null || value === undefined || typeof value === "string" && !value.trim()) continue;
    let converted: string | number | null = null;
    if (field.format === "NUMBER" || field.format === "MONEY") {
      const parsed = parseLocalizedNumber(value);
      converted = parsed.value;
      if (parsed.issue) issue(scalar.formula ? "INVALID_FORMULA_RESULT" : parsed.issue);
      else if (parsed.value !== null && parsed.value < 0) issue(field.key === "jumlah" ? "NON_POSITIVE_QUANTITY" : "NEGATIVE_NUMBER");
      else if (field.key === "jumlah" && parsed.value === 0) issue("NON_POSITIVE_QUANTITY");
    } else if (field.format === "DATE") {
      converted = parseAssetDate(value);
      if (!converted) issue(scalar.formula ? "INVALID_FORMULA_RESULT" : "INVALID_DATE");
    } else if (field.format === "CONDITION") {
      const condition = normalizeHeader(value);
      if (conditions.includes(condition as AssetCondition)) converted = condition;
      else issue(scalar.formula ? "INVALID_FORMULA_RESULT" : "INVALID_CONDITION");
    } else if (typeof value === "string" || typeof value === "number" && Number.isFinite(value)) converted = String(value).trim();
    else issue(scalar.formula ? "INVALID_FORMULA_RESULT" : "INVALID_TEXT");
    // The field's conversion is selected from the single canonical definition above.
    Object.assign(asset, { [field.key]: converted });
  }
  for (const field of CANONICAL_ASSET_FIELDS) {
    if (field.requirement === "REQUIRED" && asset[field.key] === null && !issues.some((issue) => issue.field === field.key)) {
      const address = sources[field.key]?.address;
      issues.push({ code: "MISSING_REQUIRED_FIELD", severity: "ERROR", message: `Missing ${field.header}`, field: field.key, ...(address ? { address } : {}) });
    }
  }
  const ageSource = asset.tanggalOperasi ? "OPERATION_DATE" : asset.usiaAsetTahun !== null && asset.usiaAsetTahun >= 0 ? "PROVIDED_AGE" : "MISSING";
  if (asset.tanggalOperasi) asset.usiaAsetTahun = null;
  // Semantic labels are stable when source columns move; numeric, unit,
  // specification and note fields cannot mark a row as an example/subtotal.
  const labels = rowLabelFields.map((field) => normalizeHeader(asset[field]));
  let rejectionReason: CanonicalizedAssetRow["rejectionReason"] = null;
  if (row.every(isBlank)) rejectionReason = "BLANK";
  else if (labels.some((label) => /^(?:CONTOH|EXAMPLE|SAMPLE)(?: |$)/.test(label))) rejectionReason = "EXAMPLE";
  else if (labels.some((label) => /^(?:SUBTOTAL|SUB TOTAL|GRAND TOTAL|TOTAL)(?: |$)/.test(label))) rejectionReason = "SUBTOTAL";
  else if (mapping.columns.filter((column) => column.field && normalizeHeader(row[column.columnIndex - 1]) === column.normalizedHeader).length >= 4) rejectionReason = "REPEATED_HEADER";
  // Once identity/location and equipment/specification establish that this is
  // an asset row, retain it in the draft. Missing quantity/unit are blocking
  // field errors above, not grounds to silently remove the asset from a full
  // snapshot or make it look deleted in the version comparison.
  else if (!(asset.tid || asset.noAset || asset.namaGi || asset.bayPenghantar || asset.unitInduk || asset.upt) || !(asset.namaPeralatan || asset.spesifikasiMara)) rejectionReason = "INCOMPLETE_CANDIDATE";
  return { asset, provenance, sources, issues, ageSource, candidate: rejectionReason === null, rejectionReason };
}
