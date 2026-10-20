// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fixture } from "./lifecycle-fixture";
import { actor } from "./fakes";
import { completeSourceUpload, saveImportMapping, submitAssetVersion, loadAssetImport } from "../../../src/server/import/service";
import { processStoredWorkbook } from "../../../src/server/import/process-workbook";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
vi.mock("server-only", () => ({}));
async function prepared() {
  const f = await fixture(); await completeSourceUpload(actor, { importId: f.created.importId }, f.deps);
  const parsed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1" });
  const input = { importId: f.created.importId, mapping: parsed.layout.selected!, ruleVersion: "synthetic-v1", layoutHash: parsed.layoutHash, canonicalHash: parsed.canonicalHash };
  await saveImportMapping(actor, input, f.deps); return { ...f, input };
}
describe("locked import interleavings", () => {
  it("mapping replacement loses atomically to a processing reservation", async () => {
    const f = await prepared(), before = JSON.stringify(f.tables.import_column_mappings);
    Object.assign(f.deps, { replaceMapping: async () => { throw new Error("stale reservation conflict"); } });
    await expect(saveImportMapping(actor, f.input, f.deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(f.tables.import_column_mappings)).toBe(before);
  });
  it("an obsolete processing request loses atomically to mapping replacement", async () => {
    const f = await prepared();
    Object.assign(f.deps, { claimProcessing: async () => { throw new Error("stale mapping revision"); } });
    await expect(processStoredWorkbook(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.tables.asset_import_runs ?? []).toHaveLength(0);
  });
  it("admits exactly one concurrent processing request", async () => {
    const f = await prepared();
    let releaseDownloads!: () => void, releaseFirst!: () => void;
    const downloadsReady = new Promise<void>((resolve) => { releaseDownloads = resolve; });
    const secondReserved = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const download = f.deps.download, claimProcessing = f.deps.claimProcessing; let downloads = 0, claims = 0;
    // Both preflights finish before either can reserve; hold the winner PROCESSING
    // until the second reservation has actually attempted the locked operation.
    f.deps.download = async (path) => { const bytes = await download(path); if (++downloads === 2) releaseDownloads(); await downloadsReady; return bytes; };
    f.deps.claimProcessing = async (...args) => {
      const ordinal = ++claims;
      try { const claim = await claimProcessing(...args); if (ordinal === 1) await secondReserved; return claim; } finally { if (ordinal === 2) releaseFirst(); }
    };
    const results = await Promise.allSettled([processStoredWorkbook(actor, f.created.importId, f.deps), processStoredWorkbook(actor, f.created.importId, f.deps)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => (result as PromiseRejectedResult).reason.code)).toEqual(["CONFLICT"]);
    expect(f.tables.asset_import_runs).toHaveLength(1);
  });
  it.each(["mapping", "activation"])("submission revalidates a concurrent %s change inside its RPC", async (kind) => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps);
    const original = f.deps.submit;
    f.deps.submit = async (...args) => {
      if (kind === "mapping") f.tables.import_sessions[0].mapping_revision = "90000000-0000-4000-8000-000000000001";
      else f.tables.datasets[0].active_version_id = "90000000-0000-4000-8000-000000000002";
      return original(...args);
    };
    await expect(submitAssetVersion(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "NOT_READY" });
    expect(f.tables.dataset_versions[0].status).toBe("DRAFT");
  });
  it("a delayed old request cannot overwrite current-run metadata", async () => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps);
    const firstRun = String(f.tables.import_sessions[0].current_run_id);
    await processStoredWorkbook(actor, f.created.importId, f.deps);
    const currentRun = String(f.tables.import_sessions[0].current_run_id);
    const seal = (f.deps as unknown as { sealComparison(actorId: string, runId: string, baseId: string | null, comparisonId: string | null): Promise<void> }).sealComparison;
    await expect(seal(actor.userId, firstRun, null, null)).rejects.toThrow();
    expect(f.tables.asset_import_run_metadata.find((row) => row.import_run_id === currentRun)?.comparison_ready).toBe(true);
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).stage).toBe("READY_TO_SUBMIT");
  });
});
