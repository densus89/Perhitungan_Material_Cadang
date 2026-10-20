"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { Actor } from "../../domain/access";
import type { ImportReviewQuery } from "../../domain/asset-import/schemas";
import type { Json } from "../../lib/supabase/database";
import type { ComparisonQuery, MappingPage, ReviewComparisonPage, ReviewDetail, ReviewFilters, ReviewQueue, ReviewResult } from "./review-contracts";
import { ComparisonDiffTable, VersionDiffTable } from "./VersionDiffTable";
import styles from "./review.module.css";
const initial: ReviewFilters = { offset: 0, filter: "ALL", status: "PENDING_RST" };
function query(filters: object) { return new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString(); }
const rowFilters = ({ offset, filter, issue, source, condition, search }: ReviewFilters): ImportReviewQuery => ({ offset, filter, ...(issue ? { issue } : {}), ...(source ? { source } : {}), ...(condition ? { condition } : {}), ...(search ? { search } : {}) });
const object = (value: Json) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function AssetVersionReview({ actor, units = [] }: { actor: Actor; units?: { id: string; name: string }[] }) {
  const [filters, setFilters] = useState(initial), [applied, setApplied] = useState(initial), [queue, setQueue] = useState<ReviewQueue | null>(null), [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [notes, setNotes] = useState(""), [confirmed, setConfirmed] = useState(false), [promote, setPromote] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const generation = useRef(0), mounted = useRef(true);
  const [comparison, setComparison] = useState<ReviewComparisonPage | null>(null), [changeKind, setChangeKind] = useState<ComparisonQuery["kind"]>("ALL"), [displayError, setDisplayError] = useState("");
  const [displayBusy, setDisplayBusy] = useState({ mapping: false, comparison: false });
  const displayGeneration = useRef({ mapping: 0, comparison: 0 });
  const resetDisplay = () => { displayGeneration.current.mapping++; displayGeneration.current.comparison++; setComparison(null); setDisplayError(""); setDisplayBusy({ mapping: false, comparison: false }); setChangeKind("ALL"); };
  const allowed = actor.status === "ACTIVE" && ["RST_ADMIN", "RST_REVIEWER"].includes(actor.role);
  const reset = () => { setSelected([]); setNotes(""); setConfirmed(false); setPromote(false); };
  const loadQueue = useCallback(async (options: ReviewFilters) => {
    const request = ++generation.current; setBusy(true); setError(""); setDetail(null); setQueue(null); reset(); resetDisplay();
    try { const response = await fetch(`/api/reviews/asset-versions/?${query(options)}`, { cache: "no-store" }); if (!response.ok) throw new Error(); const result = await response.json() as ReviewQueue; if (mounted.current && request === generation.current) { setQueue(result); setApplied(options); } }
    catch { if (mounted.current && request === generation.current) setError("Antrean tinjauan tidak dapat dimuat. Coba muat ulang."); }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; let cancelled = false; const request = ++generation.current;
    if (allowed) void fetch(`/api/reviews/asset-versions/?${query(initial)}`, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(); const result = await response.json() as ReviewQueue;
      if (!cancelled && request === generation.current) setQueue(result);
    }).catch(() => { if (!cancelled && request === generation.current) setError("Antrean tinjauan tidak dapat dimuat. Coba muat ulang."); });
    return () => { cancelled = true; mounted.current = false; };
  }, [allowed]);
  async function loadDetail(versionId: string, options: ReviewFilters) {
    const request = ++generation.current; setBusy(true); setError(""); setDetail(null); reset(); resetDisplay();
    try { const response = await fetch(`/api/reviews/asset-versions/${versionId}/?${query(rowFilters(options))}`, { cache: "no-store" }); if (!response.ok) throw new Error(); const result = await response.json() as ReviewDetail; if (mounted.current && request === generation.current) { setDetail(result); setApplied(options); } }
    catch { if (mounted.current && request === generation.current) setError("Detail tidak dapat dimuat. Muat ulang versi sebelum mengambil keputusan."); }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  }
  async function loadDisplay(view: "mapping" | "comparison", offset: number) {
    if (!detail) return; const versionId = detail.versionId, request = ++displayGeneration.current[view];
    setDisplayBusy(current => ({ ...current, [view]: true })); setDisplayError("");
    try {
      const response = await fetch(`/api/reviews/asset-versions/${versionId}/?view=${view}&${query({ offset, ...(view === "comparison" ? { kind: changeKind } : {}) })}`, { cache: "no-store" });
      if (!response.ok) throw new Error(); const result = await response.json();
      if (!mounted.current || request !== displayGeneration.current[view]) return;
      if (view === "comparison") setComparison(result as ReviewComparisonPage);
      else setDetail(current => current?.versionId === versionId ? { ...current, mapping: { ...current.mapping, ...result as MappingPage } } : current);
    } catch { if (mounted.current && request === displayGeneration.current[view]) setDisplayError("Halaman bukti tidak dapat dimuat. Keputusan tetap memakai pemeriksaan lengkap di server."); }
    finally { if (mounted.current && request === displayGeneration.current[view]) setDisplayBusy(current => ({ ...current, [view]: false })); }
  }
  async function decide(action: "approve" | "return" | "trash", mode: "ACTIVATE" | "ACKNOWLEDGE" = "ACTIVATE") {
    if (!detail || busy || !notes.trim() || !confirmed) return;
    setBusy(true); setError(""); setMessage(""); const snapshot = detail;
    try {
      const response = await fetch(`/api/reviews/asset-versions/${snapshot.versionId}/${action}/`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ expected: snapshot.expected, notes, confirmed, mode, promoteMapping: action === "approve" && mode === "ACTIVATE" && promote, rowIds: mode === "ACKNOWLEDGE" ? selected : [], filters: rowFilters(applied) }) });
      if (!response.ok) throw new Error(); const result = await response.json() as ReviewResult;
      setMessage(mode === "ACKNOWLEDGE" ? "Bukti baris terpilih telah diakui dan dicatat pada audit." : result.status === "ACTIVE" ? `Versi aktif: ${result.versionId}. Versi dipindahkan ke riwayat: ${result.previousVersionId ?? "tidak ada (snapshot pertama)"}.` : `Keputusan tersimpan: ${result.status}.`);
      await loadDetail(snapshot.versionId, applied);
      // A mutation invalidates the queue; avoid offering its stale submitted status.
      setQueue(null);
    } catch { setError("Keputusan belum dikonfirmasi server. Periksa ulang versi; status atau bukti mungkin telah berubah."); setDetail(null); setQueue(null); }
    finally { setBusy(false); reset(); }
  }
  if (!allowed) return <p role="alert">Akses DIV RST diperlukan untuk meninjau snapshot.</p>;
  const pending = detail?.status === "PENDING_RST", canDecide = !busy && Boolean(notes.trim()) && confirmed;
  const summary = detail ? object(detail.summary) : {}, conditions = object(summary.conditions ?? {}), sources = object(summary.valueSources ?? {});
  return <div className={styles.workspace}>
    <header className="page-heading"><div><p className="eyebrow">DIV RST · KUALITAS DATA</p><h1>Review Snapshot</h1><p className="page-description">Tinjau bukti nilai dan perubahan sebelum menetapkan snapshot aktif per unit.</p></div></header>
    <div className="status-banner"><ClipboardCheck size={20} aria-hidden="true" /><p>Keputusan tercatat bersama catatan, bukti run, dan fingerprint pemetaan.</p></div>
    <form className={`panel feature-panel ${styles.filters}`} aria-label="Filter tinjauan" onSubmit={event => { event.preventDefault(); const options = { ...filters, offset: 0 }; if (detail) void loadDetail(detail.versionId, options); else void loadQueue(options); }}>
      <fieldset disabled={busy}><legend>Filter antrean & baris</legend><div className={styles.filterGrid}>
        <label>Unit induk<select aria-label="Unit induk" value={filters.unitId ?? ""} onChange={event => setFilters({ ...filters, unitId: event.target.value || undefined })}><option value="">Semua unit</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label>Status versi<select aria-label="Status versi" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as ReviewFilters["status"] })}>{["DRAFT", "PENDING_RST", "ACTIVE", "HISTORICAL", "NEEDS_FIX", "TRASH", "ALL"].map(status => <option key={status}>{status}</option>)}</select></label>
        <label>Kode isu<input aria-label="Kode isu" placeholder="Contoh: AGE_IMPUTED" maxLength={100} pattern="[A-Z][A-Z0-9_]*" value={filters.issue ?? ""} onChange={event => setFilters({ ...filters, issue: event.target.value || undefined })} /></label>
        <label>Sumber nilai<select aria-label="Sumber nilai" value={filters.source ?? ""} onChange={event => setFilters({ ...filters, source: event.target.value as ReviewFilters["source"] || undefined })}><option value="">Semua sumber</option>{["SAP_BOOK_VALUE", "PROVIDED_ADJUSTED_VALUE", "SYSTEM_DEPRECIATION", "ESTIMATED_SAME_GI", "ESTIMATED_SAME_UPT", "ESTIMATED_SAME_UNIT", "ESTIMATED_NEAREST_LOCATION", "ESTIMATED_NATIONAL", "UNRESOLVED"].map(source => <option key={source}>{source}</option>)}</select></label>
        <label>Peringatan<select aria-label="Peringatan" value={filters.filter} onChange={event => setFilters({ ...filters, filter: event.target.value as ReviewFilters["filter"] })}>{[["ALL", "Semua baris"], ["WARNING", "Dengan peringatan"], ["ERROR", "Kesalahan pemblokir"], ["ESTIMATED", "Nilai estimasi"], ["AGE_IMPUTED", "Usia diimputasi"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Kondisi<select value={filters.condition ?? ""} onChange={event => setFilters({ ...filters, condition: event.target.value as ReviewFilters["condition"] || undefined })}><option value="">Semua kondisi</option>{["P0", "P1", "P2", "P3", "P4", "MISSING"].map(value => <option key={value}>{value}</option>)}</select></label>
      </div><button className="button button--primary">Terapkan filter</button></fieldset>
    </form>
    <div aria-live="polite">{busy && <p role="status">Memuat tinjauan…</p>}{message && <p role="status">{message}</p>}</div>{error && <p role="alert" className={styles.notice}>{error}</p>}
    <div className={styles.actions}><button className="button" disabled={busy} onClick={() => void loadQueue({ ...filters, offset: 0 })}>{detail ? "Kembali ke antrean" : "Muat ulang antrean"}</button>{detail && <button className="button" disabled={busy} onClick={() => void loadDetail(detail.versionId, applied)}>Periksa status versi</button>}</div>
    {queue && !detail && <section className="panel feature-panel" aria-labelledby="queue-title"><h2 id="queue-title">Antrean & riwayat snapshot</h2><p>{queue.total} versi · maksimal 50 per halaman</p>{!queue.versions.length && <p>Tidak ada versi pada filter ini.</p>}<ul className={styles.queue}>{queue.versions.map(version => <li key={version.versionId}><div><strong>{version.unitName} · v{version.versionNumber}</strong><p>{version.fileName} · {version.status}</p><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</time></div><button className="button" disabled={busy} onClick={() => void loadDetail(version.versionId, { ...applied, offset: 0 })} aria-label={`Tinjau ${version.fileName}`}>Tinjau</button></li>)}</ul><div className={styles.actions}><button className="button" disabled={busy || queue.offset === 0} onClick={() => void loadQueue({ ...applied, offset: Math.max(0, queue.offset - 50) })}>Versi sebelumnya</button><button className="button" disabled={busy || queue.offset + queue.versions.length >= queue.total} onClick={() => void loadQueue({ ...applied, offset: queue.offset + 50 })}>Versi berikutnya</button></div></section>}
    {detail && <>
      <section className={`panel feature-panel ${styles.stack}`} aria-labelledby="detail-title"><h2 id="detail-title">{detail.unitName} · Versi {detail.versionNumber}</h2><p>{detail.fileName} · {detail.status}</p>{detail.status === "DRAFT" ? <p className={styles.notice}>{detail.eligibleDraftTrash ? "Draft duplikat belum diproses. Admin dapat memindahkannya ke sampah logis." : "Draft belum memiliki snapshot final untuk ditinjau."}</p> : !pending && <p className={styles.notice}>Versi riwayat hanya dapat dibaca.</p>}
        <dl className={styles.evidence}><dt>Metadata sumber</dt><dd>{detail.source.byteSize.toLocaleString("id-ID")} byte · {detail.source.mimeType}</dd><dt>SHA-256 sumber</dt><dd>{detail.source.sha256}</dd><dt>Fingerprint pemetaan</dt><dd>{detail.mapping.layoutHash}</dd><dt>Aturan & revisi pemetaan</dt><dd>{detail.mapping.ruleVersion} · {detail.mapping.revision}</dd></dl>
        <details><summary>Provenance pemetaan & kolom</summary><p>{detail.mapping.total ?? detail.mapping.columns.length} kolom · maksimal 100 per halaman</p><pre>{JSON.stringify(detail.mapping, null, 2)}</pre></details>
        <div className={styles.actions}><button className="button" disabled={busy || displayBusy.mapping || !detail.mapping.offset} onClick={() => void loadDisplay("mapping", Math.max(0, detail.mapping.offset - 100))}>Kolom sebelumnya</button><button className="button" disabled={busy || displayBusy.mapping || !detail.mapping.hasMore} onClick={() => void loadDisplay("mapping", detail.mapping.offset + 100)}>Kolom berikutnya</button></div>
        <h3>Distribusi kondisi P0–P4</h3><div className={styles.metrics}>{["P0", "P1", "P2", "P3", "P4"].map(condition => <div key={condition}><span>{condition}</span><strong>{String(conditions[condition] ?? 0)}</strong></div>)}</div>
        <h3>Sumber nilaiABC</h3><div className={styles.tags}>{Object.entries(sources).map(([source, count]) => <span key={source}>{source}: {String(count)}</span>)}</div>
        <details open><summary>Ringkasan perubahan versi</summary><pre>{JSON.stringify(detail.comparison, null, 2)}</pre></details>
      </section>
      {displayError && <p role="alert" className={styles.notice}>{displayError}</p>}
      {detail.runId && <section className={`panel feature-panel ${styles.stack}`}><h2>Perbandingan sebelum / sesudah</h2><p>Halaman perubahan berdiri sendiri, termasuk aset yang dihapus. Bukti bersumber dari baris dan penilaian tersimpan pada masing-masing run.</p><label>Jenis perubahan<select aria-label="Jenis perubahan" value={changeKind} disabled={displayBusy.comparison} onChange={event => { setChangeKind(event.target.value as ComparisonQuery["kind"]); setComparison(null); }}>{["ALL", "ADDED", "REMOVED", "CHANGED", "UNCHANGED", "AMBIGUOUS"].map(kind => <option key={kind}>{kind}</option>)}</select></label><button className="button" disabled={busy || displayBusy.comparison} onClick={() => void loadDisplay("comparison", 0)}>Muat perubahan versi</button>{comparison && <><p>{comparison.total} perubahan pada filter · halaman {Math.floor(comparison.offset / 100) + 1}</p><ComparisonDiffTable page={comparison} /><div className={styles.actions}><button className="button" disabled={busy || displayBusy.comparison || comparison.offset === 0} onClick={() => void loadDisplay("comparison", Math.max(0, comparison.offset - 100))}>Perubahan sebelumnya</button><button className="button" disabled={busy || displayBusy.comparison || !comparison.hasMore} onClick={() => void loadDisplay("comparison", comparison.offset + 100)}>Perubahan berikutnya</button></div></>}</section>}
      <section className={`panel feature-panel ${styles.stack}`}><h2>Baris & bukti perhitungan</h2><p>{detail.totalRows} baris pada filter · halaman {Math.floor(detail.offset / 100) + 1} · maksimal 100 baris. Pilihan hanya berlaku pada baris terlihat dengan sumber nilai yang sama.</p>
        <VersionDiffTable rows={detail.rows} selected={selected} onSelect={ids => { setSelected(ids); setConfirmed(false); }} readonly={!pending} disabled={busy} />
        <div className={styles.actions}><button className="button" disabled={busy || detail.offset === 0} onClick={() => void loadDetail(detail.versionId, { ...applied, offset: Math.max(0, detail.offset - 100) })}>Baris sebelumnya</button><button className="button" disabled={busy || !detail.hasMore} onClick={() => void loadDetail(detail.versionId, { ...applied, offset: detail.offset + 100 })}>Baris berikutnya</button></div>
      </section>
      {(pending || actor.role === "RST_ADMIN" && (["HISTORICAL", "NEEDS_FIX"].includes(detail.status) || detail.status === "DRAFT" && detail.eligibleDraftTrash)) && <section className={`panel feature-panel ${styles.stack}`} aria-label="Keputusan reviewer"><h2>Keputusan & catatan</h2><label>Catatan keputusan<textarea aria-label="Catatan keputusan" value={notes} maxLength={4000} disabled={busy} onChange={event => { setNotes(event.target.value); setConfirmed(false); }} /></label>
        {pending && <label className={styles.check}><input type="checkbox" checked={promote} disabled={busy} onChange={event => { setPromote(event.target.checked); setConfirmed(false); }} />Gunakan pemetaan untuk fingerprint identik berikutnya</label>}
        <p>Lingkup: versi {detail.versionNumber} · {selected.length} baris dipilih · pemetaan {promote ? "ikut disetujui saat aktivasi" : "tidak dipromosikan"}. Aktivasi menolak nilai UNRESOLVED dan estimasi wajib tinjau yang belum diakui.</p>
        <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Saya mengonfirmasi keputusan dan lingkup yang ditampilkan</label>
        <div className={styles.actions}>{pending && <><button className="button" disabled={!canDecide || !selected.length} onClick={() => void decide("approve", "ACKNOWLEDGE")}>Akui baris terpilih</button><button className="button" disabled={!canDecide} onClick={() => void decide("return")}>Kembalikan untuk perbaikan</button><button className="button button--primary" disabled={!canDecide} onClick={() => void decide("approve")}>Setujui & aktifkan</button></>}{actor.role === "RST_ADMIN" && (["HISTORICAL", "NEEDS_FIX"].includes(detail.status) || detail.status === "DRAFT" && detail.eligibleDraftTrash) && <button className="button" disabled={!canDecide} onClick={() => void decide("trash")}>Pindahkan ke sampah</button>}</div>
      </section>}
      <section className={`panel feature-panel ${styles.stack}`}><h2>Riwayat persetujuan & audit</h2><p>100 catatan terbaru per daftar. Berkas, perhitungan, dan bukti tetap tersimpan ketika versi dipindahkan ke sampah.</p><details><summary>Keputusan persetujuan</summary><pre>{JSON.stringify(detail.approvals, null, 2)}</pre></details><details><summary>Audit termasuk persetujuan fingerprint</summary><pre>{JSON.stringify(detail.audit, null, 2)}</pre></details></section>
    </>}
  </div>;
}
