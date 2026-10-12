"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Boxes, Layers, ShieldAlert } from "lucide-react";
import { AbcCurve } from "../../components/charts/AbcCurve";
import { Badge } from "../../components/ui/Badge";
import { KpiCard } from "../../components/ui/KpiCard";
import { abcResults, policyRows } from "../../demo/fixtures";
import type { AbcMode } from "../../domain/types";
import { useDemoWorkspace } from "../../state/DemoWorkspaceProvider";
import { AbcResultTable } from "./AbcResultTable";
import { hasPendingRfqPeer } from "./rfq-presentation";
import styles from "./analysis.module.css";

export function AbcAnalysis() {
  const { mappingRows } = useDemoWorkspace();
  const [mode, setMode] = useState<AbcMode>("FILTERED");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const modeRows = abcResults.filter((row) => row.mode === mode);
  const visible = modeRows.filter((row) => (category === "ALL" || row.category === category) && `${row.materialName} ${row.specification}`.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")));
  const pendingCount = modeRows.filter((row) => hasPendingRfqPeer(mappingRows, policyRows.find((policy) => policy.materialName === row.materialName)?.mappingId)).length;

  return <>
    <div className="page-heading"><div><p className="eyebrow">KLASIFIKASI MATERIAL</p><h1>Analisis ABC</h1><p className="page-description">Peringkat harga, kontribusi nilai perolehan, dan jejak kategori material cadang.</p></div><Badge tone="demo">Skenario sintetis</Badge></div>
    <div className={styles.tabs} role="tablist" aria-label="Mode analisis ABC">{(["FILTERED", "WHITELIST"] as const).map((item) => <button key={item} id={`abc-tab-${item}`} role="tab" aria-selected={mode === item} aria-controls="abc-results" tabIndex={mode === item ? 0 : -1} className={styles.tab} onClick={() => setMode(item)} onKeyDown={(event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const target: AbcMode = event.key === "Home" ? "FILTERED" : event.key === "End" ? "WHITELIST" : mode === "FILTERED" ? "WHITELIST" : "FILTERED";
        setMode(target);
        document.getElementById(`abc-tab-${target}`)?.focus();
      }
    }}>{item === "FILTERED" ? "Filtered" : "Whitelist"}</button>)}</div>
    <section id="abc-results" role="tabpanel" aria-labelledby={`abc-tab-${mode}`}>
      <div className="kpi-grid"><KpiCard label="Material dalam mode" value={modeRows.length} detail="Total skenario pada mode aktif" icon={Layers} /><KpiCard label="Populasi efektif" value={modeRows.reduce((sum, row) => sum + row.effectiveQuantity, 0)} detail="Filtered dan Whitelist memiliki populasi berbeda" icon={Boxes} /><div className={styles.currency}><KpiCard label="Nilai perolehan (Rp)" value={modeRows.reduce((sum, row) => sum + row.acquisitionValue, 0)} detail="Jumlah efektif × harga satuan demo" icon={Banknote} /></div><KpiCard label="Material draft" value={pendingCount} detail="Pemetaan RFQ masih menunggu persetujuan" icon={ShieldAlert} attention={pendingCount > 0} /></div>
      <div className="audit-grid"><section className="panel"><div className="panel-heading"><div><h3>Kurva kumulatif ABC</h3><p>Seluruh material dalam mode {mode === "FILTERED" ? "Filtered" : "Whitelist"}; urutan mengikuti rank harga yang ditetapkan.</p></div></div><AbcCurve rows={modeRows} /></section><section className="panel feature-panel"><div className="section-heading"><h2>Dasar pembacaan</h2></div><ul className={styles.ruleList}><li><strong>Rank berdasarkan harga satuan</strong><span>Filter tampilan mempertahankan rank dan persentase kumulatif asli.</span></li><li><strong>Nilai sebelum & jumlah kumulatif</strong><span>Nilai sebelum adalah persentase nilai sebelum baris ini; jumlah kumulatif mencakup baris ini.</span></li><li><strong>Kelompok RFQ tetap dapat diaudit</strong><span>Pending berstatus draft. Spesifikasi yang ditolak atau belum cocok tetap mandiri.</span></li><li><strong>Angka demonstrasi</strong><span>Status mengikuti keputusan sesi ini. Rank, kategori, dan angka sintetis tetap sesuai skenario; bukan perhitungan produksi.</span></li></ul></section></div>
      <section className="panel"><div className="panel-heading"><div><h3>Peringkat material</h3><p>{visible.length} dari {modeRows.length} material · filter hanya mengubah tabel di bawah</p></div><Link className="text-link" href="/inventory-policy/">Lihat policy <ArrowRight size={14} aria-hidden="true" /></Link></div><div className="mapping-filters"><div className="filter-field search-field"><label htmlFor="abc-query">Cari material ABC</label><input id="abc-query" className="field-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Material atau spesifikasi" /></div><div className="filter-field"><label htmlFor="abc-category">Kategori ABC</label><select id="abc-category" className="field-control" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Semua kategori</option>{["A1", "A2", "B1", "B2", "C"].map((value) => <option key={value}>{value}</option>)}</select></div></div><AbcResultTable rows={visible} mappings={mappingRows} /><p className="scope-note">Total dan kurva memakai seluruh skenario mode aktif. Alasan audit adalah catatan skenario awal; badge RFQ menunjukkan status sesi terkini.</p></section>
    </section>
  </>;
}
