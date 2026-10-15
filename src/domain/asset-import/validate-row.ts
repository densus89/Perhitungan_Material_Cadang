import { CANONICAL_ASSET_FIELDS } from "./fields";
import { isNonnegativeNumber } from "./comparables";
import { normalizeAssetText } from "./useful-life";
import type { CanonicalAssetInput, CanonicalizedAssetRow, RowIssue } from "./types";
import type { ValuationResolution } from "./valuation";

export interface RowValidationResult { valid: boolean; errors: RowIssue[]; warnings: RowIssue[]; manualApprovalRequired: boolean }
export interface RowValidationContext { existingAssets?: readonly (CanonicalAssetInput | CanonicalizedAssetRow)[] }

export function validateAssetRow(row: CanonicalizedAssetRow, valuation: ValuationResolution, context: RowValidationContext = {}): RowValidationResult {
  const asset = row.asset, issues: RowIssue[] = [...row.issues];
  const add = (code: string, severity: RowIssue["severity"], field?: keyof CanonicalAssetInput) => {
    if (!issues.some((issue) => issue.code === code && issue.field === field)) issues.push({ code, severity, message: code.replace(/_/g, " "), ...(field ? { field } : {}) });
  };
  for (const field of CANONICAL_ASSET_FIELDS) {
    const value = asset[field.key];
    if (field.requirement === "REQUIRED" && (value === null || typeof value === "string" && !value.trim())) add("MISSING_REQUIRED_FIELD", "ERROR", field.key);
    if ((field.format === "NUMBER" || field.format === "MONEY") && value !== null && !isNonnegativeNumber(value)) add("INVALID_NUMBER", "ERROR", field.key);
    const raw = row.sources[field.key]?.rawValue;
    if ((field.format === "NUMBER" || field.format === "MONEY") && typeof raw === "string" && raw.trim() && isNonnegativeNumber(value)) add("NUMERIC_TEXT", "WARNING", field.key);
  }
  if (asset.jumlah !== null && (!isNonnegativeNumber(asset.jumlah) || asset.jumlah <= 0)) add("NON_POSITIVE_QUANTITY", "ERROR", "jumlah");
  if (asset.kondisiAset !== null && !["P0", "P1", "P2", "P3", "P4"].includes(asset.kondisiAset)) add("INVALID_CONDITION", "ERROR", "kondisiAset");
  if (valuation.usefulLife.status === "AMBIGUOUS") add("AMBIGUOUS_USEFUL_LIFE", "ERROR", "kodeClassAsset");
  if (!isNonnegativeNumber(valuation.nilaiABC)) add("UNRESOLVED_VALUE", "ERROR");
  if (!asset.noAset?.trim() || !asset.tid?.trim()) add("MISSING_IDENTIFIERS", "WARNING");
  for (const code of valuation.warnings) add(code, "WARNING");
  for (const entry of context.existingAssets ?? []) {
    const other = "asset" in entry ? entry.asset : entry;
    if (asset.noAset?.trim() && asset.noAset.trim() === other.noAset?.trim()) {
      const identity: readonly (keyof CanonicalAssetInput)[] = ["unitInduk", "upt", "namaGi", "bayPenghantar", "tid", "namaPeralatan", "spesifikasiMara", "satuan"];
      if (identity.some((field) => normalizeAssetText(String(asset[field] ?? "")) !== normalizeAssetText(String(other[field] ?? "")))) add("DUPLICATE_IDENTITY_CONFLICT", "ERROR", "noAset");
    }
  }
  const errors = issues.filter((issue) => issue.severity === "ERROR"), warnings = issues.filter((issue) => issue.severity === "WARNING");
  return { valid: errors.length === 0, errors, warnings, manualApprovalRequired: valuation.manualApprovalRequired };
}
