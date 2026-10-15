import { CANONICAL_ASSET_FIELDS } from "../../src/domain/asset-import/fields";
import type { CanonicalAssetInput, CanonicalizedAssetRow } from "../../src/domain/asset-import/types";

export function valuationAsset(overrides: Partial<CanonicalAssetInput> = {}) {
  return {
    ...Object.fromEntries(CANONICAL_ASSET_FIELDS.map((field) => [field.key, null])) as unknown as CanonicalAssetInput,
    unitInduk: "UNIT A", upt: "UPT A", namaGi: "GI A", namaPeralatan: "TRAFO", spesifikasiMara: "150/20 kV 60 MVA",
    jumlah: 1, satuan: "UNIT", kondisiAset: "P2" as const, usiaAsetTahun: 10,
    kodeClassAsset: "10600", kodeJenis: "07", kodeSubjenis: "102", ...overrides,
  };
}

export function valuationRow(overrides: Partial<CanonicalAssetInput> = {}): CanonicalizedAssetRow {
  return { asset: valuationAsset(overrides), provenance: { sheetName: "DATA_ASET", rowNumber: 2 }, sources: {}, issues: [], ageSource: "PROVIDED_AGE", candidate: true, rejectionReason: null };
}
