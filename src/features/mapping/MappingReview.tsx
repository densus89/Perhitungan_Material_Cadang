"use client";

import { useState } from "react";
import { Search, ListChecks } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { useDemoWorkspace } from "../../state/DemoWorkspaceProvider";
import type { ApprovalDecision, ApprovalScope, MappingStatus, MaterialFamily } from "../../domain/types";
import { ApprovalToolbar, canApprove } from "./ApprovalToolbar";
import { MappingDetailDrawer } from "./MappingDetailDrawer";

export function MappingReview() {
  const { mappingRows, decide, resetDemo } = useDemoWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MappingStatus | "ALL">("MENUNGGU_APPROVAL");
  const [family, setFamily] = useState<MaterialFamily | "ALL">("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const visibleRows = mappingRows.filter((row) => (status === "ALL" || row.status === status) && (family === "ALL" || row.materialFamily === family) && `${row.id} ${row.originalSpecification} ${row.proposedRfq?.specification ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pendingRows = visibleRows.filter((row) => row.status === "MENUNGGU_APPROVAL");
  const pendingIds = pendingRows.map((row) => row.id);
  const visibleSelectedIds = selectedIds.filter((id) => pendingIds.includes(id));
  const detailRow = mappingRows.find((row) => row.id === detailId);
  const totalPending = mappingRows.filter((row) => row.status === "MENUNGGU_APPROVAL").length;

  function apply(method: ApprovalScope["method"], ids: string[], boundary: string[], decision: ApprovalDecision) {
    decide(method, ids, boundary, decision);
    setSelectedIds([]);
    setFeedback(decision.type === "reject" ? "Keputusan ditolak: spesifikasi menjadi SPESIFIKASI_MANDIRI dalam lingkup terlihat." : "Persetujuan demo diterapkan pada spesifikasi ternormalisasi dalam lingkup terlihat.");
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">STANDARDISASI SPESIFIKASI</p><h1>Pemetaan RFQ</h1><p className="page-description">Tinjau kesesuaian spesifikasi sebelum penggabungan ke katalog RFQ.</p></div><button className="button" onClick={() => { resetDemo(); setSelectedIds([]); setDetailId(null); setFeedback("Data demo dikembalikan ke kondisi awal."); }}>Reset data demo</button></header>
    <div className="status-banner"><ListChecks size={18} aria-hidden="true" /><p><strong>{totalPending} pemetaan menunggu approval.</strong> Persetujuan mengikuti spesifikasi ternormalisasi dan hanya menjangkau baris pending yang terlihat.</p></div>
    <section className="panel" aria-label="Tinjauan pemetaan RFQ">
      <div className="mapping-filters"><div className="filter-field search-field"><label htmlFor="mapping-search">Cari spesifikasi atau ID</label><div><Search size={16} aria-hidden="true" /><input id="mapping-search" className="field-control" value={query} placeholder="Cari material, spesifikasi, ID…" onChange={(event) => { setQuery(event.target.value); setSelectedIds([]); }} /></div></div><div className="filter-field"><label htmlFor="mapping-status">Status pemetaan</label><select id="mapping-status" className="field-control" value={status} onChange={(event) => { setStatus(event.target.value as MappingStatus | "ALL"); setSelectedIds([]); }}><option value="ALL">Semua status</option><option value="MENUNGGU_APPROVAL">Menunggu approval</option><option value="DITERIMA_OTOMATIS">Diterima otomatis</option><option value="DISETUJUI">Disetujui</option><option value="SPESIFIKASI_MANDIRI">Spesifikasi mandiri</option></select></div><div className="filter-field"><label htmlFor="mapping-family">Keluarga material</label><select id="mapping-family" className="field-control" value={family} onChange={(event) => { setFamily(event.target.value as MaterialFamily | "ALL"); setSelectedIds([]); }}><option value="ALL">Semua keluarga</option><option value="TRANSFORMER">Trafo</option><option value="BREAKER">PMT</option><option value="INSTRUMENT">Instrumen</option><option value="OTHER">Lainnya</option></select></div></div>
      <ApprovalToolbar pendingRows={pendingRows} selectedIds={visibleSelectedIds} onSelected={() => apply("SELECTED", visibleSelectedIds, pendingIds, { type: "approve" })} onRejectSelected={() => apply("SELECTED", visibleSelectedIds, pendingIds, { type: "reject" })} onAll={(ids) => apply("ALL_FILTERED", ids, ids, { type: "approve" })} />
      <div className="table-scroll"><table className="data-table mapping-table"><caption>{visibleRows.length} pemetaan terlihat dari {mappingRows.length} data demo</caption><thead><tr><th scope="col"><input type="checkbox" aria-label="Pilih semua baris pending terlihat" disabled={!pendingRows.length} checked={pendingRows.length > 0 && visibleSelectedIds.length === pendingRows.length} onChange={(event) => setSelectedIds(event.target.checked ? pendingIds : [])} /></th><th scope="col">Spesifikasi asli</th><th scope="col">Usulan RFQ</th><th scope="col">Aset</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><input type="checkbox" aria-label={`Pilih ${row.id}`} disabled={row.status !== "MENUNGGU_APPROVAL"} checked={visibleSelectedIds.includes(row.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id))} /></td><th scope="row"><span className="specification-text">{row.originalSpecification}</span><small className="record-id">{row.id}</small></th><td><span className="specification-text">{row.proposedRfq?.specification ?? "Tidak ditemukan"}</span>{row.status === "MENUNGGU_APPROVAL" && !canApprove(row) && <small className="guard-note">Spesifikasi tidak kompatibel</small>}</td><td className="numeric">{row.affectedAssetCount}</td><td><Badge tone={row.status === "MENUNGGU_APPROVAL" ? "warning" : row.status === "DISETUJUI" || row.status === "DITERIMA_OTOMATIS" ? "success" : "neutral"}>{row.status}</Badge></td><td><div className="row-actions">{row.status === "MENUNGGU_APPROVAL" && <><button className="text-button" disabled={!canApprove(row)} onClick={() => apply("ONE", [row.id], pendingIds, { type: "approve" })}>Setujui</button><button className="text-button" onClick={() => apply("ONE", [row.id], pendingIds, { type: "reject" })}>Tolak</button></>}<button className="text-button" onClick={() => setDetailId(row.id)}>Detail audit</button></div></td></tr>)}{!visibleRows.length && <tr><td colSpan={6} className="empty-state">Tidak ada pemetaan sesuai filter. Ubah filter untuk melihat data demo lainnya.</td></tr>}</tbody></table></div>
      <p className="scope-note">Centang memilih spesifikasi; semua peer pending dengan spesifikasi yang sama dalam filter ikut diproses. Baris tersembunyi tetap di luar lingkup.</p>
    </section>
    {feedback && <p className="feedback-message" role="status">{feedback}</p>}
    {detailRow && <MappingDetailDrawer key={detailRow.id} row={detailRow} onClose={() => setDetailId(null)} onManual={(target) => apply("ONE", [detailRow.id], pendingIds, { type: "approve", target })} />}
  </>;
}
