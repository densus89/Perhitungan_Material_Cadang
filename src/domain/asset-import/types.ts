import type { AssetCondition } from "../types";

export type { AssetCondition } from "../types";
export type FieldRequirement = "REQUIRED" | "CONDITIONAL" | "OPTIONAL";

export type ValuationSource =
  | "SAP_BOOK_VALUE"
  | "PROVIDED_ADJUSTED_VALUE"
  | "SYSTEM_DEPRECIATION"
  | "ESTIMATED_SAME_GI"
  | "ESTIMATED_SAME_UPT"
  | "ESTIMATED_NEAREST_LOCATION"
  | "ESTIMATED_NATIONAL"
  | "UNRESOLVED";

/** Missing input remains null so incomplete drafts never silently become zero. */
export interface CanonicalAssetInput {
  unitInduk: string | null;
  upt: string | null;
  namaGi: string | null;
  bayPenghantar: string | null;
  tid: string | null;
  noAset: string | null;
  namaPeralatan: string | null;
  spesifikasiMara: string | null;
  jumlah: number | null;
  satuan: string | null;
  kondisiAset: AssetCondition | null;
  tanggalOperasi: string | null;
  usiaAsetTahun: number | null;
  kodeClassAsset: string | null;
  kodeJenis: string | null;
  kodeSubjenis: string | null;
  nilaiBukuSap: number | null;
  hargaPengadaanSaatIni: number | null;
  tanggalReferensiHarga: string | null;
  /** Provided legacy adjusted book value, never the system-calculated final value. */
  nilaiAbcInput: number | null;
  kodeMaterial: string | null;
  keterangan: string | null;
}

export interface CanonicalAssetField {
  readonly key: keyof CanonicalAssetInput;
  readonly header: string;
  readonly requirement: FieldRequirement;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly format: "TEXT" | "NUMBER" | "MONEY" | "DATE" | "CONDITION" | "UNIT";
}

/** Validation results belong beside input, never inside editable workbook columns. */
export interface RowIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  field?: keyof CanonicalAssetInput;
}
