"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_WORKBOOK_BYTES, type ImportDraft, type ImportResponse, type ReviewFilter, type ImportReviewSearch } from "../../domain/asset-import/schemas";
import type { AssetSheetMapping } from "../../domain/asset-import/types";
import { PERDIR_0299_VERSION } from "../../reference/useful-life-perdir-0299";
import type { AssetImportWorkerRequest, AssetImportWorkerResult } from "./asset-import.worker";
import { createAssetImportClient } from "./import-client";

export type LocalPreview = Extract<AssetImportWorkerResult, { type: "result" }>;
export type ImportUnit = { id: string; name: string };
export type ImportStep = "source" | "mapping" | "quality" | "comparison";
function stepFor(response: ImportResponse): ImportStep {
  if (["PENDING_RST", "ACTIVE", "HISTORICAL"].includes(response.stage)) return "comparison";
  if (response.summary) return "quality";
  if (response.stage === "UPLOAD") return "source";
  return "mapping";
}
export function useAssetImport(initialDrafts: ImportDraft[], actorUnits: ImportUnit[]) {
  const api = useMemo(() => createAssetImportClient(), []);
  const worker = useRef<Worker | null>(null);
  const inFlight = useRef(false);
  const [unitId, setUnitId] = useState(actorUnits[0]?.id ?? "");
  const [drafts, setDrafts] = useState(initialDrafts.filter(draft => actorUnits.some(unit => unit.id === draft.unitId)));
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  const [mapping, setMapping] = useState<AssetSheetMapping | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<ImportStep>("source");
  const [filter, setFilter] = useState<ReviewFilter>("ALL");
  const [reviewOptions, setReviewOptions] = useState<ImportReviewSearch>({});
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => () => worker.current?.terminate(), []);

  function remember(next: ImportResponse, selectedFile = file, selectedUnit = unitId) {
    setResponse(next);
    setDrafts(previous => {
      const old = previous.find(draft => draft.importId === next.importId);
      const draft: ImportDraft = { importId: next.importId, datasetId: next.datasetId, versionId: next.versionId, unitId: next.source?.unitId ?? old?.unitId ?? selectedUnit, fileName: next.source?.fileName ?? old?.fileName ?? selectedFile?.name ?? "Snapshot XLSX", createdAt: old?.createdAt ?? new Date().toISOString(), stage: next.stage, rowCount: next.summary?.rowCount ?? old?.rowCount ?? null };
      return [draft, ...previous.filter(item => item.importId !== next.importId)];
    });
  }
  function read(selectedFile: File, nextMapping?: AssetSheetMapping) {
    worker.current?.terminate(); setPreview(null); setConfirmed(false); setReading(true); setError("");
    try {
      const next = new Worker(new URL("./asset-import.worker.ts", import.meta.url), { type: "module" }); worker.current = next;
      next.onmessage = (event: MessageEvent<AssetImportWorkerResult>) => {
        if (worker.current !== next) return;
        const result = event.data;
        if (result.type === "progress") { setMessage(result.message); return; }
        setReading(false);
        if (result.type === "error") { setError(result.message); return; }
        if (response?.source && result.sha256 !== response.source.sha256) { setError("SHA-256 berkas berbeda dari draft. Pilih kembali berkas asli atau mulai impor baru."); return; }
        setPreview(result); setMapping(result.layout.selected ?? result.layout.candidates[0] ?? null); setStep("mapping"); setMessage("Preview lokal siap. Konfirmasikan pemetaan sebelum unggah.");
      };
      next.onerror = () => { if (worker.current === next) { setReading(false); setError("Preview Worker gagal. Pilih kembali berkas untuk mencoba lagi."); } };
      const request: AssetImportWorkerRequest = { file: selectedFile, ruleVersion: response?.ruleVersion ?? PERDIR_0299_VERSION, ...(nextMapping ? { mapping: nextMapping } : {}) };
      next.postMessage(request);
    } catch { setReading(false); setError("Browser tidak dapat menjalankan preview Worker."); }
  }
  function selectFile(selected: File | undefined) {
    if (inFlight.current) return;
    worker.current?.terminate(); worker.current = null; setReading(false); setPreview(null); setMapping(null); setConfirmed(false); setError("");
    if (!selected) { setFile(null); return; }
    if (!/\.xlsx$/i.test(selected.name)) { setFile(null); setError("Gunakan berkas .xlsx."); return; }
    if (selected.size < 1 || selected.size > MAX_WORKBOOK_BYTES) { setFile(null); setError("Ukuran berkas harus 1 byte hingga 50 MiB."); return; }
    setFile(selected); read(selected, response?.layout ?? undefined);
  }
  function changeMapping(next: AssetSheetMapping) { if (busy) return; setMapping(next); setConfirmed(false); if (file) read(file, next); }
  async function recover(id: string) {
    try { const current = await api.load(id); remember(current); setStep(stepFor(current)); }
    catch { /* A deliberate refresh remains available; never restart a mutation. */ }
    setError("Respons terputus atau permintaan gagal. Status tersimpan diperiksa; gunakan Periksa status sebelum mencoba tindakan lagi.");
  }
  async function run() {
    if (inFlight.current || !file || !preview || !mapping || !confirmed || !actorUnits.some(unit => unit.id === unitId)) return;
    inFlight.current = true; setBusy(true); setError(""); setAcknowledged(false);
    let current = response;
    try {
      if (!current) { current = await api.create(unitId, file, preview.sha256); remember(current); }
      if (current.stage === "UPLOAD") { if (!current.upload) throw new Error("Missing signature"); await api.upload(file, current.upload); current = await api.complete(current.importId); remember(current); }
      current = await api.saveMapping(current.importId, mapping, { ruleVersion: preview.ruleVersion, layoutHash: preview.layoutHash, canonicalHash: preview.canonicalHash }); remember(current);
      current = await api.process(current.importId); remember(current); setStep(stepFor(current)); setMessage("Validasi server selesai.");
    } catch { if (current) await recover(current.importId); else setError("Draft belum dapat dipastikan. Muat ulang halaman dan periksa daftar draft sebelum membuat impor baru."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function refresh(id = response?.importId, nextFilter: ReviewFilter = filter, offset = 0, nextOptions: ImportReviewSearch = reviewOptions) {
    if (!id || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const current = await api.load(id, nextFilter, offset, nextOptions); remember(current); setStep(stepFor(current)); setFilter(nextFilter); setReviewOptions(nextOptions); setMessage("Status draft tersimpan dimuat dari server."); }
    catch { setError("Status draft tidak dapat dimuat. Coba Periksa status saat koneksi tersedia."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function resume(draft: ImportDraft) {
    if (busy || !actorUnits.some(unit => unit.id === draft.unitId)) return;
    worker.current?.terminate(); worker.current = null; setResponse(null); setStep("source"); setMessage(""); setFile(null); setPreview(null); setMapping(null); setConfirmed(false); setAcknowledged(false); setUnitId(draft.unitId); setFilter("ALL"); setReading(false);
    await refresh(draft.importId, "ALL", 0, {});
  }
  async function retry() {
    if (!response || inFlight.current || !["READY_TO_PROCESS", "FAILED", "NEEDS_FIX"].includes(response.stage)) return;
    inFlight.current = true; setBusy(true); setAcknowledged(false); setError("");
    try { const current = await api.process(response.importId); remember(current); setStep(stepFor(current)); }
    catch { await recover(response.importId); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function verifyUpload() {
    if (!response || response.stage !== "UPLOAD" || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setConfirmed(false);
    try { const current = await api.complete(response.importId); remember(current); setStep(stepFor(current)); setMessage("Unggahan tersimpan diverifikasi. Konfirmasikan pemetaan sebelum memulai proses."); }
    catch { await recover(response.importId); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function submit() {
    if (!response || inFlight.current || response.stage !== "READY_TO_SUBMIT" || !response.summary || response.summary.blockingErrors || response.summary.issueCounts.AGE_IMPUTED && !acknowledged) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const current = await api.submit(response.importId); remember(current); setStep("comparison"); }
    catch { await recover(response.importId); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function startNew() { if (busy) return; worker.current?.terminate(); worker.current = null; setResponse(null); setFile(null); setPreview(null); setMapping(null); setConfirmed(false); setError(""); setMessage(""); setStep("source"); setReading(false); setAcknowledged(false); setFilter("ALL"); setReviewOptions({}); }
  return { unitId, setUnitId, drafts, response, file, preview, mapping, confirmed, setConfirmed, busy, reading, error, message, step, setStep, filter, reviewOptions, acknowledged, setAcknowledged, selectFile, changeMapping, run, refresh, resume, retry, verifyUpload, submit, startNew };
}
