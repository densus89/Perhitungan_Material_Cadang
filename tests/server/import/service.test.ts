// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAssetImport, completeSourceUpload, loadAssetImport, saveImportMapping, submitAssetVersion, headerFingerprint } from "../../../src/server/import/service";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
import { actor, unitId } from "./fakes";
import { fixture } from "./lifecycle-fixture";
import { assetRow, headers } from "../../fixtures/asset-workbooks";
import { createImportDependencies } from "../../../src/server/import/dependencies";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database";
vi.mock("server-only", () => ({}));
describe("private import lifecycle", () => {
  it("allocates ASSET draft and an exact scoped non-upsert upload", async () => {
    const f = await fixture(); expect(f.created.stage).toBe("UPLOAD");
    expect(f.created.upload!.path).toBe(`unit/${unitId}/dataset/${f.created.datasetId}/version/${f.created.versionId}/${f.tables.source_files[0].id}.xlsx`);
    expect(f.tables.dataset_versions[0].status).toBe("DRAFT"); expect(f.tables.datasets[0].type).toBe("ASSET");
    await createAssetImport(actor, f.input, f.deps); expect(f.tables.datasets).toHaveLength(1); expect(f.tables.dataset_versions[1].version_number).toBe(2);
  });
  it("resumes an uncompleted upload with a freshly signed scoped capability", async () => {
    const f = await fixture(); const resumed = await loadAssetImport(actor, f.created.importId, f.deps);
    expect(resumed.stage).toBe("UPLOAD"); expect(resumed.upload?.path).toBe(f.created.upload!.path);
  });
  it("keeps the highest-ranked header proposal when a sheet contains repeated header rows", async () => {
    const weakerHeader = headers.map((header, index) => index === 0 ? "" : header);
    const f = await fixture([assetRow, weakerHeader, assetRow]);
    expect((await completeSourceUpload(actor, { importId: f.created.importId }, f.deps)).layout?.headerRow).toBe(1);
  });
  it("denies direct service access outside assigned operator units", async () => {
    const f = await fixture(); await expect(loadAssetImport({ ...actor, unitIndukIds: [] }, f.created.importId, f.deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createAssetImport({ ...actor, role: "RST_ADMIN" }, f.input, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("verifies object bytes then completes idempotently", async () => {
    const f = await fixture(); expect((await completeSourceUpload(actor, { importId: f.created.importId }, f.deps)).stage).toBe("MAPPING");
    await completeSourceUpload(actor, { importId: f.created.importId }, f.deps); expect(f.tables.import_sheets).toHaveLength(1);
    f.objects.set(f.created.upload!.path, new Uint8Array([1, 2])); await expect(completeSourceUpload(actor, { importId: f.created.importId }, f.deps)).rejects.toMatchObject({ code: "SOURCE_MISMATCH" });
  });
  it("rejects missing storage objects without marking available", async () => {
    const f = await fixture(); f.objects.clear(); await expect(completeSourceUpload(actor, { importId: f.created.importId }, f.deps)).rejects.toThrow(); expect(f.tables.import_sheets ?? []).toHaveLength(0);
  });
  it.each(["size", "mime", "sha"])("rejects incorrect storage %s evidence", async (kind) => {
    const f = await fixture(), original = f.deps.download;
    f.deps.download = async (path) => { const object = await original(path); if (kind === "size") object.size++; if (kind === "mime") object.mimeType = "text/plain"; if (kind === "sha") object.bytes = new Uint8Array(object.bytes.length); return object; };
    await expect(completeSourceUpload(actor, { importId: f.created.importId }, f.deps)).rejects.toMatchObject({ code: "SOURCE_MISMATCH" }); expect(f.tables.import_sheets ?? []).toHaveLength(0);
  });
  it("suggests only a matching unit/header profile created by active RST authority", async () => {
    const f = await fixture(); await completeSourceUpload(actor, { importId: f.created.importId }, f.deps);
    const parsed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1" });
    const rstId = "20000000-0000-4000-8000-000000000002", profileId = "30000000-0000-4000-8000-000000000002";
    f.tables.profiles = [{ id: rstId, status: "ACTIVE" }]; f.tables.user_role_assignments = [{ user_id: rstId, role: "RST_REVIEWER" }];
    f.tables.mapping_profiles = [{ id: profileId, unit_induk_id: unitId, created_by: rstId, layout_hash: headerFingerprint(parsed.layout.selected!), name: "Approved synthetic", rule_version: "synthetic-v1" }];
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).suggestedProfile?.id).toBe(profileId);
    f.tables.mapping_profiles[0].unit_induk_id = "10000000-0000-4000-8000-000000000002"; expect((await loadAssetImport(actor, f.created.importId, f.deps)).suggestedProfile).toBeUndefined();
    f.tables.mapping_profiles[0].unit_induk_id = unitId; f.tables.mapping_profiles[0].layout_hash = "f".repeat(64); expect((await loadAssetImport(actor, f.created.importId, f.deps)).suggestedProfile).toBeUndefined();
    f.tables.mapping_profiles[0].layout_hash = headerFingerprint(parsed.layout.selected!); f.tables.user_role_assignments[0].role = "UNIT_OPERATOR"; expect((await loadAssetImport(actor, f.created.importId, f.deps)).suggestedProfile).toBeUndefined();
  });
  it("persists confirmed column indexes and resumes selected mapping", async () => {
    const f = await fixture(); await completeSourceUpload(actor, { importId: f.created.importId }, f.deps);
    const parsed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1" });
    await saveImportMapping(actor, { importId: f.created.importId, mapping: parsed.layout.selected!, ruleVersion: "synthetic-v1", layoutHash: parsed.layoutHash, canonicalHash: parsed.canonicalHash }, f.deps);
    expect(f.tables.import_column_mappings[0]).toMatchObject({ source_column_index: 1, confirmed_by: actor.userId });
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).stage).toBe("READY_TO_PROCESS");
    expect(f.tables.mapping_profiles ?? []).toHaveLength(0);
  });
  it("never submits before a finalized zero-error run", async () => {
    const f = await fixture(); await expect(submitAssetVersion(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "NOT_READY" }); expect(f.events).not.toContain("submit");
  });
  it("signs only non-upsert private objects and verifies metadata before downloading", async () => {
    const signed = vi.fn(async (path: string) => ({ data: { path, token: "synthetic" }, error: null }));
    const info = vi.fn(async () => ({ data: { metadata: { size: 2, mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }, error: null }));
    const download = vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2])]), error: null }));
    const from = vi.fn(() => ({ createSignedUploadUrl: signed, info, download }));
    const deps = createImportDependencies({ storage: { from } } as unknown as SupabaseClient<Database>);
    expect(await deps.sign("synthetic/scoped.xlsx")).toEqual({ path: "synthetic/scoped.xlsx", token: "synthetic" });
    expect(from).toHaveBeenCalledWith("source-files"); expect(signed).toHaveBeenCalledWith("synthetic/scoped.xlsx", { upsert: false });
    expect((await deps.download("synthetic/scoped.xlsx")).bytes).toEqual(new Uint8Array([1, 2]));
    info.mockResolvedValue({ data: { metadata: { size: 52428801, mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }, error: null });
    download.mockClear(); await expect(deps.download("synthetic/scoped.xlsx")).rejects.toThrow(); expect(download).not.toHaveBeenCalled();
  });
  it("accepts the installed Storage info endpoint's top-level size/contentType shape", async () => {
    const deps = createImportDependencies({ storage: { from: () => ({
      info: async () => ({ data: { id: "synthetic-id", version: "v1", name: "file.xlsx", bucketId: "source-files", createdAt: "2026-10-16T00:00:00Z", size: 2, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, error: null }),
      download: async () => ({ data: new Blob([new Uint8Array([1, 2])]), error: null }),
    }) } } as unknown as SupabaseClient<Database>);
    expect((await deps.download("scoped/file.xlsx")).size).toBe(2);
  });
});
