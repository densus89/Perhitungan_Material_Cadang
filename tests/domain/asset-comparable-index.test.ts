import { expect, it } from "vitest";
import { prepareComparablePool, imputeAssetAge, rankComparableCandidates } from "../../src/domain/asset-import/comparables";
import { valuationAsset } from "../fixtures/asset-valuation";

it("narrows a reusable pool to exact technical peers while retaining global conflicting-ID denial", () => {
  const target = { ...valuationAsset({ usiaAsetTahun: null }), id: "target" };
  const donors = [
    { ...valuationAsset({ usiaAsetTahun: 10, hargaPengadaanSaatIni: 100, tanggalReferensiHarga: "2026-01-01" }), id: "valid" },
    { ...valuationAsset({ usiaAsetTahun: 20, hargaPengadaanSaatIni: 200 }), id: "conflict" },
    { ...valuationAsset({ spesifikasiMara: "unrelated", usiaAsetTahun: 30 }), id: "conflict" },
    ...Array.from({ length: 10000 }, (_, i) => ({ ...valuationAsset({ spesifikasiMara: `other ${i}` }), id: `other-${i}` })),
  ];
  const preparedPool = prepareComparablePool(donors);
  expect(preparedPool.forTarget(target)).toHaveLength(1);
  expect(imputeAssetAge(target, donors, { asOf: "2026-10-16", preparedPool })).toMatchObject({ years: 10, donorIds: ["valid"], rejectedDonors: [{ id: "conflict", code: "DONOR_ID_CONFLICT" }], warnings: ["DONOR_ID_CONFLICT", "AGE_IMPUTED", "SINGLE_DONOR"] });
  expect(rankComparableCandidates(target, donors, { asOf: "2026-10-16", preparedPool })).toMatchObject({ median: 100, selectedDonorIds: ["valid"], rejectedDonors: [{ id: "conflict", code: "DONOR_ID_CONFLICT" }] });
});
it("includes approved RFQ peers but still rejects explicitly incompatible voltages", () => {
  const group = { id: "approved", approvedBy: "RST", approvedAt: "2026-01-01" };
  const target = { ...valuationAsset({ spesifikasiMara: "TRAFO 150/20 kV A", usiaAsetTahun: null }), id: "target", approvedRfqGroup: group };
  const donors = [
    { ...valuationAsset({ spesifikasiMara: "TRAFO 150/20 kV B", usiaAsetTahun: 12, hargaPengadaanSaatIni: 120, tanggalReferensiHarga: "2026-01-01" }), id: "rfq", approvedRfqGroup: group },
    { ...valuationAsset({ spesifikasiMara: "TRAFO 150/22/10 kV B", usiaAsetTahun: 30, hargaPengadaanSaatIni: 999, tanggalReferensiHarga: "2026-01-01" }), id: "wrong-voltage", approvedRfqGroup: group },
  ];
  const options = { asOf: "2026-10-16", preparedPool: prepareComparablePool(donors) };
  expect(imputeAssetAge(target, donors, options)).toMatchObject({ years: 12, donorIds: ["rfq"] });
  expect(rankComparableCandidates(target, donors, options)).toMatchObject({ median: 120, selectedDonorIds: ["rfq"] });
  expect(rankComparableCandidates(target, donors, options)).toEqual(rankComparableCandidates(target, donors, { asOf: "2026-10-16" }));
});
