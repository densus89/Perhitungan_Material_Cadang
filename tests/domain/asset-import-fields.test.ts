import { describe, expect, it } from "vitest";
import { CANONICAL_ASSET_FIELDS } from "../../src/domain/asset-import/fields";

describe("canonical asset import fields", () => {
  it("publishes the complete ordered editable input contract", () => {
    expect(CANONICAL_ASSET_FIELDS.map((field) => field.header)).toEqual([
      "UNIT_INDUK", "UPT", "NAMA_GI", "BAY_PENGHANTAR", "TID", "NO_ASET",
      "NAMA_PERALATAN", "SPESIFIKASI_MARA", "JUMLAH", "SATUAN", "KONDISI_ASET",
      "TANGGAL_OPERASI", "USIA_ASET_TAHUN", "KODE_CLASS_ASSET", "KODE_JENIS",
      "KODE_SUBJENIS", "NILAI_BUKU_SAP", "HARGA_PENGADAAN_SAAT_INI",
      "TANGGAL_REFERENSI_HARGA", "NILAI_BUKU_PENYESUAIAN", "KODE_MATERIAL", "KETERANGAN",
    ]);
    expect(new Set(CANONICAL_ASSET_FIELDS.map((field) => field.key)).size).toBe(22);
  });

  it("distinguishes unconditional, conditional, and optional inputs", () => {
    expect(CANONICAL_ASSET_FIELDS.filter((field) => field.requirement === "REQUIRED").map((field) => field.header))
      .toEqual(["UNIT_INDUK", "UPT", "NAMA_PERALATAN", "SPESIFIKASI_MARA", "JUMLAH", "SATUAN", "KONDISI_ASET"]);
    expect(CANONICAL_ASSET_FIELDS.filter((field) => field.requirement === "CONDITIONAL").map((field) => field.header))
      .toEqual(["NAMA_GI", "BAY_PENGHANTAR", "USIA_ASET_TAHUN", "KODE_CLASS_ASSET", "KODE_JENIS", "KODE_SUBJENIS", "NILAI_BUKU_SAP", "HARGA_PENGADAAN_SAAT_INI", "TANGGAL_REFERENSI_HARGA"]);
    expect(CANONICAL_ASSET_FIELDS.filter((field) => field.requirement === "OPTIONAL").map((field) => field.header))
      .toEqual(["TID", "NO_ASET", "TANGGAL_OPERASI", "NILAI_BUKU_PENYESUAIAN", "KODE_MATERIAL", "KETERANGAN"]);
  });

  it.each([
    ["NAMA_GI", "NAMAGI"], ["SPESIFIKASI_MARA", "MARA"],
    ["NO_ASET", "NO ASSET"], ["NILAI_BUKU_SAP", "nilai_buku_SAP"],
    ["NAMA_PERALATAN", "GROUP_NAME"],
  ])("retains the legacy alias %s / %s", (header, alias) => {
    expect(CANONICAL_ASSET_FIELDS.find((field) => field.header === header)?.aliases).toContain(alias);
  });

  it("keeps calculated valuation and workflow results out of editable inputs", () => {
    const headers = CANONICAL_ASSET_FIELDS.map((field) => field.header);
    for (const calculated of ["MASA_MANFAAT_TAHUN", "NILAI_ABC_FINAL", "SUMBER_NILAI", "NILAI_AKHIR", "STATUS_VALIDASI", "DONOR_HARGA", "RULE_VERSION"]) {
      expect(headers).not.toContain(calculated);
    }
    expect(CANONICAL_ASSET_FIELDS.find((field) => field.header === "NILAI_BUKU_PENYESUAIAN")?.key).toBe("nilaiAbcInput");
    expect(CANONICAL_ASSET_FIELDS.find((field) => field.header === "HARGA_PENGADAAN_SAAT_INI")?.key).toBe("hargaPengadaanSaatIni");
  });
});
