import { describe, expect, it } from "vitest";
import { resolveAssetValuation } from "../../src/domain/asset-import/valuation";
import { validateAssetRow } from "../../src/domain/asset-import/validate-row";
import { valuationRow } from "../fixtures/asset-valuation";

describe("blocking and advisory row issues", () => {
  it.each(["unitInduk", "upt", "namaPeralatan", "spesifikasiMara", "jumlah", "satuan", "kondisiAset"] as const)("blocks missing %s", (field) => {
    const row = valuationRow({ [field]: null, nilaiBukuSap: 0 });
    expect(validateAssetRow(row, resolveAssetValuation(row, { asOf: "2026-10-15" })).errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  });
  it("blocks invalid condition, negative values, parser errors and unresolved values", () => {
    const row = valuationRow({ jumlah: -1, nilaiBukuSap: -2 });
    Object.assign(row.asset, { kondisiAset: "P5" });
    row.issues.push({ code: "INVALID_FORMULA_RESULT", severity: "ERROR", message: "Bad cache", field: "nilaiAbcInput", address: "M2" });
    const result = validateAssetRow(row, resolveAssetValuation(row, { asOf: "2026-10-15" }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(["INVALID_CONDITION", "NON_POSITIVE_QUANTITY", "INVALID_NUMBER", "INVALID_FORMULA_RESULT", "UNRESOLVED_VALUE"]));
  });
  it("blocks ambiguous life and conflicting duplicate asset identities", () => {
    const row = valuationRow({ nilaiBukuSap: 0, noAset: "001" });
    const valuation = resolveAssetValuation(row, { asOf: "2026-10-15" });
    const result = validateAssetRow(row, { ...valuation, usefulLife: { ...valuation.usefulLife, status: "AMBIGUOUS", years: null } }, { existingAssets: [valuationRow({ noAset: "001", spesifikasiMara: "150/22/10 kV" })] });
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(["AMBIGUOUS_USEFUL_LIFE", "DUPLICATE_IDENTITY_CONFLICT"]));
  });
  it("warns for numeric text, missing IDs, estimates and fully depreciated zero", () => {
    const row = valuationRow({ hargaPengadaanSaatIni: 1000, usiaAsetTahun: 40 });
    row.sources.jumlah = { ...row.provenance, columnIndex: 8, address: "H2", rawValue: "1" };
    const result = validateAssetRow(row, resolveAssetValuation(row, { asOf: "2026-10-15" }));
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining(["NUMERIC_TEXT", "MISSING_IDENTIFIERS", "ESTIMATED_VALUE", "FULLY_DEPRECIATED"]));
  });
  it("exposes all donor and age warnings without promoting zero to an error", () => {
    const row = valuationRow({ nilaiBukuSap: 0 });
    const valuation = resolveAssetValuation(row, { asOf: "2026-10-15" });
    const result = validateAssetRow(row, { ...valuation, warnings: ["AGE_IMPUTED", "SINGLE_DONOR", "STALE_PRICE", "HIGH_DISPERSION"] });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining(["AGE_IMPUTED", "SINGLE_DONOR", "STALE_PRICE", "HIGH_DISPERSION"]));
  });
});
