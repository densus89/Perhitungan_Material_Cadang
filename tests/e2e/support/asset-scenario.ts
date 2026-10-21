import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect as baseExpect, type Page, type Request, type Response } from "@playwright/test";
import ExcelJS from "exceljs";
import type { Database } from "../../../src/lib/supabase/database";
import { importResponseSchema, type ImportResponse } from "../../../src/domain/asset-import/schemas";
import { parseE2eEnvironment } from "./environment";
import { createE2EAdminClient, requireE2eData, requireE2eSuccess } from "./users";
import { workbookBytes } from "../../fixtures/asset-workbooks";

const marker = "material-cadang-asset-e2e-v1";
// Hosted cold routes and local first compilation can exceed Playwright's 5s default.
// Wait for the actual page state, without sleeping or retrying mutations.
const expect = baseExpect.configure({ timeout: 30000 });
type Identity = { id: string; email: string; role: "UNIT_OPERATOR" | "RST_REVIEWER" };
export type ProcessObservation = { status: number; durationMs: number; body: ImportResponse };
export type AssetScenario = {
  runId: string; unitId: string; otherUnitId: string; unitCode: string; otherUnitCode: string;
  client: SupabaseClient<Database>; users: Partial<Record<"operator" | "other" | "reviewer", Identity>>;
  processDurationsMs: number[]; processResponses: ProcessObservation[];
  fileName(name: string): string;
  status(versionId: string): Promise<string>;
  assertPrivateSource(importId: string): Promise<void>;
};
export async function createAssetScenario(): Promise<AssetScenario> {
  const env = parseE2eEnvironment(process.env), client = createE2EAdminClient(env), runId = randomUUID();
  const unitId = randomUUID(), otherUnitId = randomUUID(), unitCode = `E2E-ASSET-${runId}`, otherUnitCode = `E2E-OTHER-${runId}`;
  const scenario: AssetScenario = {
    runId, unitId, otherUnitId, unitCode, otherUnitCode, client, users: {}, processDurationsMs: [], processResponses: [],
    fileName: name => `synthetic-${runId}-${name}.xlsx`,
    async status(versionId) { const row = requireE2eData(await client.from("dataset_versions").select("status").eq("id", versionId).single(), "version status"); return row.status; },
    async assertPrivateSource(importId) {
      const session = requireE2eData(await client.from("import_sessions").select("source_file_id,unit_induk_id").eq("id", importId).single(), "private source session");
      if (session.unit_induk_id !== unitId) throw new Error("Synthetic source scope mismatch");
      const source = requireE2eData(await client.from("source_files").select("object_path,sha256").eq("id", session.source_file_id).single(), "private source");
      const anonymous = await fetch(`${env.supabaseUrl}/storage/v1/object/public/source-files/${source.object_path}`);
      expect(anonymous.ok).toBe(false);
      const foreign = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      requireE2eSuccess(await foreign.auth.signInWithPassword({ email: scenario.users.other!.email, password: env.password }), "private foreign session");
      expect((await foreign.storage.from("source-files").createSignedUrl(source.object_path, 60)).error).toBeTruthy();
      const signed = requireE2eData(await client.storage.from("source-files").createSignedUrl(source.object_path, 60), "authorized signed source");
      const response = await fetch(signed.signedUrl); expect(response.status).toBe(200);
      expect(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex")).toBe(source.sha256);
      await foreign.auth.signOut();
    },
  };
  try {
    requireE2eSuccess(await client.from("unit_induk").insert([{ id: unitId, code: unitCode, name: `Synthetic asset ${runId}` }, { id: otherUnitId, code: otherUnitCode, name: `Synthetic other ${runId}` }]), "isolated unit creation");
    for (const kind of ["operator", "other", "reviewer"] as const) {
      const role = kind === "reviewer" ? "RST_REVIEWER" : "UNIT_OPERATOR", email = `asset-${kind}-${runId}.synthetic@pln.co.id`;
      const created = requireE2eData(await client.auth.admin.createUser({ email, password: env.password, email_confirm: true, app_metadata: { e2e_marker: marker, asset_run_id: runId }, user_metadata: { display_name: `Synthetic asset ${kind}` } }), "isolated user creation").user;
      if (!created || created.email !== email) throw new Error("Synthetic asset identity creation failed");
      scenario.users[kind] = { id: created.id, email, role };
      requireE2eSuccess(await client.from("profiles").update({ status: "ACTIVE" }).eq("id", created.id), "isolated activation");
      requireE2eSuccess(await client.from("user_role_assignments").insert({ user_id: created.id, role }), "isolated role");
      if (role === "UNIT_OPERATOR") requireE2eSuccess(await client.from("user_unit_assignments").insert({ user_id: created.id, unit_induk_id: kind === "other" ? otherUnitId : unitId }), "isolated assignment");
    }
    return scenario;
  } catch (error) { await cleanupAssetScenario(scenario); throw error; }
}

export async function cleanupAssetScenario(scenario: AssetScenario, options: { timeoutMs?: number } = {}) {
  const { client, unitId, otherUnitId, runId } = scenario;
  // Verify exact IDs, unique codes and authenticated metadata before any purge.
  for (const [id, code] of [[unitId, scenario.unitCode], [otherUnitId, scenario.otherUnitCode]]) {
    const result = await client.from("unit_induk").select("code").eq("id", id).maybeSingle();
    requireE2eSuccess(result, "isolated cleanup verification");
    if (result.data && result.data.code !== code) throw new Error("Refusing synthetic cleanup: unit marker mismatch");
  }
  const users = Object.values(scenario.users);
  for (const user of users) {
    const actual = requireE2eData(await client.auth.admin.getUserById(user.id), "isolated user verification").user;
    if (!actual || actual.id !== user.id || actual.email !== user.email || actual.app_metadata.e2e_marker !== marker || actual.app_metadata.asset_run_id !== runId) throw new Error("Refusing synthetic cleanup: identity marker mismatch");
  }
  const files = requireE2eData(await client.from("source_files").select("object_path,unit_induk_id").in("unit_induk_id", [unitId, otherUnitId]), "isolated source cleanup lookup");
  for (const file of files) if (!file.object_path.startsWith(`unit/${file.unit_induk_id}/`) || ![unitId, otherUnitId].includes(file.unit_induk_id)) throw new Error("Refusing synthetic source cleanup");
  if (files.length) requireE2eSuccess(await client.storage.from("source-files").remove(files.map(file => file.object_path)), "isolated source cleanup");
  const directory = await mkdtemp(join(tmpdir(), "asset-e2e-cleanup-"));
  try {
    const ids = `'${unitId}'::uuid,'${otherUnitId}'::uuid`, actors = users.length ? users.map(user => `'${user.id}'::uuid`).join(",") : "null::uuid";
    const sql = ["begin;", `do $$begin if exists(select 1 from public.unit_induk where id in (${ids}) and code not in ('${scenario.unitCode}','${scenario.otherUnitCode}')) then raise exception 'Synthetic marker mismatch'; end if; end$$;`,
      // Transaction-local trigger suppression affects this cleanup connection only.
      // It permits exact synthetic approved-history deletion without weakening any API.
      "set local session_replication_role=replica;",
      ...["asset_version_changes", "asset_import_run_metadata", "asset_import_chunks", "asset_valuations", "asset_snapshot_rows", "asset_import_runs", "import_column_mappings", "mapping_profiles", "version_comparisons", "import_sheets", "import_sessions", "source_files"].map(table => `delete from public.${table} where unit_induk_id in (${ids});`),
      `delete from public.approval_events where dataset_version_id in(select v.id from public.dataset_versions v join public.datasets d on d.id=v.dataset_id where d.unit_induk_id in (${ids}));`,
      `delete from public.audit_events where actor_id in (${actors});`,
      `delete from public.dataset_versions where dataset_id in(select id from public.datasets where unit_induk_id in (${ids}));`,
      `delete from public.datasets where unit_induk_id in (${ids});`, `delete from public.user_unit_assignments where unit_induk_id in (${ids});`, `delete from public.unit_induk where id in (${ids});`, "commit;"].join("\n");
    const path = join(directory, "cleanup.sql"); await writeFile(path, sql);
    const result = spawnSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "db", "query", "--linked", "--file", path, "--output", "json", "--agent", "no"], { encoding: "utf8", timeout: options.timeoutMs ?? 120000 });
    if (result.status !== 0) {
      const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
      const projectRef = new URL(parseE2eEnvironment(process.env).supabaseUrl).hostname.split(".")[0];
      if (!accessToken || !/^[a-z0-9]{20}$/.test(projectRef)) throw new Error(`Synthetic asset cleanup failed for run ${runId}; exact resources retained for recovery`);
      const fallback = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
      });
      if (!fallback.ok) throw new Error(`Synthetic asset cleanup failed for run ${runId}; exact resources retained for recovery`);
    }
    const remainingChunks = await client.from("asset_import_chunks").select("import_run_id", { count: "exact", head: true }).in("completed_by", users.map(user => user.id));
    requireE2eSuccess(remainingChunks, "isolated manifest cleanup proof");
    if (remainingChunks.count !== 0) throw new Error("Synthetic manifest cleanup incomplete");
    for (const user of users) requireE2eSuccess(await client.auth.admin.deleteUser(user.id), "isolated user cleanup");
    const remaining = requireE2eData(await client.from("unit_induk").select("id").in("id", [unitId, otherUnitId]), "isolated cleanup proof");
    if (remaining.length) throw new Error("Synthetic unit cleanup incomplete");
    console.log(JSON.stringify({ scenario: "asset-import-cleanup", runId, units: 0, manifestChunks: 0, sourceObjectsRemoved: files.length, usersRemoved: users.length }));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function loginAssetActor(page: Page, scenario: AssetScenario, kind: keyof AssetScenario["users"]) {
  const user = scenario.users[kind]; if (!user) throw new Error("Synthetic actor absent");
  await page.goto("/login/"); await page.getByLabel("Email PLN").fill(user.email); await page.getByLabel("Kata sandi").fill(process.env.E2E_TEST_PASSWORD!); await page.getByRole("button", { name: "Masuk", exact: true }).click(); await expect(page).toHaveURL(/\/ringkasan\/$/);
}
type UploadOptions = { previewTimeoutMs?: number; processTimeoutMs?: number };
type AssetWorkbookInput = string | { name: string; mimeType: string; buffer: Buffer };
function isProcessRequest(request: Request) {
  return request.method() === "POST" && new URL(request.url()).pathname.endsWith("/process/");
}
async function waitForProcessResult(page: Page, scenario: AssetScenario, action: () => Promise<void>, options: UploadOptions = {}): Promise<ImportResponse> {
  const starts = new Map<Request, number>();
  let settle: ((result: ImportResponse) => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<ImportResponse>((resolveResult, reject) => { settle = resolveResult; rejectResult = reject; });
  const armResponseTimeout = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => rejectResult?.(new Error("Synthetic processing did not reach the next response")), options.processTimeoutMs ?? 300000);
  };
  const onRequest = (request: Request) => {
    if (!isProcessRequest(request)) return;
    starts.set(request, Date.now());
    armResponseTimeout();
  };
  const onResponse = (response: Response) => {
    if (!isProcessRequest(response.request())) return;
    void (async () => {
      try {
        const body = importResponseSchema.parse(await response.json());
        const observation = { status: response.status(), durationMs: Date.now() - (starts.get(response.request()) ?? Date.now()), body };
        scenario.processResponses.push(observation); scenario.processDurationsMs.push(observation.durationMs);
        if (![200, 202].includes(observation.status)) throw new Error(`Synthetic processing failed with HTTP ${observation.status}`);
        if (body.stage !== "PROCESSING") settle?.(body); else armResponseTimeout();
      } catch (error) { rejectResult?.(error instanceof Error ? error : new Error("Synthetic process response was invalid")); }
    })();
  };
  page.on("request", onRequest); page.on("response", onResponse);
  armResponseTimeout();
  try { await action(); return await result; }
  finally { if (timeout) clearTimeout(timeout); page.off("request", onRequest); page.off("response", onResponse); }
}
async function startAssetWorkbookInput(page: Page, input: AssetWorkbookInput, options: UploadOptions = {}) {
  const uploadExpect = baseExpect.configure({ timeout: options.previewTimeoutMs ?? 30000 });
  await page.getByLabel("Berkas snapshot XLSX").setInputFiles(input);
  await uploadExpect(page.getByRole("heading", { name: "Konfirmasi sheet, header & target" })).toBeVisible();
  await uploadExpect(page.getByLabel(/Saya mengonfirmasi pemetaan sheet/)).toBeEnabled();
  await page.getByLabel(/Saya mengonfirmasi pemetaan sheet/).check();
  await page.getByRole("button", { name: "Unggah dan proses di server" }).click();
}
async function uploadAssetInput(page: Page, scenario: AssetScenario, input: AssetWorkbookInput, options: UploadOptions = {}): Promise<ImportResponse> {
  const result = await waitForProcessResult(page, scenario, () => startAssetWorkbookInput(page, input, options), options);
  const uploadExpect = baseExpect.configure({ timeout: options.previewTimeoutMs ?? 30000 });
  await uploadExpect(page.getByRole("heading", { name: "Kualitas & bukti nilai" })).toBeVisible();
  return result;
}
export async function startAssetWorkbookPath(page: Page, path: string, options: UploadOptions = {}) {
  await startAssetWorkbookInput(page, path, options);
}
export async function continueAssetProcessing(page: Page, scenario: AssetScenario, options: UploadOptions = {}) {
  return waitForProcessResult(page, scenario, async () => { await page.getByRole("button", { name: "Lanjutkan proses" }).click(); }, options);
}
export async function uploadAssetWorkbookPath(page: Page, scenario: AssetScenario, path: string, options: UploadOptions = {}): Promise<ImportResponse> {
  return uploadAssetInput(page, scenario, path, options);
}
export async function uploadAssetWorkbook(page: Page, scenario: AssetScenario, name: string, options: { invalid?: boolean; revised?: boolean } = {}): Promise<ImportResponse> {
  const headers = ["UNIT_INDUK", "UPT", "NAMA_GI", "TID", "NO_ASET", "NAMA_PERALATAN", "SPESIFIKASI_MARA", "JUMLAH", "SATUAN", "KONDISI_ASET", "USIA_ASET_TAHUN", "NILAI_BUKU_SAP", "HARGA_PENGADAAN_SAAT_INI"];
  const row = [scenario.unitCode, "UPT SYNTHETIC", "GI SYNTHETIC", "T-01", "A-01", "TRAFO", "150/20 kV 60 MVA", 1, "UNIT", options.invalid ? "PX" : "P2", 10, options.revised ? 125 : 0, 500];
  const buffer = Buffer.from(await workbookBytes([{ name: "DATA_ASET", rows: [headers, row, [...row.slice(0, 3), "T-02", "A-02", ...row.slice(5, 11), 100, 600]] }]));
  return uploadAssetInput(page, scenario, { name: scenario.fileName(name), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
}

export async function writeSyntheticAssetWorkbook(path: string, scenario: AssetScenario, rowCount: number) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useSharedStrings: false, useStyles: false });
  const sheet = workbook.addWorksheet("DATA_ASET");
  sheet.addRow([
    "UNIT_INDUK", "UPT", "NAMA_GI", "TID", "NO_ASET", "NAMA_PERALATAN", "SPESIFIKASI_MARA",
    "JUMLAH", "SATUAN", "KONDISI_ASET", "USIA_ASET_TAHUN", "NILAI_BUKU_SAP", "HARGA_PENGADAAN_SAAT_INI",
  ]).commit();
  for (let index = 0; index < rowCount; index++) {
    sheet.addRow([
      scenario.unitCode,
      `UPT SYNTHETIC ${index % 10}`,
      `GI SYNTHETIC ${index % 100}`,
      `T-${index}`,
      `A-${index}`,
      "TRAFO",
      `150/20 kV 60 MVA SYNTHETIC ${index % 14}`,
      1,
      "UNIT",
      `P${index % 5}`,
      10 + index % 20,
      1_000_000 + index,
      4_000_000,
    ]).commit();
  }
  await workbook.commit();
}
