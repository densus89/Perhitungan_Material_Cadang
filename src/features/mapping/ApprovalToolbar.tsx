"use client";

import { useState } from "react";
import type { MappingSuggestion } from "../../domain/types";
import { isCompatibleRfq } from "../../domain/rfq-approval";
import { DemoModal } from "./MappingDetailDrawer";

export function canApprove(row: MappingSuggestion) {
  return row.status === "MENUNGGU_APPROVAL" && Boolean(row.proposedRfq && isCompatibleRfq(row, row.proposedRfq));
}

export function ApprovalToolbar({ pendingRows, selectedIds, onSelected, onRejectSelected, onAll }: { pendingRows: MappingSuggestion[]; selectedIds: string[]; onSelected: () => void; onRejectSelected: () => void; onAll: (ids: string[]) => void }) {
  const [confirmation, setConfirmation] = useState<MappingSuggestion[] | null>(null);
  const selectedSpecs = new Set(pendingRows.filter((row) => selectedIds.includes(row.id)).map((row) => row.normalizedSpecification));
  const affectedRows = pendingRows.filter((row) => selectedSpecs.has(row.normalizedSpecification));
  const selectedBlocked = affectedRows.some((row) => !canApprove(row));
  const allBlocked = pendingRows.some((row) => !canApprove(row));

  return <>
    <div className="approval-toolbar"><div><strong>{pendingRows.length} baris pending terlihat</strong><p className="section-note">{selectedIds.length} dicentang · {affectedRows.length} baris dalam spesifikasi terpilih</p></div><div className="toolbar-actions"><button className="button" disabled={!selectedIds.length || selectedBlocked} onClick={onSelected}>Setujui terpilih ({selectedIds.length})</button><button className="button" disabled={!selectedIds.length} onClick={onRejectSelected}>Tolak terpilih ({selectedIds.length})</button><button className="button button--primary" disabled={!pendingRows.length || allBlocked} onClick={() => setConfirmation(pendingRows.map((row) => ({ ...row })))}>Setujui semua terfilter ({pendingRows.length})</button></div></div>
    {allBlocked && <p className="guard-note">Persetujuan massal terkunci: terdapat usulan tegangan trafo yang tidak kompatibel. Filter ke baris kompatibel atau koreksi target melalui detail audit.</p>}
    {confirmation && <DemoModal title="Konfirmasi persetujuan" onClose={() => setConfirmation(null)}><div className="feature-stack"><p>Setujui tepat {confirmation.length} baris pending dalam lingkup filter ini?</p><p className="section-note">{confirmation.reduce((sum, row) => sum + row.affectedAssetCount, 0)} aset demo terdampak. Hanya ID berikut yang akan diproses.</p><ul className="confirmation-list">{confirmation.map((row) => <li key={row.id}><strong>{row.id}</strong><span>{row.originalSpecification}</span></li>)}</ul><div className="toolbar-actions"><button className="button" onClick={() => setConfirmation(null)}>Batal</button><button className="button button--primary" onClick={() => { onAll(confirmation.map((row) => row.id)); setConfirmation(null); }}>Konfirmasi {confirmation.length} baris</button></div></div></DemoModal>}
  </>;
}
