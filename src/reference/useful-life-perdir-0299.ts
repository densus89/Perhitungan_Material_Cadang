/** Verified subset only, visually transcribed from Lampiran I. Blank cells are not defaults. */
export interface UsefulLifeRule {
  id: string;
  assetFunction: string;
  classCode: string;
  typeCode: string;
  subtypeCode: string | null;
  description: string;
  years: number;
  effectiveFrom: string;
  /** Exclusive upper bound. */
  effectiveTo: string | null;
  ruleVersion: string;
  sourceDocument: string;
  sourceLocator: string;
  verifiedBy: string;
  approval: "SOURCE_VERIFIED";
}

export interface UsefulLifeAlias {
  alias: string;
  ruleIds: readonly string[];
  approvedBy: string | null;
  approvedAt: string | null;
  evidence: string;
}

export const PERDIR_0299_VERSION = "PERDIR-0299-2016-verified-subset-v1";
export const PERDIR_0299_SOURCE = "PERDIR 0299.P/DIR/2016, Lampiran I, Tabel Umur Masa Manfaat Aset Tetap";
const common = {
  effectiveFrom: "2016-01-01", effectiveTo: null, ruleVersion: PERDIR_0299_VERSION,
  sourceDocument: PERDIR_0299_SOURCE,
  // Source verification is not an approval of equipment-name aliases or a DIV RST override.
  verifiedBy: "Task 3 visual transcription of original scan, 2026-10-15", approval: "SOURCE_VERIFIED" as const,
};

// The effective date is explicitly stated in PDF page 1, covering letter, final substantive paragraph.
export const PERDIR_0299_RULES: readonly UsefulLifeRule[] = [
  { ...common, id: "trans-transformer", assetFunction: "TRANS", classCode: "10600", typeCode: "07", subtypeCode: "102", description: "Transformator", years: 40, sourceLocator: "PDF page 4, Lampiran I row 7.2, column 10 TRANS; PDF page 9 example I.a.1 confirms GI transformer 40 years" },
  { ...common, id: "trans-gi", assetFunction: "TRANS", classCode: "10700", typeCode: "08", subtypeCode: null, description: "Gardu Induk", years: 40, sourceLocator: "PDF page 4, Lampiran I row 8, column 10 TRANS" },
  { ...common, id: "trans-ohl-tower", assetFunction: "TRANS", classCode: "10800", typeCode: "09", subtypeCode: "111", description: "Menara", years: 40, sourceLocator: "PDF page 5, Lampiran I row 9.1, column 10 TRANS; PDF page 10 example II Tower SUTT 150 kV" },
  { ...common, id: "trans-underground-cable", assetFunction: "TRANS", classCode: "10900", typeCode: "11", subtypeCode: "101", description: "Kabel Bawah Tanah", years: 40, sourceLocator: "PDF page 5, Lampiran I row 11.1, column 10 TRANS" },
  { ...common, id: "distribution-transformer", assetFunction: "DISTRIBUSI", classCode: "11100", typeCode: "13", subtypeCode: "102", description: "Transformator", years: 25, sourceLocator: "PDF page 5, Lampiran I row 13.2, column 12 DISTRIBUSI" },
  { ...common, id: "data-fiber-optic", assetFunction: "TELE INFORMASI DATA", classCode: "11400", typeCode: "16", subtypeCode: "105", description: "Perlengkapan Fiber Optik", years: 10, sourceLocator: "PDF page 6, Lampiran I row 16.5, column 11 TELE INFORMASI DATA; PDF pages 9-10 example I.a.2 confirms transmission data 10 years" },
  { ...common, id: "telecom-power-equipment", assetFunction: "TELE INFORMASI DATA", classCode: "11600", typeCode: "17", subtypeCode: "112", description: "Perlengkapan Pemberian Tenaga", years: 10, sourceLocator: "PDF page 7, Lampiran I row 17.11, column 11 TELE INFORMASI DATA" },
  { ...common, id: "trans-general-office", assetFunction: "TRANS", classCode: "11700", typeCode: "18", subtypeCode: "102", description: "Perlengkapan Kantor", years: 5, sourceLocator: "PDF page 7, Lampiran I row 18.2, column 10 TRANS" },
];

/** No equipment-name alias has been approved by DIV RST in this phase. */
export const PERDIR_0299_ALIASES: readonly UsefulLifeAlias[] = [];
