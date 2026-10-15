import { describe, expect, it } from "vitest";
import { detectWorkbookLayout } from "../../src/domain/asset-import/detect-layout";
import { normalizeHeader } from "../../src/domain/asset-import/normalize-header";
import { assetRow, gridFixture, headers } from "../fixtures/asset-workbooks";

describe("adaptive asset layout detection", () => {
  it("normalizes case, punctuation, underscores and multiline whitespace", () => {
    expect(normalizeHeader("  Nilai_buku\nSAP. ")).toBe("NILAI BUKU SAP");
    expect(normalizeHeader(null)).toBe("");
  });

  it.each([["DATA_ASET", 1], ["3400", 5], ["Renamed data", 50]])("finds %s headers on row %i across all sheets", (name, row) => {
    const source = gridFixture(name, row);
    source.sheets.unshift({ name: "DATA_ASET", rows: [["Helper", "Harga"], ["X", 2]] });
    const layout = detectWorkbookLayout(source);
    expect(layout.selected).toMatchObject({ sheetName: name, headerRow: row });
    expect(layout.selected?.confidence).toBeGreaterThan(0.7);
    expect(layout.requiresConfirmation).toBe(false);
  });

  it("preserves duplicate MARA indexes and proposes numeric asset IDs separately", () => {
    const labels = [...headers];
    labels[4] = "MARA";
    labels[6] = "MARA";
    const values = [...assetRow];
    [values[4], values[6]] = [values[6], values[4]];
    const layout = detectWorkbookLayout({ sheets: [{ name: "3400", rows: [labels, values] }] });
    expect(layout.selected?.columns.filter((column) => column.header === "MARA").map((column) => [column.columnIndex, column.field])).toEqual([[5, "spesifikasiMara"], [7, "noAset"]]);
    expect(layout.requiresConfirmation).toBe(true);
  });

  it("requires confirmation for ambiguous required fields and missing fields", () => {
    const duplicate = [...headers, "JUMLAH"];
    const layout = detectWorkbookLayout({ sheets: [{ name: "DATA_ASET", rows: [duplicate, [...assetRow, 2]] }] });
    expect(layout.requiresConfirmation).toBe(true);
    expect(layout.selected?.ambiguousFields).toContain("jumlah");
    expect(detectWorkbookLayout({ sheets: [{ name: "DATA_ASET", rows: [["UNIT_INDUK", "UPT"]] }] }).selected).toBeNull();
  });

  it("does not scan beyond the first fifty rows and asks about tied sheets", () => {
    expect(detectWorkbookLayout(gridFixture("Late", 51)).selected).toBeNull();
    const a = gridFixture("A").sheets[0];
    expect(detectWorkbookLayout({ sheets: [a, { ...a, name: "B" }] }).requiresConfirmation).toBe(true);
  });
});
