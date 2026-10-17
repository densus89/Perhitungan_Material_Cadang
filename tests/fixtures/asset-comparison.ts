import type { ComparisonRow, ComparisonValue } from "../../src/server/import/compare-asset-versions";

export function syntheticComparison(rows: number) {
  const before: ComparisonRow[] = [], after: ComparisonRow[] = [], beforeValues: ComparisonValue[] = [], afterValues: ComparisonValue[] = [];
  for (let index = 0; index < rows; index++) {
    const common = { unit_induk: "UNIT SYNTHETIC", upt: "UPT SYNTHETIC", nama_gi: "GI SYNTHETIC", bay_penghantar: null, tid: `T-${index}`, no_aset: `A-${String(index).padStart(6, "0")}`, nama_peralatan: "TRAFO", spesifikasi_mara: "150/20 kV 60 MVA", jumlah: 1, satuan: "UNIT", kondisi_aset: "P2" as const, tanggal_operasi: null, usia_aset_tahun: 10, kode_class_asset: null, kode_jenis: null, kode_subjenis: null, nilai_buku_sap: 100, harga_pengadaan_saat_ini: 500, tanggal_referensi_harga: null, nilai_abc_input: null, kode_material: null, keterangan: null };
    before.push({ ...common, id: `before-${index}` });
    after.push({ ...common, id: `after-${index}`, no_aset: index === 0 ? "NEW-SYNTHETIC" : common.no_aset, nilai_buku_sap: index % 10 === 1 ? 0 : 100 });
    beforeValues.push({ asset_row_id: `before-${index}`, nilai_abc: 100, value_source: "SAP_BOOK_VALUE" });
    afterValues.push({ asset_row_id: `after-${index}`, nilai_abc: index % 10 === 1 ? 0 : 100, value_source: index % 10 === 2 ? "PROVIDED_ADJUSTED_VALUE" : "SAP_BOOK_VALUE" });
  }
  return { before, after, beforeValues, afterValues };
}
