import type { CanonicalAssetField } from "./types";

/** Fixed template order. Aliases are hints; duplicate headers still require disambiguation. */
export const CANONICAL_ASSET_FIELDS: readonly CanonicalAssetField[] = [
  { key: "unitInduk", header: "UNIT_INDUK", requirement: "REQUIRED", aliases: ["UNIT INDUK"], format: "TEXT", description: "Pemilik snapshot. Wajib sesuai Unit Induk yang dipilih saat impor." },
  { key: "upt", header: "UPT", requirement: "REQUIRED", aliases: [], format: "TEXT", description: "Unit pelaksana pemilik aset." },
  { key: "namaGi", header: "NAMA_GI", requirement: "CONDITIONAL", aliases: ["NAMAGI", "NAMA GI"], format: "TEXT", description: "Wajib untuk aset berlokasi. Isi nama gardu induk atau lokasi." },
  { key: "bayPenghantar", header: "BAY_PENGHANTAR", requirement: "CONDITIONAL", aliases: ["BAY PENGHANTAR", "BAY"], format: "TEXT", description: "Bay atau penghantar bila relevan." },
  { key: "tid", header: "TID", requirement: "OPTIONAL", aliases: [], format: "TEXT", description: "Identitas teknis. Disarankan; simpan sebagai teks agar nol awal tidak hilang." },
  { key: "noAset", header: "NO_ASET", requirement: "OPTIONAL", aliases: ["NO ASSET", "NO ASET"], format: "TEXT", description: "Identitas aset SAP atau operasional. Disarankan; simpan sebagai teks." },
  { key: "namaPeralatan", header: "NAMA_PERALATAN", requirement: "REQUIRED", aliases: ["GROUP_NAME", "NAMA PERALATAN"], format: "TEXT", description: "Keluarga atau nama peralatan." },
  { key: "spesifikasiMara", header: "SPESIFIKASI_MARA", requirement: "REQUIRED", aliases: ["MARA", "SPESIFIKASI"], format: "TEXT", description: "Spesifikasi asli peralatan; pertahankan rincian teknis sumber." },
  { key: "jumlah", header: "JUMLAH", requirement: "REQUIRED", aliases: ["QTY", "QUANTITY", "JUMLAH ASET"], format: "NUMBER", description: "Kuantitas positif dengan satuan yang sesuai." },
  { key: "satuan", header: "SATUAN", requirement: "REQUIRED", aliases: ["UNIT", "UOM"], format: "UNIT", description: "Pilih satuan yang sesuai dari REFERENSI. Penambahan satuan memerlukan pemeriksaan kompatibilitas saat impor." },
  { key: "kondisiAset", header: "KONDISI_ASET", requirement: "REQUIRED", aliases: ["KONDISI", "KONDISI ASET"], format: "CONDITION", description: "P0 paling kritis, P4 paling baik. Kondisi tidak menentukan usia atau depresiasi." },
  { key: "tanggalOperasi", header: "TANGGAL_OPERASI", requirement: "OPTIONAL", aliases: ["TANGGAL OPERASI"], format: "DATE", description: "Disarankan sebagai sumber utama usia. Isi tanggal Excel yang valid." },
  { key: "usiaAsetTahun", header: "USIA_ASET_TAHUN", requirement: "CONDITIONAL", aliases: ["USIA", "USIA ASET"], format: "NUMBER", description: "Usia dalam tahun bila tanggal operasi tidak tersedia. Jangan turunkan usia dari kondisi P0-P4." },
  { key: "kodeClassAsset", header: "KODE_CLASS_ASSET", requirement: "CONDITIONAL", aliases: ["CLASS ASSET", "KODE CLASS ASSET"], format: "TEXT", description: "Kode kelas aset untuk pemetaan masa manfaat bila estimasi depresiasi diperlukan." },
  { key: "kodeJenis", header: "KODE_JENIS", requirement: "CONDITIONAL", aliases: ["KODE JENIS"], format: "TEXT", description: "Kode jenis sesuai referensi klasifikasi masa manfaat." },
  { key: "kodeSubjenis", header: "KODE_SUBJENIS", requirement: "CONDITIONAL", aliases: ["KODE SUBJENIS"], format: "TEXT", description: "Kode subjenis sesuai referensi klasifikasi masa manfaat." },
  { key: "nilaiBukuSap", header: "NILAI_BUKU_SAP", requirement: "CONDITIONAL", aliases: ["nilai_buku_SAP", "NILAI BUKU SAP"], format: "MONEY", description: "Nilai buku SAP aktual dalam rupiah, prioritas utama valuasi. Nilai nol sah; kosong bukan nol." },
  { key: "hargaPengadaanSaatIni", header: "HARGA_PENGADAAN_SAAT_INI", requirement: "CONDITIONAL", aliases: ["HARGA PENGADAAN SAAT INI"], format: "MONEY", description: "Harga pengadaan baru/referensi dalam rupiah untuk Optimum Spare dan dasar estimasi terdepresiasi. Bukan nilai ABC langsung." },
  { key: "tanggalReferensiHarga", header: "TANGGAL_REFERENSI_HARGA", requirement: "CONDITIONAL", aliases: ["TANGGAL REFERENSI HARGA"], format: "DATE", description: "Tanggal dasar harga bila harga referensi diberikan." },
  { key: "nilaiAbcInput", header: "NILAI_BUKU_PENYESUAIAN", requirement: "OPTIONAL", aliases: ["NILAI BUKU PENYESUAIAN", "nilai_buku_SAP_penyesuaian"], format: "MONEY", description: "Nilai buku penyesuaian legacy dalam rupiah yang dapat dipertanggungjawabkan. Tetap diaudit, bukan hasil akhir sistem." },
  { key: "kodeMaterial", header: "KODE_MATERIAL", requirement: "OPTIONAL", aliases: ["KODE MATERIAL"], format: "TEXT", description: "Kode material bila tersedia; simpan sebagai teks." },
  { key: "keterangan", header: "KETERANGAN", requirement: "OPTIONAL", aliases: ["CATATAN"], format: "TEXT", description: "Catatan unit, termasuk dasar nilai penyesuaian bila diketahui." },
];
