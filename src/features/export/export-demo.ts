import { abcResults, gandul, locationPriorities, mappingSuggestions, policyRows, rfqTargets } from "../../demo/fixtures";
import { sortLocationPriorities } from "../../domain/location-priority";
import type { ApprovalMethod, MappingStatus, MappingSuggestion } from "../../domain/types";
import { hasPendingRfqPeer } from "../abc/rfq-presentation";

const statuses: readonly MappingStatus[] = ["DITERIMA_OTOMATIS", "MENUNGGU_APPROVAL", "DISETUJUI", "SPESIFIKASI_MANDIRI"];
const methods: readonly ApprovalMethod[] = ["AUTOMATIC", "ONE", "SELECTED", "ALL_FILTERED", "MANUAL"];

/** Text and identities come from authored fixtures; only allowlisted session decisions cross this boundary. */
export function createDemoSnapshot(state: { mappingRows: readonly MappingSuggestion[] }) {
  const mappings = mappingSuggestions.map((demo) => {
    const current = state.mappingRows.find((row) => row.id === demo.id);
    const approvedRfq = rfqTargets.find((target) => target.id === current?.approvedRfq?.id) ?? null;
    return {
      ...demo,
      status: current && statuses.includes(current.status) ? current.status : demo.status,
      approvalMethod: current?.approvalMethod && methods.includes(current.approvalMethod) ? current.approvalMethod : demo.approvalMethod,
      approvedRfq,
    };
  });
  return {
    schemaVersion: 1,
    dataLabel: "Data Demo",
    scope: "SYNTHETIC_WORKSPACE",
    allocationNote: "Jumlah ideal referensi adalah referensi policy material, bukan alokasi per lokasi; angka berulang tidak dijumlahkan.",
    approvalAudit: mappings.map((row) => ({ id: row.id, originalSpecification: row.originalSpecification, proposedRfq: row.proposedRfq?.specification ?? null, approvedRfq: row.approvedRfq?.specification ?? null, status: row.status, approvalMethod: row.approvalMethod, affectedAssetCount: row.affectedAssetCount })),
    abc: abcResults.map((row) => ({ ...row })),
    policies: policyRows.map((row) => ({ ...row, status: hasPendingRfqPeer(mappings, row.mappingId) ? "DRAFT" as const : "FINAL" as const, mappingStatus: mappings.find((mapping) => mapping.id === row.mappingId)?.status ?? row.mappingStatus })),
    locations: sortLocationPriorities(locationPriorities, gandul).map((row, index) => ({ rank: index + 1, id: row.id, policyId: row.policyId, materialName: row.materialName, upt: row.upt, gi: row.gi, condition: row.condition, assetAgeYears: row.assetAgeYears, distanceKm: Number(row.distanceKm!.toFixed(3)), assetCount: row.assetCount, idealQuantityReference: row.idealQuantityReference, allocationStatus: "REFERENCE_ONLY" as const })),
  };
}

export type DemoSnapshot = ReturnType<typeof createDemoSnapshot>;
export type CsvSection = "locations" | "policies" | "approvalAudit";

/** Quoted RFC 4180 cells and CRLF rows; input is always the sanitized snapshot. */
export function serializeDemoCsv(snapshot: DemoSnapshot, section: CsvSection) {
  const rows = snapshot[section];
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((column) => cell((row as unknown as Record<string, unknown>)[column])).join(","))].join("\r\n");
}
