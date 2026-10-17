import { describe, expect, it } from "vitest";
import { parseLocalizedNumber } from "../../src/domain/asset-import/parse-value";
import { canonicalizeAssetRow } from "../../src/domain/asset-import/canonicalize-row";
import { detectWorkbookLayout } from "../../src/domain/asset-import/detect-layout";
import { assetRow, gridFixture } from "../fixtures/asset-workbooks";

describe("safe localized numbers", () => {
  it.each([[12, 12], [1.25, 1.25], ["1.234.567,89", 1234567.89], ["1.234", 1234], ["12,5", 12.5], ["12.50", 12.5], [0, 0], ["0", 0], ["-5", -5]])("parses %s preserving numeric meaning", (raw, value) => {
    expect(parseLocalizedNumber(raw)).toMatchObject({ value, issue: null });
  });
  it.each([null, undefined, "", "  "])("keeps blank %s distinct from zero", (raw) => {
    expect(parseLocalizedNumber(raw)).toMatchObject({ value: null, blank: true, issue: null });
  });
  it.each(["#N/A", "#VALUE!", Infinity, NaN, "1.2.3", "12kg", true, { error: "#N/A" }])("rejects invalid number %s", (raw) => {
    expect(parseLocalizedNumber(raw)).toMatchObject({ value: null, blank: false, issue: expect.any(String) });
  });
});

describe("canonical asset rows", () => {
  const mapping = detectWorkbookLayout(gridFixture()).selected!;
  const provenance = { sheetName: "DATA_ASET", rowNumber: 7 };
  it("preserves zero, identifiers and source addresses", () => {
    const row = canonicalizeAssetRow(assetRow, mapping, provenance);
    expect(row.candidate).toBe(true);
    expect(row.asset).toMatchObject({ tid: "0001", noAset: "000002", nilaiBukuSap: 0, usiaAsetTahun: 10, kondisiAset: "P2" });
    expect(row.sources.nilaiBukuSap).toMatchObject({ sheetName: "DATA_ASET", rowNumber: 7, columnIndex: 13, address: "M7" });
  });
  it("uses operation date before age while retaining supplied age provenance", () => {
    const values = [...assetRow];
    values[10] = new Date("2010-02-03T00:00:00Z");
    const row = canonicalizeAssetRow(values, mapping, provenance);
    expect(row.asset.tanggalOperasi).toBe("2010-02-03");
    expect(row.asset.usiaAsetTahun).toBeNull();
    expect(row.ageSource).toBe("OPERATION_DATE");
    expect(row.sources.usiaAsetTahun?.rawValue).toBe(10);
  });
  it("accepts valid cached formula dates while retaining field-specific validation", () => {
    const values = [...assetRow];
    values[10] = { formula: "DATE(2010,2,3)", result: new Date("2010-02-03T00:00:00Z") };
    const row = canonicalizeAssetRow(values, mapping, provenance);
    expect(row.asset.tanggalOperasi).toBe("2010-02-03");
    expect(row.asset.usiaAsetTahun).toBeNull();
    expect(row.sources.tanggalOperasi).toMatchObject({ formula: "DATE(2010,2,3)", address: "K7" });
    expect(row.issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ field: "tanggalOperasi" })]));
    values[10] = { formula: "DATE(0,0,0)", result: new Date(NaN) };
    expect(canonicalizeAssetRow(values, mapping, provenance).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_FORMULA_RESULT", field: "tanggalOperasi" })]));
    values[12] = { formula: "DATE(2010,2,3)", result: new Date("2010-02-03T00:00:00Z") };
    expect(canonicalizeAssetRow(values, mapping, provenance).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_FORMULA_RESULT", field: "nilaiBukuSap" })]));
  });
  it.each([[7, 0, "NON_POSITIVE_QUANTITY"], [7, -1, "NON_POSITIVE_QUANTITY"], [9, "P5", "INVALID_CONDITION"], [11, -2, "NEGATIVE_NUMBER"]])("reports field errors at source column %s", (index, value, code) => {
    const values = [...assetRow];
    values[index as number] = value;
    expect(canonicalizeAssetRow(values, mapping, provenance).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code, address: expect.any(String) })]));
  });
  it("retains formula provenance and validates cached results without evaluating", () => {
    const values: unknown[] = [...assetRow];
    values[12] = { formula: "1+1", result: 0 };
    const valid = canonicalizeAssetRow(values, mapping, provenance);
    expect(valid.asset.nilaiBukuSap).toBe(0);
    expect(valid.sources.nilaiBukuSap?.formula).toBe("1+1");
    for (const result of [undefined, { error: "#VALUE!" }, "invalid", Infinity]) {
      values[12] = { formula: "EXTERNAL()", result };
      const invalid = canonicalizeAssetRow(values, mapping, provenance);
      expect(invalid.asset.nilaiBukuSap).toBeNull();
      expect(invalid.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_FORMULA_RESULT", address: "M7" })]));
    }
  });
  it("rejects rows without asset identity/equipment and marked examples and subtotals", () => {
    for (const indexes of [[0, 1, 2, 3, 4], [5, 6]]) {
      const values: unknown[] = [...assetRow];
      indexes.forEach((index) => { values[index] = null; });
      expect(canonicalizeAssetRow(values, mapping, provenance).candidate).toBe(false);
    }
    for (const label of ["CONTOH", "SUBTOTAL", "TOTAL"]) {
      expect(canonicalizeAssetRow([label, ...assetRow.slice(1)], mapping, provenance).candidate).toBe(false);
    }
  });
  it.each([[7, "jumlah"], [8, "satuan"]] as const)("retains a clear asset with missing source column %s as a blocking %s error", (index, field) => {
    const values: unknown[] = [...assetRow]; values[index] = null;
    const row = canonicalizeAssetRow(values, mapping, provenance);
    expect(row.candidate).toBe(true);
    expect(row.rejectionReason).toBeNull();
    expect(row.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_REQUIRED_FIELD", field })]));
  });
  it("accepts P0 through P4 without deriving age from condition", () => {
    for (const condition of ["P0", "P1", "P2", "P3", "P4"]) {
      const values: unknown[] = [...assetRow]; values[9] = condition; values[11] = null;
      expect(canonicalizeAssetRow(values, mapping, provenance).asset).toMatchObject({ kondisiAset: condition, usiaAsetTahun: null });
    }
  });

  it("retains candidate formula errors even when quantity cached results are absent", () => {
    const values = [...assetRow]; values[7] = { formula: "1+1" };
    const row = canonicalizeAssetRow(values, mapping, provenance);
    expect(row.candidate).toBe(true);
    expect(row.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_FORMULA_RESULT", field: "jumlah" })]));
  });

  it("does not mistake notes about examples or totals for row markers", () => {
    const source = gridFixture();
    source.sheets[0].rows[0].push("KETERANGAN");
    const withNotes = detectWorkbookLayout(source).selected!;
    expect(canonicalizeAssetRow([...assetRow, "Contoh pemeriksaan tahun lalu"], withNotes, provenance).candidate).toBe(true);
    expect(canonicalizeAssetRow([...assetRow, "Total pekerjaan selesai"], withNotes, provenance).candidate).toBe(true);
  });

  it.each([["CONTOH", "EXAMPLE"], ["SUBTOTAL", "SUBTOTAL"], ["TOTAL", "SUBTOTAL"]])("rejects explicit %s labels when quantity precedes identity columns", (label, reason) => {
    const source = gridFixture();
    const order = [7, 8, 9, 12, 0, 1, 2, 3, 4, 5, 6, 10, 11];
    source.sheets[0].rows[0] = order.map((index) => source.sheets[0].rows[0][index]);
    const reorderedMapping = detectWorkbookLayout(source).selected!;
    const values = [...assetRow]; values[0] = label;
    const row = canonicalizeAssetRow(order.map((index) => values[index]), reorderedMapping, provenance);
    expect(row.candidate).toBe(false);
    expect(row.rejectionReason).toBe(reason);
  });

  it("recognizes explicit markers in location labels after a populated unit label", () => {
    const values = [...assetRow]; values[2] = "SUBTOTAL";
    expect(canonicalizeAssetRow(values, mapping, provenance).rejectionReason).toBe("SUBTOTAL");
  });

  it("does not classify unit or specification values as example/subtotal row markers", () => {
    const values = [...assetRow]; values[6] = "Total installed 150/20 kV"; values[8] = "EXAMPLE";
    expect(canonicalizeAssetRow(values, mapping, provenance).candidate).toBe(true);
  });

  it("reports blank required fields without replacing them with guessed data", () => {
    const values = [...assetRow]; values[0] = null; values[9] = null;
    const row = canonicalizeAssetRow(values, mapping, provenance);
    expect(row.asset).toMatchObject({ unitInduk: null, kondisiAset: null });
    expect(row.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_REQUIRED_FIELD", field: "unitInduk", address: "A7" }),
      expect.objectContaining({ code: "MISSING_REQUIRED_FIELD", field: "kondisiAset", address: "J7" }),
    ]));
  });

  it.each([["03/02/2010", "2010-02-03"], [40212, "2010-02-03"], ["31/02/2010", null], ["2010-02-31", null], [60, null], [60.01, null], [60.5, null], [60.9999, null]])("validates date %s and falls back to supplied age only when invalid", (raw, date) => {
    const values = [...assetRow]; values[10] = raw;
    const row = canonicalizeAssetRow(values, mapping, provenance);
    expect(row.asset.tanggalOperasi).toBe(date);
    expect(row.asset.usiaAsetTahun).toBe(date ? null : 10);
    if (!date) expect(row.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_DATE" })]));
  });

  it("treats whitespace spacers as blank and reads display text without following hyperlinks", () => {
    expect(canonicalizeAssetRow(["  ", null], mapping, provenance).rejectionReason).toBe("BLANK");
    const values = [...assetRow]; values[2] = { text: "GI DEMO", hyperlink: "https://invalid.example/never-fetch" }; values[5] = { richText: [{ text: "TRA" }, { text: "FO" }] };
    expect(canonicalizeAssetRow(values, mapping, provenance).asset).toMatchObject({ namaGi: "GI DEMO", namaPeralatan: "TRAFO" });
  });
});
