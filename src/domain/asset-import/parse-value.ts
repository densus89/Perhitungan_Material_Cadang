export interface ParsedNumber {
  value: number | null;
  blank: boolean;
  issue: string | null;
}

export interface ScalarCell {
  value: unknown;
  formula?: string;
  issue: string | null;
}

/** Read only cached formula scalars. Never evaluate expressions or follow links. */
export function readCellScalar(raw: unknown): ScalarCell {
  if (raw !== null && typeof raw === "object" && !(raw instanceof Date)) {
    const cell = raw as Record<string, unknown>;
    if ("formula" in cell || "sharedFormula" in cell) {
      const formula = String(cell.formula ?? cell.sharedFormula);
      const result = cell.result;
      if (result instanceof Date) {
        return Number.isFinite(result.getTime())
          ? { value: result, formula, issue: null }
          : { value: null, formula, issue: "INVALID_FORMULA_RESULT" };
      }
      if (result === null || result === undefined || typeof result === "object" || typeof result === "boolean" || typeof result === "number" && !Number.isFinite(result) || typeof result === "string" && (!result.trim() || result.startsWith("#"))) {
        return { value: null, formula, issue: "INVALID_FORMULA_RESULT" };
      }
      return { value: result, formula, issue: null };
    }
    // Rich text is display text; hyperlinks are never fetched.
    if (Array.isArray(cell.richText)) {
      return { value: cell.richText.map((part) => typeof part === "object" && part !== null && "text" in part ? String(part.text) : "").join(""), issue: null };
    }
    if (typeof cell.text === "string" && "hyperlink" in cell) return { value: cell.text, issue: null };
    return { value: null, issue: "INVALID_CELL_VALUE" };
  }
  return { value: raw, issue: null };
}

export function parseLocalizedNumber(raw: unknown): ParsedNumber {
  const scalar = readCellScalar(raw);
  const invalid = (issue = scalar.issue ?? "INVALID_NUMBER"): ParsedNumber => ({ value: null, blank: false, issue });
  if (scalar.issue) return invalid();
  const value = scalar.value;
  if (value === null || value === undefined || typeof value === "string" && !value.trim()) return { value: null, blank: true, issue: null };
  if (typeof value === "number") return Number.isFinite(value) ? { value, blank: false, issue: null } : invalid();
  if (typeof value !== "string") return invalid();
  const text = value.trim();
  let normalized: string;
  // Indonesian grouped decimals, ungrouped comma decimals, or plain decimal numbers.
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) normalized = text.replaceAll(".", "").replace(",", ".");
  else if (/^[+-]?\d+(?:,\d+)?$/.test(text)) normalized = text.replace(",", ".");
  else if (/^[+-]?\d+\.\d+$/.test(text)) normalized = text;
  else return invalid();
  const number = Number(normalized);
  return Number.isFinite(number) ? { value: number, blank: false, issue: null } : invalid();
}

/** Strict calendar parsing, independent of the current date or machine timezone. */
export function parseAssetDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && Math.floor(value) !== 60 && value <= 2958465) {
    const date = new Date(Date.UTC(1899, 11, 31) + (Math.floor(value) - (value > 60 ? 1 : 0)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!iso && !local) return null;
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(local![3]), Number(local![2]), Number(local![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
