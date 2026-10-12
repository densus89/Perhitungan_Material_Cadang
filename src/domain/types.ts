/** All domain records represent synthetic demonstration data. */
export type AssetCondition = "P0" | "P1" | "P2" | "P3" | "P4";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationPriority extends Coordinates {
  id: string;
  policyId: string;
  materialName: string;
  upt: string;
  gi: string;
  condition: AssetCondition;
  assetAgeYears: number | null;
  assetCount: number;
  idealQuantityReference: number;
  allocationStatus: "REFERENCE_ONLY";
  distanceKm?: number;
}

export type AbcCategory = "A1" | "A2" | "B1" | "B2" | "C";
export type AbcMode = "FILTERED" | "WHITELIST";
export type MaterialFamily = "TRANSFORMER" | "BREAKER" | "INSTRUMENT" | "OTHER";
export type MappingStatus = "DITERIMA_OTOMATIS" | "MENUNGGU_APPROVAL" | "DISETUJUI" | "SPESIFIKASI_MANDIRI";
export type ApprovalMethod = "AUTOMATIC" | "ONE" | "SELECTED" | "ALL_FILTERED" | "MANUAL";

export interface RfqTarget {
  id: string;
  specification: string;
}

export interface MappingSuggestion {
  id: string;
  materialFamily: MaterialFamily;
  originalSpecification: string;
  normalizedSpecification: string;
  proposedRfq: RfqTarget | null;
  approvedRfq: RfqTarget | null;
  matchKind: "EXACT" | "NEAR" | "UNMATCHED";
  status: MappingStatus;
  approvalMethod: ApprovalMethod | null;
  affectedAssetCount: number;
  differences: string[];
  groupKey: string;
}

/** filteredIds is the visibility boundary for propagation and bulk actions. */
export interface ApprovalScope {
  rows: readonly MappingSuggestion[];
  method: "ONE" | "SELECTED" | "ALL_FILTERED";
  selectedIds: readonly string[];
  filteredIds: readonly string[];
}

export type ApprovalDecision = { type: "approve"; target?: RfqTarget } | { type: "reject" };

export interface AbcResult {
  id: string;
  materialName: string;
  specification: string;
  mode: AbcMode;
  rank: number;
  unitPrice: number;
  effectiveQuantity: number;
  acquisitionValue: number;
  valueBeforePercent: number;
  valueThroughPercent: number;
  quantityThroughPercent: number;
  category: AbcCategory;
  auditReason: string;
}

export type PolicyMethod = "MANDATORY" | "OPTIMUM" | "ECONOMIC" | "NONE";
export interface PolicyRow {
  id: string;
  mappingId: string;
  materialName: string;
  specification: string;
  category: AbcCategory;
  method: PolicyMethod;
  idealQuantity: number;
  population: number;
  failureCount: number;
  historyYears: number;
  leadTimeMonths: number;
  unitPrice: number;
  status: "FINAL" | "DRAFT";
  mappingStatus: MappingStatus;
  reliabilityQuantity: number | null;
  costQuantity: number | null;
  combinedQuantity: number | null;
  achievedReliabilityPercent: number | null;
  explanation: string;
}

export interface DemoSourceFile {
  id: string;
  name: string;
  kind: "ASSET" | "RFQ" | "LOCATION";
  rowCount: number;
  status: "VALID" | "NEEDS_REVIEW";
}
