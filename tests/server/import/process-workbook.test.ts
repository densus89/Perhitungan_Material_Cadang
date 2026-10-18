// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processStoredWorkbook, persistedRecordHashes, postgresJsonb, insertInWindows } from "../../../src/server/import/process-workbook";
import { completeSourceUpload, saveImportMapping, submitAssetVersion, loadAssetImport, createAssetImport } from "../../../src/server/import/service";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
import { fixture } from "./lifecycle-fixture";
import { actor } from "./fakes";
import { assetRow, headers } from "../../fixtures/asset-workbooks";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
async function prepared(rows?: unknown[][], labels?: string[]) {
  const f = await fixture(rows, labels); await completeSourceUpload(actor, { importId: f.created.importId }, f.deps);
  const parsed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1" });
  await saveImportMapping(actor, { importId: f.created.importId, mapping: parsed.layout.selected!, ruleVersion: "synthetic-v1", layoutHash: parsed.layoutHash, canonicalHash: parsed.canonicalHash }, f.deps);
  return f;
}
describe("authoritative workbook processing", () => {
  it("keeps an RST return blocked until a later complete run is ready, then enables resubmission", async () => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps);
    f.tables.dataset_versions[0].status = "NEEDS_FIX";
    f.tables.dataset_versions[0].updated_at = "2026-10-16T01:00:00.000Z";
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).stage).toBe("NEEDS_FIX");
    f.deps.now = () => "2026-10-16T02:00:00.000Z";
    const result = await processStoredWorkbook(actor, f.created.importId, f.deps);
    expect(result.stage).toBe("READY_TO_SUBMIT");
    expect((await submitAssetVersion(actor, f.created.importId, f.deps)).stage).toBe("PENDING_RST");
    expect(f.tables.datasets[0].active_version_id ?? null).toBeNull();
  });
  it("serializes PostgreSQL JSONB field ordering and numeric evidence", () => {
    expect(postgresJsonb({ zzz: 1e-7, b: ["a", 1e21], aa: { z: 0, a: true } })).toBe('{"b": ["a", 1000000000000000000000], "aa": {"a": true, "z": 0}, "zzz": 0.0000001}');
    expect(persistedRecordHashes([], [])).toEqual({ rowsHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", valuationsHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" });
  });
  it("hashes persisted records independently of execution time and append-only approvals", () => {
    const rows = [{ id: "r", import_sheet_id: "s", source_row_number: 1, created_at: "one" }], values = [{ asset_row_id: "r", nilai_abc: 0, approved_by: null, approved_at: null, approval_notes: null, created_at: "one" }];
    const hashes = persistedRecordHashes(rows, values);
    expect(persistedRecordHashes([{ ...rows[0], created_at: "two" }], [{ ...values[0], approved_by: "rst", approved_at: "two", approval_notes: "Reviewed", created_at: "two" }])).toEqual(hashes);
    expect(persistedRecordHashes([{ ...rows[0], source_row_number: 2 }], values).rowsHash).not.toBe(hashes.rowsHash);
    expect(persistedRecordHashes(rows, [{ ...values[0], nilai_abc: 1 }]).valuationsHash).not.toBe(hashes.valuationsHash);
  });
  it("writes 1001 rows in one hosted-safe complete batch", async () => {
    const f = await prepared(Array.from({ length: 1001 }, (_, index) => assetRow.map((value, column) => column === 4 ? String(index).padStart(6, "0") : value)));
    const result = await processStoredWorkbook(actor, f.created.importId, f.deps);
    expect(result.summary?.rowCount).toBe(1001); expect(f.events.filter((event) => event.startsWith("insert:asset_snapshot_rows:"))).toEqual(["insert:asset_snapshot_rows:1001"]);
    expect(f.events.filter((event) => event.startsWith("insert:asset_valuations:"))).toEqual(["insert:asset_valuations:1001"]);
  }, 30000);
  it("caps packed 3000-row writes at two concurrent hosted requests", async () => {
    let active = 0, maximum = 0;
    const sizes: number[] = [];
    const deps = {
      insertAssetBatch: async (_actorId: string, _runId: string, rows: unknown[], valuations: unknown[]) => {
        active += 1; maximum = Math.max(maximum, active); sizes.push(rows.length);
        expect(valuations).toHaveLength(rows.length);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active -= 1;
      },
    } as unknown as Parameters<typeof insertInWindows>[4];
    const records = Array.from({ length: 6501 }, (_, id) => ({ id })) as never;
    await insertInWindows("actor", "run", records, records, deps);
    expect(maximum).toBe(2);
    expect(sizes).toEqual([3000, 3000, 501]);
  });
  it("downloads stored bytes, finalizes rows and summary, then permits submission without activation", async () => {
    const f = await prepared(); const result = await processStoredWorkbook(actor, f.created.importId, f.deps);
    expect(f.tables.asset_snapshot_rows[0].provenance).toEqual({ sheetName: "DATA", rowNumber: 2 });
    expect(f.tables.asset_valuations[0].calculation_evidence).toMatchObject({ sourceField: "nilaiBukuSap", sourceAddress: "M2", ageYears: 10 });
    expect(JSON.stringify(f.tables.asset_valuations[0].calculation_evidence)).not.toMatch(/sourceCell|policy|rawValue/);
    expect(result.stage).toBe("READY_TO_SUBMIT"); expect(f.tables.asset_snapshot_rows[0].no_aset).toBe("000002"); expect(f.tables.asset_valuations[0].nilai_abc).toBe(0);
    expect(f.tables.import_sessions[0].current_run_id).toBe(f.tables.asset_import_runs[0].id);
    expect(f.events.indexOf("finalize")).toBeGreaterThan(f.events.indexOf("insert:asset_valuations:1"));
    expect(result.summary).toMatchObject({ rowCount: 1, blockingErrors: 0, valueSources: { SAP_BOOK_VALUE: 1 }, totalNilaiABC: 0 });
    expect((await submitAssetVersion(actor, f.created.importId, f.deps)).stage).toBe("PENDING_RST"); expect(f.tables.datasets[0].active_version_id ?? null).toBeNull();
  });
  it("rejects changed stored bytes and browser canonical mismatch before batch insertion", async () => {
    const f = await prepared(); f.tables.import_sheets[0].diagnostics = { ...(f.tables.import_sheets[0].diagnostics as object), canonicalHash: "f".repeat(64) };
    await expect(processStoredWorkbook(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "PREVIEW_MISMATCH" }); expect(f.tables.asset_snapshot_rows ?? []).toHaveLength(0);
    f.objects.set(f.created.upload!.path, new Uint8Array([0])); await expect(processStoredWorkbook(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "SOURCE_MISMATCH" });
  });
  it("preserves prior current run on failed batch and retries with a new run", async () => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps); const prior = f.tables.import_sessions[0].current_run_id;
    f.fail("asset_valuations"); await expect(processStoredWorkbook(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "PROCESS_FAILED" });
    expect(f.tables.asset_import_runs[1]).toMatchObject({ status: "FAILED", failure_code: "PROCESS_FAILED" }); expect(f.tables.import_sessions[0].current_run_id).toBe(prior);
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).stage).toBe("FAILED");
    f.fail(""); await processStoredWorkbook(actor, f.created.importId, f.deps); expect(f.tables.import_sessions[0].current_run_id).not.toBe(prior); expect(f.tables.asset_import_runs).toHaveLength(3);
  });
  it("compares active rows only after finalization and retains the active pointer on submit", async () => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps);
    f.tables.datasets[0].active_version_id = f.created.versionId; f.tables.dataset_versions[0].status = "ACTIVE";
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).comparison).toMatchObject({ hasActiveVersion: false, counts: { ADDED: 1 } });
    const next = await createAssetImport(actor, f.input, f.deps); f.objects.set(next.upload!.path, f.bytes);
    await completeSourceUpload(actor, { importId: next.importId }, f.deps);
    const parsed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1" });
    await saveImportMapping(actor, { importId: next.importId, mapping: parsed.layout.selected!, ruleVersion: "synthetic-v1", layoutHash: parsed.layoutHash, canonicalHash: parsed.canonicalHash }, f.deps);
    f.fail("asset_version_changes");
    await expect(processStoredWorkbook(actor, next.importId, f.deps)).rejects.toMatchObject({ code: "COMPARISON_FAILED" });
    expect(f.tables.asset_import_runs[1].status).toBe("COMPLETE");
    await expect(submitAssetVersion(actor, next.importId, f.deps)).rejects.toMatchObject({ code: "NOT_READY" });
    f.fail("");
    await processStoredWorkbook(actor, next.importId, f.deps);
    expect(f.tables.version_comparisons[0].summary).toMatchObject({ counts: { UNCHANGED: 1, ADDED: 0, REMOVED: 0, CHANGED: 0 }, after: { rowCount: 1 } });
    expect(f.events.lastIndexOf("insert:version_comparisons:1")).toBeGreaterThan(f.events.lastIndexOf("finalize"));
    expect(f.tables.asset_version_changes[0]).toMatchObject({ change_kind: "UNCHANGED", identity_key: "ASSET:000002" });
    await submitAssetVersion(actor, next.importId, f.deps); expect(f.tables.datasets[0].active_version_id).toBe(f.created.versionId);
  });
  it("refuses stale finalized mappings until the newly confirmed layout is processed", async () => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps);
    const parsed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1" });
    const mapping = { ...parsed.layout.selected!, columns: parsed.layout.selected!.columns.map((column) => column.field === "kondisiAset" ? { ...column, field: null } : column) };
    const changed = await readAssetWorkbook(f.bytes, { ruleVersion: "synthetic-v1", confirmedMapping: mapping });
    await saveImportMapping(actor, { importId: f.created.importId, mapping, ruleVersion: "synthetic-v1", layoutHash: changed.layoutHash, canonicalHash: changed.canonicalHash }, f.deps);
    expect((await loadAssetImport(actor, f.created.importId, f.deps)).stage).toBe("READY_TO_PROCESS");
    await expect(submitAssetVersion(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "NOT_READY" });
  });
  it("detects incomplete persisted batches before finalization", async () => {
    const f = await prepared();
    f.deps.insertAssetBatch = async (_actorId, _runId, rows) => { await f.deps.insert("asset_snapshot_rows", rows); };
    await expect(processStoredWorkbook(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "PROCESS_FAILED" });
    expect(f.events).toContain("finalize");
    expect(f.tables.asset_import_runs[0].status).toBe("FAILED");
    expect(f.tables.import_sessions[0].current_run_id ?? null).toBeNull();
    expect(f.tables.asset_import_run_metadata ?? []).toHaveLength(0);
  });
  it("rejects unavailable effective reference rules without creating a run", async () => {
    const f = await prepared(); f.tables.useful_life_rules = [];
    await expect(processStoredWorkbook(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "REFERENCE_UNAVAILABLE" }); expect(f.tables.asset_import_runs ?? []).toHaveLength(0);
  });
  it("skips only nearest-location estimation when coordinates are missing and uses national donors", async () => {
    const target = [...assetRow.slice(0, -1), null, "10600", "07", "102"];
    const f = await prepared([target], [...headers, "KODE_CLASS_ASSET", "KODE_JENIS", "KODE_SUBJENIS"]);
    const donorUnit = "10000000-0000-4000-8000-000000000002", donorVersion = "60000000-0000-4000-8000-000000000001", donorRun = "70000000-0000-4000-8000-000000000001", donorId = "80000000-0000-4000-8000-000000000001";
    f.tables.datasets.push({ id: "90000000-0000-4000-8000-000000000001", unit_induk_id: donorUnit, type: "ASSET", active_version_id: donorVersion });
    f.tables.import_sessions.push({ id: "60000000-0000-4000-8000-000000000002", unit_induk_id: donorUnit, dataset_version_id: donorVersion, current_run_id: donorRun });
    f.tables.asset_import_runs = [{ id: donorRun, status: "COMPLETE" }];
    f.tables.asset_snapshot_rows = [{ id: donorId, import_run_id: donorRun, unit_induk_id: donorUnit, unit_induk: "OTHER UNIT", upt: "OTHER UPT", nama_gi: "OTHER GI", no_aset: "OTHER", nama_peralatan: "TRAFO", spesifikasi_mara: "150/20 kV 60 MVA", satuan: "UNIT", tanggal_operasi: null, usia_aset_tahun: 10, kode_class_asset: "10600", kode_jenis: "07", kode_subjenis: "102", nilai_buku_sap: 1000, nilai_abc_input: null, harga_pengadaan_saat_ini: 1000, tanggal_referensi_harga: "2026-10-16" }];
    const result = await processStoredWorkbook(actor, f.created.importId, f.deps);
    expect(result.summary?.valueSources).toEqual({ ESTIMATED_NATIONAL: 1 });
    expect(f.tables.asset_valuations[0]).toMatchObject({ nilai_abc: 750, selected_donor_ids: [donorId] });
    expect(f.tables.asset_valuations[0].warning_codes).toContain("MISSING_GI_COORDINATES"); expect(JSON.stringify(result)).not.toContain(donorId);
  });
  it("blocks submission of a finalized run with required-field errors", async () => {
    const row = [...assetRow]; row[9] = null; const f = await prepared([row]);
    const result = await processStoredWorkbook(actor, f.created.importId, f.deps); expect(result.stage).toBe("NEEDS_FIX"); expect(result.summary!.blockingErrors).toBeGreaterThan(0);
    await expect(submitAssetVersion(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "NOT_READY" }); expect(f.events).not.toContain("submit");
  });
  it("persists identifiable assets with blank quantity or unit and blocks incomplete snapshot submission", async () => {
    const valid = [...assetRow]; valid[4] = "000001";
    const missingQuantity = [...assetRow]; missingQuantity[4] = "000002"; missingQuantity[7] = null;
    const missingUnit = [...assetRow]; missingUnit[4] = "000003"; missingUnit[8] = null;
    const f = await prepared([valid, missingQuantity, missingUnit]);
    const result = await processStoredWorkbook(actor, f.created.importId, f.deps);
    expect(result).toMatchObject({ stage: "NEEDS_FIX", summary: { rowCount: 3, blockingErrors: 2 } });
    expect(f.tables.asset_snapshot_rows.map((row) => row.no_aset)).toEqual(["000001", "000002", "000003"]);
    expect(f.tables.asset_snapshot_rows[1].error_codes).toContain("MISSING_REQUIRED_FIELD");
    expect(f.tables.asset_snapshot_rows[2].error_codes).toContain("MISSING_REQUIRED_FIELD");
    await expect(submitAssetVersion(actor, f.created.importId, f.deps)).rejects.toMatchObject({ code: "NOT_READY" });
    expect(f.events).not.toContain("submit");
  });
  it("flags workbook rows that claim a different unit from the scoped upload", async () => {
    const row = [...assetRow]; row[0] = "OTHER UNIT"; const f = await prepared([row]);
    const result = await processStoredWorkbook(actor, f.created.importId, f.deps);
    expect(result.stage).toBe("NEEDS_FIX"); expect(f.tables.asset_snapshot_rows[0].error_codes).toContain("UNIT_SCOPE_MISMATCH");
  });
  it.runIf(process.env.ASSET_IMPORT_POSTGRES_HASH_CHECK === "1")("matches real PostgreSQL typed-record digests without persisting any data", async () => {
    const f = await prepared(); await processStoredWorkbook(actor, f.created.importId, f.deps);
    f.tables.asset_snapshot_rows[0].provenance = { "é": "Synthetic \\\"\\n", a: 1e-7, bb: 1e21, nested: [true, null, { z: 2.5, a: 0 }] };
    const rows = f.tables.asset_snapshot_rows, values = f.tables.asset_valuations;
    const expected = persistedRecordHashes(rows, values);
    const literal = (value: unknown) => "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
    const sql = `with r as (select * from jsonb_populate_recordset(null::public.asset_snapshot_rows, ${literal(rows)})), v as (select * from jsonb_populate_recordset(null::public.asset_valuations, ${literal(values)})) select (select encode(extensions.digest(coalesce(string_agg(encode(extensions.digest((to_jsonb(r)-'created_at')::text,'sha256'),'hex'),'' order by r.import_sheet_id,r.source_row_number),''),'sha256'),'hex') from r) as rows_hash, (select encode(extensions.digest(coalesce(string_agg(encode(extensions.digest((to_jsonb(v)-array['created_at','approved_by','approved_at','approval_notes'])::text,'sha256'),'hex'),'' order by v.asset_row_id),''),'sha256'),'hex') from v) as valuations_hash`;
    const result = spawnSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "db", "query", "--linked", sql, "--output", "json", "--output-format", "text", "--agent", "no"], { encoding: "utf8", timeout: 60000 });
    expect(result.status, "read-only linked PostgreSQL hash check exits successfully").toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([{ rows_hash: expected.rowsHash, valuations_hash: expected.valuationsHash }]);
  }, 70000);
});
