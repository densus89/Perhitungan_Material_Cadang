import type { AssetCondition } from "../types";

export type { AssetCondition } from "../types";
export type FieldRequirement = "REQUIRED" | "CONDITIONAL" | "OPTIONAL";

export type ValuationSource =
  | "SAP_BOOK_VALUE"
  | "PROVIDED_ADJUSTED_VALUE"
  | "SYSTEM_DEPRECIATION"
  | "ESTIMATED_SAME_GI"
  | "ESTIMATED_SAME_UPT"
  | "ESTIMATED_SAME_UNIT"
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

/** Zero-based row arrays; source column indexes and row numbers are one-based. */
export interface AssetWorkbookGrid {
  sheets: readonly { name: string; rows: readonly (readonly unknown[])[] }[];
}

export interface AssetColumnMapping {
  columnIndex: number;
  columnLetter: string;
  header: string;
  normalizedHeader: string;
  field: keyof CanonicalAssetInput | null;
  confidence: number;
}

export interface AssetSheetMapping {
  sheetName: string;
  headerRow: number;
  columns: AssetColumnMapping[];
  confidence: number;
  score: number;
  missingRequiredFields: (keyof CanonicalAssetInput)[];
  ambiguousFields: (keyof CanonicalAssetInput)[];
}

export interface WorkbookLayoutProposal {
  selected: AssetSheetMapping | null;
  candidates: AssetSheetMapping[];
  requiresConfirmation: boolean;
}

export interface AssetRowProvenance {
  sheetName: string;
  rowNumber: number;
}

export interface AssetCellSource extends AssetRowProvenance {
  columnIndex: number;
  address: string;
  rawValue: unknown;
  formula?: string;
}

export interface CanonicalizedAssetRow {
  asset: CanonicalAssetInput;
  provenance: AssetRowProvenance;
  sources: Partial<Record<keyof CanonicalAssetInput, AssetCellSource>>;
  issues: (RowIssue & { address?: string })[];
  ageSource: "OPERATION_DATE" | "PROVIDED_AGE" | "MISSING";
  candidate: boolean;
  rejectionReason: "BLANK" | "EXAMPLE" | "SUBTOTAL" | "REPEATED_HEADER" | "INCOMPLETE_CANDIDATE" | null;
}
