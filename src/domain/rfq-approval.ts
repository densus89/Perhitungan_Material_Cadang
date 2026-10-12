import type { ApprovalDecision, ApprovalScope, MappingSuggestion, RfqTarget } from "./types";

/** Conservative normalization preserves voltage winding count and numeric values. */
export function normalizeSpecification(specification: string): string {
  return specification.trim().toUpperCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
}

function transformerVariant(specification: string): { capacityMva: number; windingKv: number[] } | null {
  const normalized = normalizeSpecification(specification);
  const capacities = [...normalized.matchAll(/\b(\d+(?:[.,]\d+)?)\s*MVA\b/g)];
  const voltages = [...normalized.matchAll(/\b(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)+)\s*KV\b/g)];
  if (capacities.length !== 1 || voltages.length !== 1) return null;
  const capacityMva = Number(capacities[0][1].replace(",", "."));
  const windingKv = voltages[0][1].split("/").map((value) => Number(value.replace(",", ".")));
  if (![capacityMva, ...windingKv].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { capacityMva, windingKv };
}

/** Canonical families must match; transformers retain capacity and ordered windings. */
export function isCompatibleRfq(row: MappingSuggestion, target: RfqTarget): boolean {
  if (row.materialFamily !== target.materialFamily) return false;
  if (row.materialFamily !== "TRANSFORMER") return true;
  const source = transformerVariant(row.originalSpecification);
  const destination = transformerVariant(target.specification);
  return source !== null && destination !== null
    && source.capacityMva === destination.capacityMva
    && source.windingKv.length === destination.windingKv.length
    && source.windingKv.every((voltage, index) => voltage === destination.windingKv[index]);
}

export function classifyMapping(row: MappingSuggestion): MappingSuggestion {
  const normalizedSpecification = normalizeSpecification(row.originalSpecification);
  const standalone = { ...row, normalizedSpecification, approvedRfq: null, approvalMethod: null, groupKey: `standalone:${normalizedSpecification}` };
  if (!row.proposedRfq) return { ...standalone, matchKind: "UNMATCHED", status: "SPESIFIKASI_MANDIRI" };
  if (normalizedSpecification === normalizeSpecification(row.proposedRfq.specification) && isCompatibleRfq(row, row.proposedRfq)) {
    return { ...standalone, matchKind: "EXACT", status: "DITERIMA_OTOMATIS", approvedRfq: { ...row.proposedRfq }, approvalMethod: "AUTOMATIC", groupKey: `rfq:${row.proposedRfq.id}` };
  }
  return { ...standalone, matchKind: "NEAR", status: "MENUNGGU_APPROVAL" };
}

/** Only pending visible rows may change; peers share their selected specification's target. */
export function applyApproval(scope: ApprovalScope, decision: ApprovalDecision): MappingSuggestion[] {
  const visibleIds = new Set(scope.filteredIds);
  const selectedIds = new Set(scope.method === "ALL_FILTERED" ? scope.filteredIds : scope.method === "ONE" ? scope.selectedIds.slice(0, 1) : scope.selectedIds);
  const anchors = new Map<string, MappingSuggestion>();
  for (const row of scope.rows) {
    if (row.status === "MENUNGGU_APPROVAL" && visibleIds.has(row.id) && selectedIds.has(row.id) && !anchors.has(row.normalizedSpecification)) {
      anchors.set(row.normalizedSpecification, row);
    }
  }
  return scope.rows.map((row) => {
    const anchor = anchors.get(row.normalizedSpecification);
    if (!anchor || !visibleIds.has(row.id) || row.status !== "MENUNGGU_APPROVAL") return { ...row };
    if (decision.type === "reject") {
      return { ...row, approvedRfq: null, status: "SPESIFIKASI_MANDIRI", approvalMethod: scope.method, groupKey: `standalone:${row.normalizedSpecification}` };
    }
    const target = decision.target ?? anchor.proposedRfq;
    if (!target || !isCompatibleRfq(row, target)) return { ...row };
    return { ...row, approvedRfq: { ...target }, status: "DISETUJUI", approvalMethod: decision.target ? "MANUAL" : scope.method, groupKey: `rfq:${target.id}` };
  });
}
