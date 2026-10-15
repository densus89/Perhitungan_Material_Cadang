import { describe, expect, it } from "vitest";
import { imputeAssetAge, rankComparableCandidates, type ComparableAsset } from "../../src/domain/asset-import/comparables";
import { valuationAsset } from "../fixtures/asset-valuation";

const target = { ...valuationAsset(), id: "target" };
function donor(id: string, extra: Partial<ComparableAsset> = {}): ComparableAsset {
  return { ...valuationAsset({ hargaPengadaanSaatIni: 1000, tanggalReferensiHarga: "2026-01-01" }), id, ...extra };
}
describe("technical and location comparable gates", () => {
  it("rejects voltage variants, equipment families, units and self donors", () => {
    expect(rankComparableCandidates(target, [donor("a", { spesifikasiMara: "150/22/10 kV 60 MVA" }), donor("b", { namaPeralatan: "CT" }), donor("c", { satuan: "M" }), donor("target")]).status).toBe("UNRESOLVED");
    expect(rankComparableCandidates(target, [donor("a", { spesifikasiMara: " 150/20 KV  60 MVA " })]).median).toBe(1000);
  });
  it("allows only documented approved RFQ groups, retaining evidence", () => {
    const group = { id: "rfq-a", approvedBy: "RST", approvedAt: "2026-01-01" };
    const candidate = donor("a", { spesifikasiMara: "TRAFO 150/20 kV 60 MVA", approvedRfqGroup: group });
    expect(rankComparableCandidates({ ...target, approvedRfqGroup: group }, [candidate]).donors[0].compatibility).toBe("APPROVED_RFQ");
    expect(rankComparableCandidates(target, [candidate]).status).toBe("UNRESOLVED");
    expect(rankComparableCandidates({ ...target, approvedRfqGroup: group }, [{ ...candidate, spesifikasiMara: "150/22/10 kV 60 MVA" }]).status).toBe("UNRESOLVED");
  });
  it.each([
    [{}, "SAME_GI"], [{ namaGi: "GI B" }, "SAME_UPT"], [{ namaGi: "GI B", upt: "UPT B" }, "SAME_UNIT"],
    [{ namaGi: "GI B", upt: "UPT B", unitInduk: "UNIT B" }, "NATIONAL"],
  ] as const)("uses location tier %s", (location, tier) => {
    expect(rankComparableCandidates(target, [donor("a", location)]).tier).toBe(tier);
  });
  it("takes local tier before national, then newest price and median ties", () => {
    const result = rankComparableCandidates(target, [donor("old", { tanggalReferensiHarga: "2025-01-01", hargaPengadaanSaatIni: 9999 }), donor("b", { hargaPengadaanSaatIni: 300 }), donor("a", { hargaPengadaanSaatIni: 100 }), donor("national", { unitInduk: "B", upt: "B", namaGi: "B", tanggalReferensiHarga: "2026-10-01" })]);
    expect(result).toMatchObject({ tier: "SAME_GI", median: 200, candidateCount: 2, min: 100, max: 300, dispersion: 1, selectedDonorIds: ["a", "b"] });
    expect(result.warnings).toContain("HIGH_DISPERSION");
  });
  it("ranks nearest coordinates before national and retains distances", () => {
    const base = { namaGi: "B", upt: "B", unitInduk: "B" };
    const result = rankComparableCandidates({ ...target, coordinates: { latitude: 0, longitude: 0 } }, [donor("far", { ...base, coordinates: { latitude: 0, longitude: 2 } }), donor("near", { ...base, coordinates: { latitude: 0, longitude: 1 } }), donor("unknown", base)]);
    expect(result).toMatchObject({ tier: "NEAREST_LOCATION", selectedDonorIds: ["near"] });
    expect(result.donors[0].distanceKm).toBeCloseTo(111.195, 2);
    expect(result.warnings).toContain("SINGLE_DONOR");
  });
  it("rejects unsafe gross-up but reconstructs stable donor book values", () => {
    expect(rankComparableCandidates(target, [donor("old", { hargaPengadaanSaatIni: null, nilaiBukuSap: 10, usiaAsetTahun: 39 })]).status).toBe("UNRESOLVED");
    expect(rankComparableCandidates(target, [donor("missing", { hargaPengadaanSaatIni: null, nilaiBukuSap: 500, usiaAsetTahun: null })]).status).toBe("UNRESOLVED");
    expect(rankComparableCandidates(target, [donor("good", { hargaPengadaanSaatIni: null, nilaiBukuSap: 750, usiaAsetTahun: 10 })]).median).toBe(1000);
  });
  it("prioritizes UPT then unit before nearby or national newer prices", () => {
    const sameUpt = donor("upt", { namaGi: "GI B", hargaPengadaanSaatIni: 200 });
    const sameUnit = donor("unit", { namaGi: "GI B", upt: "UPT B", hargaPengadaanSaatIni: 300 });
    const national = donor("national", { namaGi: "GI B", upt: "UPT B", unitInduk: "UNIT B", hargaPengadaanSaatIni: 400, tanggalReferensiHarga: "2026-10-01", coordinates: { latitude: 0, longitude: 0.1 } });
    const located = { ...target, coordinates: { latitude: 0, longitude: 0 } };
    expect(rankComparableCandidates(located, [national, sameUnit, sameUpt])).toMatchObject({ tier: "SAME_UPT", median: 200 });
    expect(rankComparableCandidates(located, [national, sameUnit])).toMatchObject({ tier: "SAME_UNIT", median: 300 });
  });
});
describe("compatible cohort median ages", () => {
  it.each(["P0", "P1", "P2", "P3", "P4"] as const)("ignores target condition %s", (kondisiAset) => {
    expect(imputeAssetAge({ ...target, usiaAsetTahun: null, kondisiAset }, [donor("a", { usiaAsetTahun: 2 }), donor("b", { usiaAsetTahun: 10 }), donor("wrong", { usiaAsetTahun: 100, spesifikasiMara: "150/22/10 kV" })])).toMatchObject({ years: 6, status: "AGE_IMPUTED", tier: "SAME_GI", donorIds: ["a", "b"], manualApprovalRequired: true });
  });
  it.each([[{ namaGi: "B" }, "SAME_UPT"], [{ namaGi: "B", upt: "B" }, "SAME_UNIT"], [{ namaGi: "B", upt: "B", unitInduk: "B" }, "NATIONAL"]] as const)("falls through compatible cohorts %s", (location, tier) => {
    expect(imputeAssetAge({ ...target, usiaAsetTahun: null }, [donor("a", { ...location, usiaAsetTahun: 12 })])).toMatchObject({ years: 12, tier });
  });
  it("retains valid zero age and leaves empty or incompatible cohorts unresolved", () => {
    expect(imputeAssetAge({ ...target, usiaAsetTahun: 0 }, []).years).toBe(0);
    expect(imputeAssetAge({ ...target, usiaAsetTahun: null }, []).years).toBeNull();
    expect(imputeAssetAge({ ...target, usiaAsetTahun: null }, [donor("wrong", { spesifikasiMara: "150/22/10 kV", usiaAsetTahun: 7 })]).years).toBeNull();
    expect(imputeAssetAge({ ...target, usiaAsetTahun: null }, [donor("local", { usiaAsetTahun: 5 }), donor("upt", { namaGi: "OTHER", usiaAsetTahun: 100 })]).years).toBe(5);
  });
});
