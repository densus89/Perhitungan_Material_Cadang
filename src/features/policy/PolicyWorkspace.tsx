"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, Layers, ShieldAlert, CircleSlash } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { KpiCard } from "../../components/ui/KpiCard";
import { policyRows } from "../../demo/fixtures";
import type { PolicyMethod, PolicyRow } from "../../domain/types";
import { useDemoWorkspace } from "../../state/DemoWorkspaceProvider";
import { PolicyDetailDrawer, policyMethodLabels } from "./PolicyDetailDrawer";
import { hasPendingRfqPeer } from "../abc/rfq-presentation";
import styles from "../abc/analysis.module.css";

export function PolicyWorkspace() {
  const { mappingRows } = useDemoWorkspace();
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);
  const rows: PolicyRow[] = policyRows.map((row) => {
    const mapping = mappingRows.find((item) => item.id === row.mappingId);
    const policyMethod: PolicyMethod = row.category === "A1" ? "MANDATORY" : row.category === "C" ? "NONE" : row.category === "A2" || (row.category === "B1" && row.failureCount > 0) ? "OPTIMUM" : "ECONOMIC";
    return { ...row, method: policyMethod, idealQuantity: row.category === "C" ? 0 : row.idealQuantity, status: hasPendingRfqPeer(mappingRows, row.mappingId) ? "DRAFT" : "FINAL", mappingStatus: mapping?.status ?? row.mappingStatus };
  });
  const visible = rows.filter((row) => (method === "ALL" || row.method === method) && (status === "ALL" || row.status === status) && `${row.materialName} ${row.specification}`.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")));
  const detail = rows.find((row) => row.id === detailId);

  return <>
    <div className="page-heading"><div><p className="eyebrow">KEBIJAKAN MATERIAL CADANG</p><h1>Inventory Policy</h1><p className="page-description">Jumlah ideal dan dasar pemilihan metode untuk setiap kategori material.</p></div><Badge tone="demo">Skenario sintetis</Badge></div>
    <div className="kpi-grid"><KpiCard label="Material dalam policy" value={rows.length} detail="Termasuk spesifikasi mandiri dan contoh lead time" icon={Layers} /><KpiCard label="Jumlah ideal demo" value={rows.reduce((sum, row) => sum + row.idealQuantity, 0)} detail="Referensi policy pada seluruh skenario" icon={Boxes} /><KpiCard label="Policy draft" value={rows.filter((row) => row.status === "DRAFT").length} detail="Memerlukan persetujuan pemetaan RFQ" icon={ShieldAlert} attention /><KpiCard label="Tidak dicadangkan" value={rows.filter((row) => row.category === "C").length} detail="Kategori C selalu memiliki jumlah ideal 0" icon={CircleSlash} /></div>
    <section className={`panel feature-panel ${styles.summary}`} aria-label="Aturan kategori policy"><div className="section-heading"><h2>Dasar pemilihan metode</h2><span className="section-note">Nilai ilustratif, bukan perhitungan produksi</span></div><p className="page-description">A1 → Mandatory · A2 / B1 dengan kegagalan positif → Optimum · B1 tanpa kegagalan / B2 → Economic · C → Tidak dicadangkan (0), pada semua lead time.</p></section>
    <section className="panel"><div className="panel-heading"><div><h3>Kebijakan per material</h3><p>{visible.length} dari {rows.length} material · angka skenario tetap, status mengikuti approval RFQ sesi ini</p></div><Link href="/prioritas-lokasi/" className="text-link">Prioritas lokasi <ArrowRight size={14} aria-hidden="true" /></Link></div><div className="mapping-filters"><div className="filter-field search-field"><label htmlFor="policy-query">Cari material policy</label><input id="policy-query" className="field-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Material atau spesifikasi" /></div><div className="filter-field"><label htmlFor="policy-method">Metode policy</label><select id="policy-method" className="field-control" value={method} onChange={(event) => setMethod(event.target.value)}><option value="ALL">Semua metode</option>{Object.entries(policyMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="filter-field"><label htmlFor="policy-status">Status policy</label><select id="policy-status" className="field-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Semua status</option><option value="DRAFT">Draft</option><option value="FINAL">Selesai pemetaan</option></select></div></div>
      <div className="table-scroll"><table className={`data-table compact-table ${styles.table}`}>
        <caption>Kebijakan inventory per material</caption>
        <thead><tr><th scope="col">Material / spesifikasi</th><th scope="col">Kategori</th><th scope="col">Metode</th><th scope="col" className="numeric">Jumlah ideal</th><th scope="col" className="numeric">Populasi</th><th scope="col" className="numeric">Kegagalan / histori</th><th scope="col" className="numeric">Lead time</th><th scope="col" className="numeric">Harga satuan (Rp)</th><th scope="col">Status RFQ</th><th scope="col">Dasar perhitungan</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.id}>
          <th scope="row">{row.materialName}{" "}<span className="record-id specification-text">{row.specification}</span></th>
          <td><span className={styles.category}>{row.category}</span></td>
          <td>{policyMethodLabels[row.method]}</td>
          <td className={`numeric ${styles.ideal}`}>{row.idealQuantity}</td>
          <td className="numeric">{row.population}</td>
          <td className="numeric">{row.failureCount} / {row.historyYears} tahun</td>
          <td className="numeric">{row.leadTimeMonths} bulan</td>
          <td className="numeric">{row.unitPrice.toLocaleString("id-ID")}</td>
          <td><Badge tone={row.status === "DRAFT" ? "warning" : row.mappingStatus === "SPESIFIKASI_MANDIRI" ? "neutral" : "success"}>{row.status === "DRAFT" ? "Draft" : row.mappingStatus === "SPESIFIKASI_MANDIRI" ? "Spesifikasi mandiri" : row.mappingStatus === "DISETUJUI" ? "Disetujui" : "Diterima otomatis"}</Badge>{row.status === "DRAFT" && <span className="record-id">Menunggu approval RFQ{row.mappingStatus === "SPESIFIKASI_MANDIRI" ? " · Spesifikasi mandiri" : ""}</span>}</td>
          <td><button className="text-button" onClick={() => setDetailId(row.id)}>Penjelasan</button></td>
        </tr>)}{visible.length === 0 && <tr><td colSpan={10} className="empty-state">Tidak ada material pada filter ini.</td></tr>}</tbody>
      </table></div><p className="scope-note">Filter hanya mengubah tampilan tabel. Pending tetap draft; material yang ditolak atau tidak cocok tetap tampil sebagai spesifikasi mandiri. Total mencakup contoh C dengan lead time 6 dan 24 bulan.</p>
    </section>
    {detail && <PolicyDetailDrawer row={detail} onClose={() => setDetailId(null)} />}
  </>;
}
