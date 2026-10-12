import { classifyMapping, normalizeSpecification } from "../domain/rfq-approval";
import type { AbcResult, Coordinates, DemoSourceFile, LocationPriority, MappingSuggestion, PolicyRow, RfqTarget } from "../domain/types";

/** Authored demo values only; these records do not import operational data. */
export const gandul: Coordinates = { latitude: -6.343459, longitude: 106.787061 };

export const transformerVariants: RfqTarget[] = [
  { id: "rfq-demo-t01", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 30 MVA 150/20 kV" },
  { id: "rfq-demo-t02", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 60 MVA 150/20 kV" },
  { id: "rfq-demo-t03", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 90 MVA 150/20 kV" },
  { id: "rfq-demo-t04", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 30 MVA 150/22/10 kV" },
  { id: "rfq-demo-t05", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 60 MVA 150/22/10 kV" },
  { id: "rfq-demo-t06", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 90 MVA 150/22/10 kV" },
  { id: "rfq-demo-t07", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 30 MVA 70/20 kV" },
  { id: "rfq-demo-t08", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 60 MVA 70/20 kV" },
  { id: "rfq-demo-t09", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 90 MVA 70/20 kV" },
  { id: "rfq-demo-t10", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 100 MVA 150/70 kV" },
  { id: "rfq-demo-t11", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 150 MVA 150/70 kV" },
  { id: "rfq-demo-t12", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 200 MVA 275/150 kV" },
  { id: "rfq-demo-t13", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 250 MVA 500/150 kV" },
  { id: "rfq-demo-t14", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO 500 MVA 500/150 kV" },
];

export const rfqTargets: RfqTarget[] = [
  ...transformerVariants,
  { id: "rfq-demo-cb", materialFamily: "BREAKER", specification: "PMT DEMO 150 kV 2000 A" },
  { id: "rfq-demo-ct", materialFamily: "INSTRUMENT", specification: "CT DEMO 150 kV 1000/1 A" },
  { id: "rfq-demo-ins", materialFamily: "OTHER", specification: "ISOLATOR DEMO 150 kV" },
];

const mappingInputs: MappingSuggestion[] = [
  { id: "mapping-exact", materialFamily: "TRANSFORMER", originalSpecification: "Trafo Demo 60 MVA 150/20 kV", normalizedSpecification: "", proposedRfq: transformerVariants[1], approvedRfq: null, matchKind: "EXACT", status: "MENUNGGU_APPROVAL", approvalMethod: null, affectedAssetCount: 24, differences: [], groupKey: "" },
  { id: "mapping-near", materialFamily: "BREAKER", originalSpecification: "PMT Demo Tipe X 150 kV 2000 A", normalizedSpecification: "", proposedRfq: rfqTargets[14], approvedRfq: null, matchKind: "NEAR", status: "MENUNGGU_APPROVAL", approvalMethod: null, affectedAssetCount: 18, differences: ["Tipe X belum tercantum pada usulan RFQ"], groupKey: "" },
  { id: "mapping-near-peer", materialFamily: "BREAKER", originalSpecification: " PMT DEMO TIPE X 150 KV 2000 A ", normalizedSpecification: "", proposedRfq: rfqTargets[14], approvedRfq: null, matchKind: "NEAR", status: "MENUNGGU_APPROVAL", approvalMethod: null, affectedAssetCount: 6, differences: ["Kapitalisasi dan spasi", "Tipe X belum tercantum pada usulan RFQ"], groupKey: "" },
  { id: "mapping-unmatched", materialFamily: "INSTRUMENT", originalSpecification: "CT Demo Khusus 70 kV 800/1 A", normalizedSpecification: "", proposedRfq: null, approvedRfq: null, matchKind: "UNMATCHED", status: "SPESIFIKASI_MANDIRI", approvalMethod: null, affectedAssetCount: 12, differences: ["Tidak ada RFQ yang cocok"], groupKey: "" },
  { id: "mapping-transformer-guard", materialFamily: "TRANSFORMER", originalSpecification: "Trafo Demo Tipe Y 60 MVA 150/20 kV", normalizedSpecification: "", proposedRfq: transformerVariants[4], approvedRfq: null, matchKind: "NEAR", status: "MENUNGGU_APPROVAL", approvalMethod: null, affectedAssetCount: 9, differences: ["150/20 kV berbeda dengan 150/22/10 kV", "Jumlah belitan berbeda"], groupKey: "" },
  { id: "mapping-economic", materialFamily: "INSTRUMENT", originalSpecification: "CT DEMO 150 kV 1000/1 A", normalizedSpecification: "", proposedRfq: rfqTargets[15], approvedRfq: null, matchKind: "EXACT", status: "MENUNGGU_APPROVAL", approvalMethod: null, affectedAssetCount: 40, differences: [], groupKey: "" },
  { id: "mapping-c", materialFamily: "OTHER", originalSpecification: "ISOLATOR DEMO 150 kV", normalizedSpecification: "", proposedRfq: rfqTargets[16], approvedRfq: null, matchKind: "EXACT", status: "MENUNGGU_APPROVAL", approvalMethod: null, affectedAssetCount: 120, differences: [], groupKey: "" },
  { id: "mapping-rejected", materialFamily: "OTHER", originalSpecification: "KONEKTOR DEMO TIPE Z", normalizedSpecification: "", proposedRfq: { id: "rfq-demo-connector", materialFamily: "OTHER", specification: "KONEKTOR DEMO TIPE A" }, approvedRfq: null, matchKind: "NEAR", status: "SPESIFIKASI_MANDIRI", approvalMethod: "ONE", affectedAssetCount: 30, differences: ["Tipe Z ditolak untuk penggabungan dengan Tipe A"], groupKey: "" },
];

export const mappingSuggestions: MappingSuggestion[] = mappingInputs.map((row) => row.id === "mapping-rejected"
  ? { ...row, normalizedSpecification: normalizeSpecification(row.originalSpecification), groupKey: `standalone:${normalizeSpecification(row.originalSpecification)}` }
  : classifyMapping(row));

export const policyRows: PolicyRow[] = [
  { id: "policy-a1", mappingId: "mapping-exact", materialName: "Trafo Demo 60 MVA", specification: transformerVariants[1].specification, category: "A1", method: "MANDATORY", idealQuantity: 3, population: 24, failureCount: 3, historyYears: 5, leadTimeMonths: 18, unitPrice: 12000000000, status: "FINAL", mappingStatus: "DITERIMA_OTOMATIS", reliabilityQuantity: null, costQuantity: null, combinedQuantity: null, achievedReliabilityPercent: null, explanation: "Contoh Mandatory: kebutuhan minimum demonstrasi untuk material kritis A1." },
  { id: "policy-a2", mappingId: "mapping-near", materialName: "PMT Demo Tipe X", specification: mappingInputs[1].originalSpecification, category: "A2", method: "OPTIMUM", idealQuantity: 2, population: 24, failureCount: 4, historyYears: 5, leadTimeMonths: 12, unitPrice: 650000000, status: "DRAFT", mappingStatus: "MENUNGGU_APPROVAL", reliabilityQuantity: 3, costQuantity: 1, combinedQuantity: 2, achievedReliabilityPercent: 97.8, explanation: "Contoh Optimum sintetis: kebutuhan reliabilitas 3, biaya 1, gabungan 2. Hasil gabungan tidak selalu mencapai 99%." },
  { id: "policy-b1-positive", mappingId: "mapping-unmatched", materialName: "CT Demo Khusus", specification: mappingInputs[3].originalSpecification, category: "B1", method: "OPTIMUM", idealQuantity: 1, population: 12, failureCount: 2, historyYears: 5, leadTimeMonths: 9, unitPrice: 180000000, status: "FINAL", mappingStatus: "SPESIFIKASI_MANDIRI", reliabilityQuantity: 2, costQuantity: 1, combinedQuantity: 1, achievedReliabilityPercent: 96.2, explanation: "Contoh B1 dengan riwayat kegagalan positif memakai Optimum; spesifikasi mandiri tetap tampil." },
  { id: "policy-b1-zero", mappingId: "mapping-economic", materialName: "CT Demo 150 kV", specification: rfqTargets[15].specification, category: "B1", method: "ECONOMIC", idealQuantity: 1, population: 40, failureCount: 0, historyYears: 5, leadTimeMonths: 6, unitPrice: 140000000, status: "FINAL", mappingStatus: "DITERIMA_OTOMATIS", reliabilityQuantity: null, costQuantity: 1, combinedQuantity: null, achievedReliabilityPercent: null, explanation: "Contoh B1 tanpa kegagalan memakai Economic." },
  { id: "policy-b2", mappingId: "mapping-rejected", materialName: "Konektor Demo Tipe Z", specification: mappingInputs[7].originalSpecification, category: "B2", method: "ECONOMIC", idealQuantity: 1, population: 30, failureCount: 0, historyYears: 5, leadTimeMonths: 4, unitPrice: 25000000, status: "FINAL", mappingStatus: "SPESIFIKASI_MANDIRI", reliabilityQuantity: null, costQuantity: 1, combinedQuantity: null, achievedReliabilityPercent: null, explanation: "Contoh B2 memakai Economic. Penolakan pemetaan mempertahankan kelompok mandiri." },
  { id: "policy-c-short", mappingId: "mapping-c", materialName: "Isolator Demo", specification: rfqTargets[16].specification, category: "C", method: "NONE", idealQuantity: 0, population: 120, failureCount: 1, historyYears: 5, leadTimeMonths: 6, unitPrice: 5000000, status: "FINAL", mappingStatus: "DITERIMA_OTOMATIS", reliabilityQuantity: null, costQuantity: null, combinedQuantity: null, achievedReliabilityPercent: null, explanation: "Tidak dicadangkan: kategori C selalu 0 terlepas dari lead time." },
  { id: "policy-c-long", mappingId: "mapping-c", materialName: "Isolator Demo lead time panjang", specification: rfqTargets[16].specification, category: "C", method: "NONE", idealQuantity: 0, population: 120, failureCount: 1, historyYears: 5, leadTimeMonths: 24, unitPrice: 5000000, status: "FINAL", mappingStatus: "DITERIMA_OTOMATIS", reliabilityQuantity: null, costQuantity: null, combinedQuantity: null, achievedReliabilityPercent: null, explanation: "Tidak dicadangkan: lead time 24 bulan tidak mengubah jumlah ideal C=0." },
  { id: "policy-transformer-guard", mappingId: "mapping-transformer-guard", materialName: "Trafo Demo Tipe Y", specification: mappingInputs[4].originalSpecification, category: "A2", method: "OPTIMUM", idealQuantity: 1, population: 9, failureCount: 1, historyYears: 5, leadTimeMonths: 18, unitPrice: 11000000000, status: "DRAFT", mappingStatus: "MENUNGGU_APPROVAL", reliabilityQuantity: 2, costQuantity: 1, combinedQuantity: 1, achievedReliabilityPercent: 95.4, explanation: "Usulan tegangan tidak kompatibel; contoh policy tetap draft dan tidak digabungkan." },
];

export const abcResults: AbcResult[] = [
  { id: "abc-filtered-a1", materialName: "Trafo Demo 60 MVA", specification: transformerVariants[1].specification, mode: "FILTERED", rank: 1, unitPrice: 12000000000, effectiveQuantity: 24, acquisitionValue: 288000000000, valueBeforePercent: 0, valueThroughPercent: 73.75, quantityThroughPercent: 12.31, category: "A1", auditReason: "Harga tertinggi; contoh material Mandatory." },
  { id: "abc-filtered-a2", materialName: "Trafo Demo Tipe Y", specification: mappingInputs[4].originalSpecification, mode: "FILTERED", rank: 2, unitPrice: 11000000000, effectiveQuantity: 9, acquisitionValue: 99000000000, valueBeforePercent: 73.75, valueThroughPercent: 99.1, quantityThroughPercent: 16.92, category: "A2", auditReason: "Spesifikasi RFQ belum disetujui; nilai demonstrasi tetap terpisah." },
  { id: "abc-filtered-b1", materialName: "CT Demo Khusus", specification: mappingInputs[3].originalSpecification, mode: "FILTERED", rank: 3, unitPrice: 180000000, effectiveQuantity: 12, acquisitionValue: 2160000000, valueBeforePercent: 99.1, valueThroughPercent: 99.65, quantityThroughPercent: 23.08, category: "B1", auditReason: "Riwayat kegagalan positif; spesifikasi mandiri." },
  { id: "abc-filtered-b2", materialName: "Konektor Demo Tipe Z", specification: mappingInputs[7].originalSpecification, mode: "FILTERED", rank: 4, unitPrice: 25000000, effectiveQuantity: 30, acquisitionValue: 750000000, valueBeforePercent: 99.65, valueThroughPercent: 99.85, quantityThroughPercent: 38.46, category: "B2", auditReason: "Penolakan RFQ; contoh Economic." },
  { id: "abc-filtered-c", materialName: "Isolator Demo", specification: rfqTargets[16].specification, mode: "FILTERED", rank: 5, unitPrice: 5000000, effectiveQuantity: 120, acquisitionValue: 600000000, valueBeforePercent: 99.85, valueThroughPercent: 100, quantityThroughPercent: 100, category: "C", auditReason: "Tidak dicadangkan; jumlah ideal 0." },
  { id: "abc-whitelist-a1", materialName: "Trafo Demo 60 MVA", specification: transformerVariants[1].specification, mode: "WHITELIST", rank: 1, unitPrice: 12000000000, effectiveQuantity: 18, acquisitionValue: 216000000000, valueBeforePercent: 0, valueThroughPercent: 94, quantityThroughPercent: 11.11, category: "A1", auditReason: "Populasi demonstrasi dalam daftar whitelist." },
  { id: "abc-whitelist-a2", materialName: "PMT Demo Tipe X", specification: mappingInputs[1].originalSpecification, mode: "WHITELIST", rank: 2, unitPrice: 650000000, effectiveQuantity: 18, acquisitionValue: 11700000000, valueBeforePercent: 94, valueThroughPercent: 99.09, quantityThroughPercent: 22.22, category: "A2", auditReason: "Pemetaan menunggu approval; contoh analisis draft." },
  { id: "abc-whitelist-b1", materialName: "CT Demo Khusus", specification: mappingInputs[3].originalSpecification, mode: "WHITELIST", rank: 3, unitPrice: 180000000, effectiveQuantity: 6, acquisitionValue: 1080000000, valueBeforePercent: 99.09, valueThroughPercent: 99.56, quantityThroughPercent: 25.93, category: "B1", auditReason: "Spesifikasi mandiri dalam whitelist." },
  { id: "abc-whitelist-b2", materialName: "Konektor Demo Tipe Z", specification: mappingInputs[7].originalSpecification, mode: "WHITELIST", rank: 4, unitPrice: 25000000, effectiveQuantity: 20, acquisitionValue: 500000000, valueBeforePercent: 99.56, valueThroughPercent: 99.78, quantityThroughPercent: 38.27, category: "B2", auditReason: "Contoh kelompok Economic." },
  { id: "abc-whitelist-c", materialName: "Isolator Demo", specification: rfqTargets[16].specification, mode: "WHITELIST", rank: 5, unitPrice: 5000000, effectiveQuantity: 100, acquisitionValue: 500000000, valueBeforePercent: 99.78, valueThroughPercent: 100, quantityThroughPercent: 100, category: "C", auditReason: "C=0 pada mode whitelist." },
];

export const locationPriorities: LocationPriority[] = [
  { id: "location-demo-01", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Barat", gi: "GI Demo Kembar", condition: "P0", assetAgeYears: 28, latitude: -6.55, longitude: 106.65, assetCount: 3, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-02", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Timur", gi: "GI Demo Kembar", condition: "P0", assetAgeYears: 16, latitude: -6.3, longitude: 107.1, assetCount: 2, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-03", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Selatan", gi: "GI Demo Cendana", condition: "P1", assetAgeYears: 22, latitude: -6.7, longitude: 106.9, assetCount: 4, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-04", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Barat", gi: "GI Demo Kenanga", condition: "P2", assetAgeYears: 12, latitude: -6.4, longitude: 106.8, assetCount: 2, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-05", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Timur", gi: "GI Demo Melati", condition: "P2", assetAgeYears: 12, latitude: -6.6, longitude: 107.2, assetCount: 3, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-06", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Tengah", gi: "GI Demo Akasia", condition: "P3", assetAgeYears: null, latitude: -6.36, longitude: 106.8, assetCount: 2, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-07", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Utara", gi: "GI Demo Pinus", condition: "P3", assetAgeYears: null, latitude: -6.15, longitude: 106.8, assetCount: 3, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
  { id: "location-demo-08", policyId: "policy-a1", materialName: "Trafo Demo 60 MVA", upt: "UPT Demo Tengah", gi: "GI Demo Flamboyan", condition: "P4", assetAgeYears: 3, latitude: -6.28, longitude: 106.88, assetCount: 5, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY" },
];

export const sourceFiles: DemoSourceFile[] = [
  { id: "source-demo-assets", name: "aset-demo.xlsx", kind: "ASSET", rowCount: 259, status: "VALID" },
  { id: "source-demo-rfq", name: "katalog-rfq-demo.xlsx", kind: "RFQ", rowCount: 17, status: "NEEDS_REVIEW" },
  { id: "source-demo-locations", name: "lokasi-demo.xlsx", kind: "LOCATION", rowCount: 8, status: "VALID" },
];

export const demoSummary = {
  materialCount: policyRows.length,
  assetCount: mappingSuggestions.reduce((total, row) => total + row.affectedAssetCount, 0),
  pendingMappingCount: mappingSuggestions.filter((row) => row.status === "MENUNGGU_APPROVAL").length,
  standaloneCount: mappingSuggestions.filter((row) => row.status === "SPESIFIKASI_MANDIRI").length,
  locationCount: locationPriorities.length,
  missingAgeCount: locationPriorities.filter((row) => row.assetAgeYears === null).length,
};
