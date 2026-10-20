"use client";

import { Upload } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import type { ImportDraft } from "../../domain/asset-import/schemas";
import { useAssetImport, type ImportUnit } from "./useAssetImport";
import { ImportSourceStep } from "./ImportSourceStep";
import { ImportMappingStep } from "./ImportMappingStep";
import { ImportQualityStep } from "./ImportQualityStep";
import { ImportComparisonStep } from "./ImportComparisonStep";
import styles from "./import.module.css";

const stages = [{ key: "source", name: "Sumber" }, { key: "mapping", name: "Pemetaan" }, { key: "quality", name: "Kualitas" }, { key: "comparison", name: "Pengajuan" }];
export function ImportWorkspace({ initialDrafts, actorUnits }: { initialDrafts: ImportDraft[]; actorUnits: ImportUnit[] }) {
  const flow = useAssetImport(initialDrafts, actorUnits);
  const { response, preview } = flow;
  const locked = flow.busy || Boolean(response && ["PROCESSING", "PENDING_RST", "ACTIVE", "HISTORICAL"].includes(response.stage));
  const mapping = flow.mapping ?? response?.layout;
  const stepIndex = stages.findIndex(stage => stage.key === flow.step);
  const canUpload = !locked && !flow.reading && flow.previewReady && flow.confirmed;
  return <div className={styles.workspace}>
    <header className="page-heading"><div><p className="eyebrow">PERSIAPAN DATA</p><h1>Impor & kualitas data</h1><p className="page-description">Siapkan snapshot aset, periksa bukti nilai, dan ajukan versi untuk persetujuan DIV RST.</p></div>{response && <button className="button" disabled={flow.busy} onClick={flow.startNew}>Impor snapshot baru</button>}</header>
    <div className="status-banner"><Upload size={18} aria-hidden="true" /><p>Preview lokal → draft divalidasi server → pengajuan DIV RST → versi aktif setelah persetujuan.</p></div>
    {flow.drafts.length > 0 && <section className="panel feature-panel" aria-labelledby="drafts-title"><div className="section-heading"><h2 id="drafts-title">Draft & versi tersimpan</h2><span className="section-note">50 impor terbaru · hanya unit penugasan</span></div><ul className={styles.drafts}>{flow.drafts.map(draft => <li key={draft.importId}><div><strong>{draft.fileName}</strong><p className="section-note">{actorUnits.find(unit => unit.id === draft.unitId)?.name} · <time dateTime={draft.createdAt}>{new Date(draft.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</time></p><p className="section-note">{draft.stage} · {draft.progress ? `${draft.progress.completedRows.toLocaleString("id-ID")} dari ${draft.progress.expectedRows.toLocaleString("id-ID")} baris` : draft.rowCount === null ? "Jumlah baris belum divalidasi" : `${draft.rowCount} baris`}</p></div><button className="button" disabled={flow.busy} onClick={() => void flow.resume(draft)} aria-label={`Lanjutkan ${draft.fileName}`}>Lanjutkan</button></li>)}</ul></section>}
    <ol className="import-stages" aria-label="Tahapan impor">{stages.map((stage, index) => <li key={stage.key} aria-current={flow.step === stage.key ? "step" : undefined} className={index <= stepIndex ? "stage-active" : ""}><span>{index + 1}</span>{stage.name}</li>)}</ol>
    <div aria-live="polite" aria-atomic="true">{flow.message && <p role="status" className="section-note">{flow.message}</p>}{flow.busy && <p role="status">Memperbarui draft tersimpan…</p>}</div>
    {flow.error && <p role="alert" className={styles.notice}>{flow.error}</p>}
    {response?.stage === "UPLOAD" && <div className={`panel feature-panel ${styles.stack}`}><p className="page-description">Jika koneksi terputus setelah unggah, periksa berkas yang sudah tersimpan sebelum mencoba unggah kembali.</p><button className="button" disabled={flow.busy} onClick={() => void flow.verifyUpload()}>Verifikasi unggahan tersimpan</button></div>}
    {response && <div className={`panel feature-panel ${styles.status}`}><div><Badge tone={response.stage === "ACTIVE" ? "success" : response.stage === "FAILED" || response.stage === "NEEDS_FIX" ? "warning" : "neutral"}>Status server: {response.stage}</Badge><p className="section-note">Versi: {response.versionId}</p>{response.source && <p>{response.source.fileName}</p>}{response.progress && <div className={styles.progress}><progress aria-label="Progres pemrosesan aset" value={response.progress.completedRows} max={response.progress.expectedRows || 1} /><p role="status">{response.progress.completedRows.toLocaleString("id-ID")} dari {response.progress.expectedRows.toLocaleString("id-ID")} baris ({response.progress.percent}%)</p></div>}</div><div className={styles.statusActions}>{response.stage === "PROCESSING" && <button className="button button--primary" disabled={flow.busy} onClick={() => void flow.continueProcessing()}>Lanjutkan proses</button>}<button className="button" disabled={flow.busy} onClick={() => void flow.refresh()}>Periksa status</button></div></div>}
    {(flow.step === "source" || flow.step === "mapping") && <>
      <ImportSourceStep units={actorUnits} unitId={flow.unitId} onUnit={flow.setUnitId} onFile={flow.selectFile} file={flow.file} preview={preview} reading={flow.reading} disabled={locked} unitLocked={Boolean(response)} />
      {mapping && <ImportMappingStep mapping={mapping} candidates={preview?.layout.candidates.length ? preview.layout.candidates : [mapping]} confirmed={flow.confirmed} onChange={flow.changeMapping} onConfirm={flow.setConfirmed} disabled={locked || flow.reading || !flow.previewReady} />}
      <div className="wizard-actions"><button className="button button--primary" disabled={!canUpload} onClick={() => void flow.run()}>Unggah dan proses di server</button></div>
      {response && ["UPLOAD", "MAPPING"].includes(response.stage) && !flow.file && <p className="section-note">Pilih kembali berkas asli untuk melanjutkan. SHA-256 harus sama dengan sumber draft.</p>}
    </>}
    {flow.step === "quality" && response?.summary && <ImportQualityStep summary={response.summary} review={response.review} filter={flow.filter} onFilter={filter => void flow.refresh(undefined, filter)} options={flow.reviewOptions} onOptions={options => void flow.refresh(undefined, flow.filter, 0, options)} acknowledged={flow.acknowledged} onAcknowledge={flow.setAcknowledged} onNext={() => flow.setStep("comparison")} onPage={offset => void flow.refresh(undefined, flow.filter, offset)} disabled={flow.busy || response.stage === "PROCESSING"} />}
    {flow.step === "quality" && response && ["READY_TO_SUBMIT", "NEEDS_FIX", "FAILED"].includes(response.stage) && <button className="button" disabled={flow.busy} onClick={() => flow.setStep("mapping")}>Perbaiki pemetaan</button>}
    {flow.step === "comparison" && response && <>{!["PENDING_RST", "ACTIVE", "HISTORICAL"].includes(response.stage) && <button className="button" disabled={flow.busy} onClick={() => flow.setStep("quality")}>Kembali ke kualitas</button>}<ImportComparisonStep response={response} acknowledged={flow.acknowledged} onSubmit={() => void flow.submit()} disabled={flow.busy} /></>}
    {response && ["READY_TO_PROCESS", "FAILED", "NEEDS_FIX"].includes(response.stage) && <div className="panel feature-panel"><p className="page-description">Proses hanya berjalan setelah tindakan Anda. Pemrosesan ulang membuat run baru yang terisolasi; hasil run sebelumnya tetap tersimpan.</p><button className="button" disabled={flow.busy} onClick={() => void flow.retry()}>{response.stage === "READY_TO_PROCESS" ? "Proses draft tersimpan" : "Proses ulang sebagai run baru"}</button></div>}
  </div>;
}
