"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { rfqTargets } from "../../demo/fixtures";
import { isCompatibleRfq } from "../../domain/rfq-approval";
import type { MappingSuggestion, RfqTarget } from "../../domain/types";
import { Badge } from "../../components/ui/Badge";

/** Native modal behavior supplies focus containment and makes the background inert. */
export function DemoModal({ title, onClose, children, drawer = false }: { title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      dialog.querySelector<HTMLElement>("button, select, input, a[href]")?.focus();
    }
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  return <dialog ref={dialogRef} className={`demo-modal${drawer ? " demo-modal--drawer" : ""}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <div className="modal-heading"><h2>{title}</h2><button className="button icon-button" aria-label="Tutup dialog" onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    {children}
  </dialog>;
}

export function MappingDetailDrawer({ row, onClose, onManual }: { row: MappingSuggestion; onClose: () => void; onManual: (target: RfqTarget) => void }) {
  const [targetId, setTargetId] = useState("");
  const target = rfqTargets.find((item) => item.id === targetId);
  const pending = row.status === "MENUNGGU_APPROVAL";
  const compatible = target ? isCompatibleRfq(row, target) : false;
  return <DemoModal title="Audit pemetaan RFQ" onClose={onClose} drawer>
    <p className="section-note">{row.id} · Jejak keputusan pada sesi demo ini</p>
    <dl className="audit-detail"><div><dt>Spesifikasi asli</dt><dd>{row.originalSpecification}</dd></div><div><dt>Spesifikasi ternormalisasi</dt><dd>{row.normalizedSpecification}</dd></div><div><dt>Usulan RFQ</dt><dd>{row.proposedRfq?.specification ?? "Tidak tersedia"}</dd></div><div><dt>RFQ disetujui</dt><dd>{row.approvedRfq?.specification ?? "Belum disetujui"}</dd></div><div><dt>Aset terdampak pada baris ini</dt><dd>{row.affectedAssetCount} aset</dd></div><div><dt>Status</dt><dd><Badge tone={pending ? "warning" : "neutral"}>{row.status}</Badge></dd></div><div><dt>Metode persetujuan</dt><dd>{row.approvalMethod ?? "Belum diputuskan"}</dd></div><div><dt>Kelompok hasil</dt><dd>{row.groupKey}</dd></div></dl>
    <div className="table-scroll"><table className="data-table"><caption>Perbedaan terstruktur</caption><thead><tr><th scope="col">Elemen</th><th scope="col">Temuan</th></tr></thead><tbody>{row.differences.length ? row.differences.map((difference, index) => <tr key={difference}><th scope="row">Perbedaan {index + 1}</th><td>{difference}</td></tr>) : <tr><td colSpan={2}>Tidak ada perbedaan spesifikasi</td></tr>}</tbody></table></div>
    {pending && <section className="manual-target feature-stack" aria-label="Pilih target manual"><h3>Koreksi target RFQ</h3><p className="page-description">Keputusan mengikuti spesifikasi ternormalisasi dalam baris pending yang terlihat. Tegangan dan jumlah belitan trafo harus kompatibel.</p><label className="field-label" htmlFor="manual-rfq">Target RFQ manual</label><select id="manual-rfq" className="field-control" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Pilih target RFQ demo</option>{rfqTargets.map((item) => <option key={item.id} value={item.id}>{item.specification}{isCompatibleRfq(row, item) ? "" : " — tegangan tidak kompatibel"}</option>)}</select>{target && !compatible && <p className="guard-note" role="status">Tegangan target tidak kompatibel. Pilih varian dengan tegangan dan jumlah belitan yang sama.</p>}<button className="button button--primary" disabled={!target || !compatible} onClick={() => { if (target && compatible) onManual(target); }}>Terapkan target manual</button></section>}
  </DemoModal>;
}
