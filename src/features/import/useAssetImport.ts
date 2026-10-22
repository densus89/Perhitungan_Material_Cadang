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
type PreviewSnapshot = { preview: LocalPreview; mapping: AssetSheetMapping | null; file: File; generation: number };
const PROCESS_CHUNKS_PER_REQUEST = 8;
function stepFor(response: ImportResponse): ImportStep {
  if (["PENDING_RST", "ACTIVE", "HISTORICAL"].includes(response.stage)) return "comparison";
  if (response.summary) return "quality";
  if (response.stage === "UPLOAD") return "source";
  return "mapping";
}
export function useAssetImport(initialDrafts: ImportDraft[], actorUnits: ImportUnit[]) {
  const api = useMemo(() => createAssetImportClient(), []);
  const worker = useRef<Worker | null>(null);
  const previewGeneration = useRef(0);
  const authorityGeneration = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [unitId, setUnitId] = useState(actorUnits[0]?.id ?? "");
  const [drafts, setDrafts] = useState(initialDrafts.filter(draft => actorUnits.some(unit => unit.id === draft.unitId)));
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [mapping, setMapping] = useState<AssetSheetMapping | null>(null);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<PreviewSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<ImportStep>("source");
  const [filter, setFilter] = useState<ReviewFilter>("ALL");
  const [reviewOptions, setReviewOptions] = useState<ImportReviewSearch>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const preview = snapshot?.preview ?? null;
  const previewReady = Boolean(snapshot?.mapping && snapshot.file === file && snapshot.mapping === mapping);
  const confirmed = previewReady && confirmedSnapshot === snapshot;
  useEffect(() => () => {
    mounted.current = false;
    previewGeneration.current++; authorityGeneration.current++;
    worker.current?.terminate(); worker.current = null;
  }, []);

  function cancelPreview() {
    previewGeneration.current++;
    worker.current?.terminate(); worker.current = null; setReading(false);
  }
  function setConfirmed(value: boolean) {
    setConfirmedSnapshot(value && previewReady && !reading && !worker.current && !inFlight.current ? snapshot : null);
  }
  function restoreMapping(selectedFile = file) {
    setMapping(snapshot?.file === selectedFile ? snapshot.mapping : null);
  }
  function beginAuthoritativeTransition(preserveMapping = true) {
    authorityGeneration.current++; cancelPreview(); if (preserveMapping) restoreMapping(); setConfirmed(false);
  }

  function remember(next: ImportResponse, selectedFile = file, selectedUnit = unitId) {
    setResponse(next);
    setDrafts(previous => {
      const old = previous.find(draft => draft.importId === next.importId);
      const draft: ImportDraft = { importId: next.importId, datasetId: next.datasetId, versionId: next.versionId, unitId: next.source?.unitId ?? old?.unitId ?? selectedUnit, fileName: next.source?.fileName ?? old?.fileName ?? selectedFile?.name ?? "Snapshot XLSX", createdAt: old?.createdAt ?? new Date().toISOString(), stage: next.stage, rowCount: next.summary?.rowCount ?? next.progress?.expectedRows ?? old?.rowCount ?? null, ...(next.stage === "PROCESSING" && (next.progress ?? old?.progress) ? { progress: next.progress ?? old?.progress } : {}) };
      return [draft, ...previous.filter(item => item.importId !== next.importId)];
    });
  }
  function read(selectedFile: File, nextMapping?: AssetSheetMapping) {
    cancelPreview(); setConfirmed(false); setReading(true); setError("");
    const requestGeneration = previewGeneration.current;
    const authority = authorityGeneration.current;
    const failed = (message: string) => { setReading(false); restoreMapping(selectedFile); setError(message); };
    try {
      const next = new Worker(new URL("./asset-import.worker.ts", import.meta.url), { type: "module" }); worker.current = next;
      next.onmessage = (event: MessageEvent<AssetImportWorkerResult>) => {
        if (worker.current !== next || previewGeneration.current !== requestGeneration || authorityGeneration.current !== authority) return;
        const result = event.data;
        if (result.type === "progress") { setMessage(result.message); return; }
        next.terminate(); worker.current = null;
        setReading(false);
        if (result.type === "error") { failed(result.message); return; }
        if (response?.source && result.sha256 !== response.source.sha256) { failed("SHA-256 berkas berbeda dari draft. Pilih kembali berkas asli atau mulai impor baru."); return; }
        const selected = result.layout.selected ?? result.layout.candidates[0] ?? null;
        setSnapshot({ preview: result, mapping: selected, file: selectedFile, generation: requestGeneration });
        setMapping(selected); setStep("mapping"); setMessage("Preview lokal siap. Konfirmasikan pemetaan sebelum unggah.");
      };
      next.onerror = () => {
        if (worker.current !== next || previewGeneration.current !== requestGeneration || authorityGeneration.current !== authority) return;
        next.terminate(); worker.current = null; failed("Preview Worker gagal. Pilih sheet atau edit pemetaan untuk mencoba lagi.");
      };
      const request: AssetImportWorkerRequest = { file: selectedFile, ruleVersion: response?.ruleVersion ?? PERDIR_0299_VERSION, ...(nextMapping ? { mapping: nextMapping } : {}) };
      next.postMessage(request);
    } catch { cancelPreview(); failed("Browser tidak dapat menjalankan preview Worker."); }
  }
  function selectFile(selected: File | undefined) {
    if (inFlight.current) return;
    cancelPreview(); setSnapshot(null); setMapping(null); setConfirmed(false); setError("");
    if (!selected) { setFile(null); return; }
    if (!/\.xlsx$/i.test(selected.name)) { setFile(null); setError("Gunakan berkas .xlsx."); return; }
    if (selected.size < 1 || selected.size > MAX_WORKBOOK_BYTES) { setFile(null); setError("Ukuran berkas harus 1 byte hingga 50 MiB."); return; }
    setFile(selected); read(selected, response?.layout ?? undefined);
  }
  function changeMapping(next: AssetSheetMapping) { if (inFlight.current) return; setMapping(next); setConfirmed(false); if (file) read(file, next); }
  async function recover(id: string) {
    beginAuthoritativeTransition();
    try { const current = await api.load(id); remember(current); setStep(stepFor(current)); }
    catch { /* A deliberate refresh remains available; never restart a mutation. */ }
    setError("Respons terputus atau permintaan gagal. Status tersimpan diperiksa; gunakan Periksa status sebelum mencoba tindakan lagi.");
  }
  async function continueProcessing(importId: string, initial?: ImportResponse) {
    const generation = authorityGeneration.current;
    let current = initial, attempts = 0, attemptLimit = initial?.progress ? Math.ceil(initial.progress.expectedChunks / PROCESS_CHUNKS_PER_REQUEST) + 2 : 2;
    while (!current || current.stage === "PROCESSING") {
      if (!mounted.current || authorityGeneration.current !== generation || attempts >= attemptLimit) break;
      current = await api.process(importId); attempts++;
      if (!mounted.current || authorityGeneration.current !== generation) break;
      remember(current); setStep(stepFor(current));
      if (current.progress) attemptLimit = Math.ceil(current.progress.expectedChunks / PROCESS_CHUNKS_PER_REQUEST) + 2;
    }
    if (!mounted.current || authorityGeneration.current !== generation) return current;
    if (current?.stage === "PROCESSING" && attempts >= attemptLimit) setMessage("Proses tersimpan belum selesai. Gunakan Lanjutkan proses untuk melanjutkan batch berikutnya.");
    else if (current && current.stage !== "PROCESSING") setMessage("Validasi server selesai.");
    return current;
  }
  async function run() {
    const ready = snapshot;
    if (inFlight.current || worker.current || reading || !previewReady || !ready?.mapping || !confirmed || confirmedSnapshot?.generation !== ready.generation || !actorUnits.some(unit => unit.id === unitId)) return;
    beginAuthoritativeTransition(); inFlight.current = true; setBusy(true); setError(""); setAcknowledged(false);
    let current = response;
    try {
      if (!current) { current = await api.create(unitId, ready.file, ready.preview.sha256); remember(current); }
      if (current.stage === "UPLOAD") { if (!current.upload) throw new Error("Missing signature"); await api.upload(ready.file, current.upload); current = await api.complete(current.importId); remember(current); }
      current = await api.saveMapping(current.importId, ready.mapping, { ruleVersion: ready.preview.ruleVersion, layoutHash: ready.preview.layoutHash, canonicalHash: ready.preview.canonicalHash }); remember(current);
      await continueProcessing(current.importId);
    } catch { if (current) await recover(current.importId); else setError("Draft belum dapat dipastikan. Muat ulang halaman dan periksa daftar draft sebelum membuat impor baru."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function refresh(id = response?.importId, nextFilter: ReviewFilter = filter, offset = 0, nextOptions: ImportReviewSearch = reviewOptions, preserveMapping = true) {
    if (!id || inFlight.current) return;
    beginAuthoritativeTransition(preserveMapping); inFlight.current = true; setBusy(true); setError("");
    try { const current = await api.load(id, nextFilter, offset, nextOptions); remember(current); setStep(stepFor(current)); setFilter(nextFilter); setReviewOptions(nextOptions); setMessage("Status draft tersimpan dimuat dari server."); }
    catch { setError("Status draft tidak dapat dimuat. Coba Periksa status saat koneksi tersedia."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function resume(draft: ImportDraft) {
    if (inFlight.current || !actorUnits.some(unit => unit.id === draft.unitId)) return;
    beginAuthoritativeTransition(); setResponse(null); setStep("source"); setMessage(""); setFile(null); setSnapshot(null); setMapping(null); setConfirmed(false); setAcknowledged(false); setUnitId(draft.unitId); setFilter("ALL");
    await refresh(draft.importId, "ALL", 0, {}, false);
  }
  async function retry() {
    if (!response || inFlight.current || !["READY_TO_PROCESS", "PROCESSING", "FAILED", "NEEDS_FIX"].includes(response.stage)) return;
    beginAuthoritativeTransition(); inFlight.current = true; setBusy(true); setAcknowledged(false); setError("");
    try { await continueProcessing(response.importId, response.stage === "PROCESSING" ? response : undefined); }
    catch { await recover(response.importId); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function verifyUpload() {
    if (!response || response.stage !== "UPLOAD" || inFlight.current) return;
    beginAuthoritativeTransition(); inFlight.current = true; setBusy(true); setError(""); setConfirmed(false);
    try { const current = await api.complete(response.importId); remember(current); setStep(stepFor(current)); setMessage("Unggahan tersimpan diverifikasi. Konfirmasikan pemetaan sebelum memulai proses."); }
    catch { await recover(response.importId); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function submit() {
    if (!response || inFlight.current || response.stage !== "READY_TO_SUBMIT" || !response.summary || response.summary.blockingErrors || response.summary.issueCounts.AGE_IMPUTED && !acknowledged) return;
    beginAuthoritativeTransition(); inFlight.current = true; setBusy(true); setError("");
    try { const current = await api.submit(response.importId); remember(current); setStep("comparison"); }
    catch { await recover(response.importId); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function startNew() { if (inFlight.current) return; beginAuthoritativeTransition(); setResponse(null); setFile(null); setSnapshot(null); setMapping(null); setConfirmed(false); setError(""); setMessage(""); setStep("source"); setAcknowledged(false); setFilter("ALL"); setReviewOptions({}); }
  return { unitId, setUnitId, drafts, response, file, preview, previewReady, mapping, confirmed, setConfirmed, busy, reading, error, message, step, setStep, filter, reviewOptions, acknowledged, setAcknowledged, selectFile, changeMapping, run, refresh, resume, retry, continueProcessing: retry, verifyUpload, submit, startNew };
}
