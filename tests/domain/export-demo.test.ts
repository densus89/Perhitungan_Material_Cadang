import { describe, expect, it } from "vitest";
import { mappingSuggestions } from "../../src/demo/fixtures";
import { applyApproval } from "../../src/domain/rfq-approval";
import { createDemoSnapshot, serializeDemoCsv } from "../../src/features/export/export-demo";

describe("sanitized demo export", () => {
  it("exports the current approval method/status and dependent policy status", () => {
    const mappingRows = applyApproval({ rows: mappingSuggestions, method: "ONE", selectedIds: ["mapping-near"], filteredIds: ["mapping-near", "mapping-near-peer"] }, { type: "approve" });
    const result = createDemoSnapshot({ mappingRows });
    expect(result.dataLabel).toBe("Data Demo");
    expect(result.approvalAudit.find((row) => row.id === "mapping-near")).toMatchObject({ status: "DISETUJUI", approvalMethod: "ONE" });
    expect(result.approvalAudit.find((row) => row.id === "mapping-near-peer")).toMatchObject({ status: "DISETUJUI", approvalMethod: "ONE" });
    expect(result.policies.find((row) => row.id === "policy-a2")).toMatchObject({ status: "FINAL", mappingStatus: "DISETUJUI", idealQuantity: 2 });
  });

  it("carries a single reference field per location and never creates an allocation total", () => {
    const result = createDemoSnapshot({ mappingRows: mappingSuggestions });
    expect(result.locations).toHaveLength(8);
    for (const row of result.locations) {
      expect(row.idealQuantityReference).toBe(3);
      expect(row.allocationStatus).toBe("REFERENCE_ONLY");
      expect(Object.keys(row).filter((key) => key === "idealQuantityReference")).toHaveLength(1);
      expect(row).not.toHaveProperty("allocatedQuantity");
    }
    const csv = serializeDemoCsv(result, "locations");
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(9);
    expect(lines[0].split(",").filter((cell) => cell === '"idealQuantityReference"')).toHaveLength(1);
    expect(lines[1]).toContain('"REFERENCE_ONLY"');
    expect(serializeDemoCsv(result, "approvalAudit").split("\r\n")[0]).toContain('"approvalMethod","affectedAssetCount"');
  });

  it("allowlists authored demo text and excludes local metadata, unknown rows, and source identifiers", () => {
    const injected = { ...mappingSuggestions[1], originalSpecification: "GI OPERASIONAL RAHASIA", groupKey: "source-internal-01", approvedRfq: { id: "rfq-internal", specification: "C:\\private\\asset.xlsx" }, sourceId: "operational-source", filePath: "D:\\private\\source.xlsx" };
    const state = { mappingRows: [injected, { ...injected, id: "operational-row" }], localFileMetadata: { name: "internal.xlsx", size: 10, type: "secret" }, sourceFiles: [{ id: "source-private", name: "private.xlsx" }] };
    const snapshot = createDemoSnapshot(state);
    for (const payload of [JSON.stringify(snapshot), serializeDemoCsv(snapshot, "locations"), serializeDemoCsv(snapshot, "approvalAudit"), serializeDemoCsv(snapshot, "policies")]) {
      expect(payload).not.toMatch(/OPERASIONAL|RAHASIA|internal|private|source-|filePath|localFileMetadata|sourceFiles|operational/);
    }
    expect(snapshot.approvalAudit).toHaveLength(8);
    expect(snapshot.approvalAudit.find((row) => row.id === "mapping-near")?.originalSpecification).toBe("PMT Demo Tipe X 150 kV 2000 A");
  });
});
