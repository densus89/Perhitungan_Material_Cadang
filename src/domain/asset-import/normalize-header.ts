/** Shared by detection and provenance; no spreadsheet or platform dependency. */
export function normalizeHeader(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    : "";
}

export function columnLetter(index: number): string {
  let letter = "";
  while (index > 0) {
    index--;
    letter = String.fromCharCode(65 + index % 26) + letter;
    index = Math.floor(index / 26);
  }
  return letter;
}
