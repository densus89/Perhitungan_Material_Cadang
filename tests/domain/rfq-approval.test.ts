import { describe, expect, it } from "vitest";
import { applyApproval, classifyMapping, normalizeSpecification } from "@/src/domain/rfq-approval";
import { abcResults, gandul, locationPriorities, mappingSuggestions, policyRows, transformerVariants } from "@/src/demo/fixtures";
import type { ApprovalScope, MappingSuggestion, RfqTarget } from "@/src/domain/types";

const target: RfqTarget = { id: "rfq-20", materialFamily: "TRANSFORMER", specification: "TRAFO DEMO MODEL X 60 MVA 150/20 kV" };
const pending = (id: string, originalSpecification = "Trafo Demo 60 MVA 150 / 20 kV"): MappingSuggestion => ({
  id, materialFamily: "TRANSFORMER", originalSpecification,
  normalizedSpecification: normalizeSpecification(originalSpecification), proposedRfq: target,
  approvedRfq: null, matchKind: "NEAR", status: "MENUNGGU_APPROVAL", approvalMethod: null,
  affectedAssetCount: 4, differences: ["Penulisan nama"], groupKey: "standalone:TRAFO DEMO 60 MVA 150/20 KV",
});
const scope = (rows: MappingSuggestion[], method: ApprovalScope["method"], selectedIds: string[], filteredIds = rows.map((row) => row.id)): ApprovalScope => ({ rows, method, selectedIds, filteredIds });

describe("RFQ approval", () => {
  it("approves one specification and propagates to its visible normalized peers only", () => {
    const rows = [pending("one"), pending("peer", " TRAFO DEMO 60 MVA 150/20 KV "), pending("other", "TRAFO DEMO 30 MVA 150/20 KV"), pending("hidden")];
    const snapshot = structuredClone(rows);
    const result = applyApproval(scope(rows, "ONE", ["one"], ["one", "peer", "other"]), { type: "approve" });
    expect(result.map((row) => row.status)).toEqual(["DISETUJUI", "DISETUJUI", "MENUNGGU_APPROVAL", "MENUNGGU_APPROVAL"]);
    expect(result[1].approvedRfq).toEqual(target);
    expect(result[1].approvalMethod).toBe("ONE");
    expect(result[0].groupKey).toBe("rfq:rfq-20");
    expect(rows).toEqual(snapshot);
  });

  it("approves selected pending specifications and leaves unrelated rows untouched", () => {
    const rows = [pending("one"), pending("peer"), { ...pending("two", "TRAFO DEMO 30 MVA 150/20 KV"), proposedRfq: { ...target, id: "rfq-30", specification: "TRAFO DEMO 30 MVA 150/20 KV" } }, pending("three", "TRAFO DEMO 90 MVA 150/20 KV")];
    const result = applyApproval(scope(rows, "SELECTED", ["one", "two"]), { type: "approve" });
    expect(result.map((row) => row.status)).toEqual(["DISETUJUI", "DISETUJUI", "DISETUJUI", "MENUNGGU_APPROVAL"]);
    expect(result[2].approvalMethod).toBe("SELECTED");
  });

  it("approves all filtered pending rows without changing hidden or decided rows", () => {
    const already = { ...pending("already"), status: "SPESIFIKASI_MANDIRI" as const, approvalMethod: "ONE" as const };
    const rows = [pending("one"), pending("hidden"), already];
    const result = applyApproval(scope(rows, "ALL_FILTERED", [], ["one", "already"]), { type: "approve" });
    expect(result.map((row) => row.status)).toEqual(["DISETUJUI", "MENUNGGU_APPROVAL", "SPESIFIKASI_MANDIRI"]);
    expect(result[0].approvalMethod).toBe("ALL_FILTERED");
    expect(result[2]).toEqual(already);
  });

  it("rejects normalized peers into the same standalone group", () => {
    const result = applyApproval(scope([pending("one"), pending("peer")], "ONE", ["one"]), { type: "reject" });
    expect(result.map((row) => row.status)).toEqual(["SPESIFIKASI_MANDIRI", "SPESIFIKASI_MANDIRI"]);
    expect(result[0].approvedRfq).toBeNull();
    expect(result[0].groupKey).toBe("standalone:TRAFO DEMO 60 MVA 150/20 KV");
    expect(result[1].groupKey).toBe(result[0].groupKey);
  });

  it("keeps near matches pending and unmatched rows standalone until a decision", () => {
    expect(classifyMapping(pending("near")).status).toBe("MENUNGGU_APPROVAL");
    const unmatched = classifyMapping({ ...pending("unmatched"), proposedRfq: null });
    expect(unmatched.status).toBe("SPESIFIKASI_MANDIRI");
    expect(unmatched.approvedRfq).toBeNull();
    expect(unmatched.groupKey).toBe("standalone:TRAFO DEMO 60 MVA 150/20 KV");
    expect(applyApproval(scope([pending("one")], "SELECTED", []), { type: "approve" })[0].status).toBe("MENUNGGU_APPROVAL");
  });

  it("automatically accepts only normalized exact specifications", () => {
    const result = classifyMapping(pending("exact", " TRAFO DEMO MODEL X 60 MVA 150 / 20 KV "));
    expect(result.status).toBe("DITERIMA_OTOMATIS");
    expect(result.matchKind).toBe("EXACT");
    expect(result.approvalMethod).toBe("AUTOMATIC");
    expect(result.approvedRfq).toEqual(target);
  });

  it.each(["ONE", "SELECTED", "ALL_FILTERED"] as const)("never accepts incompatible transformer voltages through %s approval", (method) => {
    const incompatible = { ...pending("guard"), proposedRfq: { ...target, id: "rfq-three", specification: "TRAFO DEMO 60 MVA 150/22/10 kV" } };
    expect(classifyMapping(incompatible).status).toBe("MENUNGGU_APPROVAL");
    const result = applyApproval(scope([incompatible], method, ["guard"]), { type: "approve" });
    expect(result[0].status).toBe("MENUNGGU_APPROVAL");
    expect(result[0].approvedRfq).toBeNull();
    expect(normalizeSpecification("150/20 kV")).not.toBe(normalizeSpecification("150/22/10 kV"));
  });

  it("supports an explicit compatible manual target and records the method", () => {
    const incompatible = { ...pending("manual"), proposedRfq: { ...target, id: "wrong", specification: "TRAFO DEMO 60 MVA 150/22/10 kV" } };
    const result = applyApproval(scope([incompatible], "ONE", ["manual"]), { type: "approve", target });
    expect(result[0].approvedRfq).toEqual(target);
    expect(result[0].approvalMethod).toBe("MANUAL");
  });

  it("does not approve a transformer with an unrecognizable voltage signature", () => {
    const unknown = { ...pending("unknown"), originalSpecification: "Trafo tanpa data tegangan" };
    expect(applyApproval(scope([unknown], "ALL_FILTERED", []), { type: "approve" })[0].status).toBe("MENUNGGU_APPROVAL");
  });

  it.each([30, 90])("blocks a 60 MVA transformer targeting %s MVA with the same voltage", (capacity) => {
    const mismatched = { ...target, id: `rfq-${capacity}`, specification: `TRAFO DEMO ${capacity} MVA 150/20 kV` };
    for (const method of ["ONE", "SELECTED", "ALL_FILTERED"] as const) {
      const row = { ...pending("capacity"), proposedRfq: mismatched };
      expect(applyApproval(scope([row], method, [row.id]), { type: "approve" })[0].status).toBe("MENUNGGU_APPROVAL");
      expect(applyApproval(scope([row], method, [row.id]), { type: "approve", target: mismatched })[0].approvedRfq).toBeNull();
    }
  });

  it.each(["BREAKER", "INSTRUMENT", "OTHER"] as const)("blocks %s approvals into a transformer RFQ", (materialFamily) => {
    const row = { ...pending("family", "PMT Demo Tipe X 150 kV 2000 A"), materialFamily, proposedRfq: target };
    expect(applyApproval(scope([row], "ONE", [row.id]), { type: "approve" })[0].status).toBe("MENUNGGU_APPROVAL");
    expect(applyApproval(scope([row], "ONE", [row.id]), { type: "approve", target })[0].approvedRfq).toBeNull();
  });

  it("accepts equivalent numeric capacity and full winding sequence for a manual target", () => {
    const compatible = { ...target, id: "rfq-canonical", specification: "TRAFO DEMO 60,0 MVA 150.0 / 20,0 kV" };
    const result = applyApproval(scope([pending("canonical")], "ONE", ["canonical"]), { type: "approve", target: compatible });
    expect(result[0].status).toBe("DISETUJUI");
    expect(result[0].approvedRfq).toEqual(compatible);
    expect(result[0].approvalMethod).toBe("MANUAL");
  });

  it("blocks transformer targets with missing capacity and different winding order", () => {
    for (const specification of ["TRAFO DEMO 150/20 kV", "TRAFO DEMO 60 MVA 20/150 kV"]) {
      expect(applyApproval(scope([pending("variant")], "ONE", ["variant"]), { type: "approve", target: { ...target, specification } })[0].status).toBe("MENUNGGU_APPROVAL");
    }
  });
});

describe("synthetic demo fixtures", () => {
  it("keeps ABC percentages consistent with the complete population and value in each mode", () => {
    const filtered = abcResults.filter((row) => row.mode === "FILTERED");
    const whitelist = abcResults.filter((row) => row.mode === "WHITELIST");
    expect(filtered.reduce((total, row) => total + row.effectiveQuantity, 0)).toBe(195);
    expect(filtered.reduce((total, row) => total + row.acquisitionValue, 0)).toBe(390510000000);
    expect(filtered[0].valueThroughPercent).toBeCloseTo(73.75, 2);
    expect(filtered[0].quantityThroughPercent).toBeCloseTo(12.31, 2);
    expect(filtered[4].quantityThroughPercent).toBe(100);
    expect(filtered[4].valueBeforePercent).toBeCloseTo(99.85, 2);
    expect(whitelist.reduce((total, row) => total + row.acquisitionValue, 0)).toBe(229780000000);
    expect(whitelist[0].valueThroughPercent).toBeCloseTo(94.0, 2);
    expect(whitelist[4].valueBeforePercent).toBeCloseTo(99.78, 2);
    expect(whitelist[4].valueThroughPercent).toBe(100);
  });

  it("covers policy classes, both ABC modes, and a zero quantity for every C lead time", () => {
    expect(new Set(policyRows.map((row) => row.category))).toEqual(new Set(["A1", "A2", "B1", "B2", "C"]));
    expect(new Set(abcResults.map((row) => row.mode))).toEqual(new Set(["FILTERED", "WHITELIST"]));
    expect(policyRows.filter((row) => row.category === "C").map((row) => row.idealQuantity)).toEqual([0, 0]);
    expect(policyRows.filter((row) => row.category === "C").map((row) => row.leadTimeMonths)).toEqual([6, 24]);
  });

  it("retains fourteen distinct transformer variants including the guarded pair", () => {
    expect(new Set(transformerVariants.map((row) => normalizeSpecification(row.specification))).size).toBe(14);
    expect(transformerVariants.some((row) => row.specification.includes("150/20 kV"))).toBe(true);
    expect(transformerVariants.some((row) => row.specification.includes("150/22/10 kV"))).toBe(true);
  });

  it("covers the full location and mapping workflows with reference-only locations", () => {
    expect(new Set(locationPriorities.map((row) => row.condition))).toEqual(new Set(["P0", "P1", "P2", "P3", "P4"]));
    expect(locationPriorities.some((row) => row.assetAgeYears === null)).toBe(true);
    const twins = locationPriorities.filter((row) => row.gi === "GI Demo Kembar");
    expect(new Set(twins.map((row) => row.upt)).size).toBe(2);
    expect(locationPriorities.every((row) => row.allocationStatus === "REFERENCE_ONLY")).toBe(true);
    expect(locationPriorities.every((row) => row.idealQuantityReference === policyRows.find((policy) => policy.id === row.policyId)?.idealQuantity)).toBe(true);
    expect(new Set(mappingSuggestions.map((row) => row.status))).toEqual(new Set(["DITERIMA_OTOMATIS", "MENUNGGU_APPROVAL", "SPESIFIKASI_MANDIRI"]));
    expect(gandul).toEqual({ latitude: -6.343459, longitude: 106.787061 });
  });
});
