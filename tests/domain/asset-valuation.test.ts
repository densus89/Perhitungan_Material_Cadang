import { describe, expect, it } from "vitest";
import { calculateDepreciatedBookValue, resolveAssetValuation } from "../../src/domain/asset-import/valuation";
import { valuationAsset } from "../fixtures/asset-valuation";
import { PERDIR_0299_RULES } from "../../src/reference/useful-life-perdir-0299";

const context = { asOf: "2026-10-15" };
describe("audited ABC book values", () => {
  it("uses SAP zero before adjusted or new acquisition price", () => {
    expect(resolveAssetValuation(valuationAsset({ nilaiBukuSap: 0, nilaiAbcInput: 400, hargaPengadaanSaatIni: 1000 }), context)).toMatchObject({ nilaiABC: 0, valueSource: "SAP_BOOK_VALUE", hargaPengadaanSaatIni: 1000, calculationMethod: "DIRECT_BOOK_VALUE" });
    expect(resolveAssetValuation(valuationAsset({ nilaiAbcInput: 400, hargaPengadaanSaatIni: 1000 }), context)).toMatchObject({ nilaiABC: 400, valueSource: "PROVIDED_ADJUSTED_VALUE" });
  });
  it("depreciates target current price and retains rule, inputs, timestamp and age evidence", () => {
    expect(resolveAssetValuation(valuationAsset({ hargaPengadaanSaatIni: 1000, tanggalReferensiHarga: "2026-01-01" }), context)).toMatchObject({ nilaiABC: 750, valueSource: "SYSTEM_DEPRECIATION", calculationMethod: "STRAIGHT_LINE", ageStatus: "PROVIDED_AGE", evidence: { referencePrice: 1000, ageYears: 10, usefulLifeYears: 40, rule: { id: "trans-transformer" }, calculatedAt: "2026-10-15" } });
  });
  it("applies target age to replacement price irrespective of donor age", () => {
    const donor = { ...valuationAsset({ usiaAsetTahun: 39, hargaPengadaanSaatIni: 1000, tanggalReferensiHarga: "2026-01-01" }), id: "donor" };
    expect(resolveAssetValuation({ ...valuationAsset(), id: "target" }, { ...context, candidates: [donor] })).toMatchObject({ nilaiABC: 750, valueSource: "ESTIMATED_SAME_GI", manualApprovalRequired: true, evidence: { comparables: { selectedDonorIds: ["donor"] } } });
  });
  it("requires compatible age evidence and manual approval for age imputation", () => {
    const asset = valuationAsset({ usiaAsetTahun: null, hargaPengadaanSaatIni: 1000 });
    expect(resolveAssetValuation(asset, context).nilaiABC).toBeNull();
    expect(resolveAssetValuation(asset, { ...context, cohort: [{ ...valuationAsset({ usiaAsetTahun: 20 }), id: "cohort" }] })).toMatchObject({ nilaiABC: 500, ageStatus: "AGE_IMPUTED", manualApprovalRequired: true, evidence: { age: { donorIds: ["cohort"] } } });
  });
  it("honors operation date before supplied age and rejects future dates", () => {
    expect(resolveAssetValuation(valuationAsset({ tanggalOperasi: "2016-10-15", usiaAsetTahun: 1, hargaPengadaanSaatIni: 1000 }), context)).toMatchObject({ nilaiABC: 750, ageStatus: "OPERATION_DATE" });
    expect(resolveAssetValuation(valuationAsset({ tanggalOperasi: "2027-01-01", hargaPengadaanSaatIni: 1000 }), context).nilaiABC).toBeNull();
  });
  it("floors full depreciation and rejects invalid numeric formula inputs", () => {
    expect(calculateDepreciatedBookValue(1000, 40, 40)).toBe(0);
    expect(calculateDepreciatedBookValue(1000, 80, 40)).toBe(0);
    for (const input of [[-1, 1, 40], [1, -1, 40], [1, 1, 0], [Infinity, 1, 40]]) expect(() => calculateDepreciatedBookValue(...input as [number, number, number])).toThrow();
    expect(resolveAssetValuation(valuationAsset({ hargaPengadaanSaatIni: 1000, usiaAsetTahun: 40 }), context).warnings).toContain("FULLY_DEPRECIATED");
  });
  it("requires manual review of stale reference dates", () => {
    const result = resolveAssetValuation(valuationAsset({ hargaPengadaanSaatIni: 1000, tanggalReferensiHarga: "2010-01-01" }), context);
    expect(result.warnings).toContain("STALE_PRICE");
    expect(result.manualApprovalRequired).toBe(true);
  });
  it("retains imputed-age approval and evidence even with a direct SAP value", () => {
    const result = resolveAssetValuation(valuationAsset({ nilaiBukuSap: 0, usiaAsetTahun: null }), { ...context, cohort: [{ ...valuationAsset({ usiaAsetTahun: 20 }), id: "age-donor" }] });
    expect(result).toMatchObject({ nilaiABC: 0, ageStatus: "AGE_IMPUTED", manualApprovalRequired: true });
    expect(result.warnings).toContain("AGE_IMPUTED");
  });
  it("rejects impossible price dates and invalid valuation dates", () => {
    expect(resolveAssetValuation(valuationAsset({ hargaPengadaanSaatIni: 1000, tanggalReferensiHarga: "2026-02-31" }), context).nilaiABC).toBeNull();
    expect(resolveAssetValuation(valuationAsset({ hargaPengadaanSaatIni: 1000 }), { asOf: "2026-99-99" }).nilaiABC).toBeNull();
  });
  it("does not discard parser errors while resolving a usable lower-priority source", () => {
    const row = { asset: valuationAsset({ nilaiAbcInput: 100 }), provenance: { sheetName: "DATA_ASET", rowNumber: 2 }, sources: {}, issues: [{ code: "INVALID_FORMULA_RESULT", severity: "ERROR" as const, field: "nilaiBukuSap" as const, message: "invalid source cache" }], ageSource: "PROVIDED_AGE" as const, candidate: true, rejectionReason: null };
    expect(resolveAssetValuation(row, context)).toMatchObject({ nilaiABC: 100, valueSource: "PROVIDED_ADJUSTED_VALUE" });
  });
  it("records the effective custom rule version used in its calculation", () => {
    const rule = { ...PERDIR_0299_RULES[0], years: 20, ruleVersion: "synthetic-approved-v2" };
    expect(resolveAssetValuation(valuationAsset({ hargaPengadaanSaatIni: 1000 }), { ...context, rules: [rule] })).toMatchObject({ nilaiABC: 500, evidence: { ruleVersion: "synthetic-approved-v2" } });
  });
});
