"use client";

import { ArrowRight, Boxes, CircleCheck, Clock3, FileSpreadsheet, MapPin, Package } from "lucide-react";
import Link from "next/link";
import { AbcCurve } from "../../../src/components/charts/AbcCurve";
import { ClassDistribution } from "../../../src/components/charts/ClassDistribution";
import { Badge } from "../../../src/components/ui/Badge";
import { KpiCard } from "../../../src/components/ui/KpiCard";
import { StatusBanner } from "../../../src/components/ui/StatusBanner";
import { abcResults, demoSummary, sourceFiles } from "../../../src/demo/fixtures";
import { useDemoWorkspace } from "../../../src/state/DemoWorkspaceProvider";

export default function SummaryPage() {
  const { mappingRows } = useDemoWorkspace();
  const pendingMappingCount = mappingRows.filter((row) => row.status === "MENUNGGU_APPROVAL").length;
  const standaloneCount = mappingRows.filter((row) => row.status === "SPESIFIKASI_MANDIRI").length;
  const filteredAbc = abcResults.filter((row) => row.mode === "FILTERED");

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>Ringkasan perencanaan</h1><p className="page-description">Pantau kesiapan data, klasifikasi material, dan keputusan pencadangan.</p></div><Link className="button button--primary" href="/impor/"><FileSpreadsheet size={16} aria-hidden="true" />Impor data</Link></div>
      {pendingMappingCount > 0
        ? <StatusBanner href="/pemetaan-rfq/" action="Tinjau pemetaan"><strong>{pendingMappingCount} pemetaan RFQ menunggu approval.</strong> Hasil policy terkait masih berstatus draft.</StatusBanner>
        : <StatusBanner href="/inventory-policy/" action="Tinjau policy"><strong>Semua pemetaan RFQ telah ditinjau.</strong> Keputusan sesi demo siap ditinjau pada Inventory Policy.</StatusBanner>}
      <section className="kpi-grid" aria-label="Indikator perencanaan">
        <KpiCard label="Material dianalisis" value={demoSummary.materialCount} detail="Baris inventory policy demo" icon={Package} />
        <KpiCard label="Populasi aset" value={demoSummary.assetCount} detail="Aset pada pemetaan spesifikasi" icon={Boxes} />
        <KpiCard label="Menunggu approval" value={pendingMappingCount} detail={pendingMappingCount > 0 ? "Pemetaan perlu keputusan reviewer" : "Seluruh keputusan pemetaan selesai"} icon={Clock3} attention={pendingMappingCount > 0} />
        <KpiCard label="Lokasi prioritas" value={demoSummary.locationCount} detail="Lokasi referensi, belum dialokasikan" icon={MapPin} />
      </section>
      <div className="section-heading"><h2>Profil material</h2><span className="section-note">Mode: populasi terfilter · {filteredAbc.length} kelompok ABC</span></div>
      <div className="chart-grid">
        <section className="panel" aria-labelledby="abc-curve-title"><div className="panel-heading"><div><h3 id="abc-curve-title">Kurva kumulatif ABC</h3><p>Kontribusi nilai terhadap populasi efektif</p></div><Link className="text-link" href="/analisis-abc/">Buka analisis<ArrowRight size={14} aria-hidden="true" /></Link></div><AbcCurve rows={filteredAbc} /></section>
        <section className="panel" aria-labelledby="distribution-title"><div className="panel-heading"><div><h3 id="distribution-title">Distribusi kelas</h3><p>Jumlah kelompok per kategori</p></div><Badge>Terfilter</Badge></div><ClassDistribution rows={filteredAbc} /></section>
      </div>
      <div className="section-heading"><h2>Kesiapan &amp; jejak data</h2><span className="section-note">Skenario demonstrasi</span></div>
      <div className="audit-grid">
        <section className="panel" aria-labelledby="source-title"><div className="panel-heading"><div><h3 id="source-title">Sumber data</h3><p>File sintetis untuk alur demonstrasi</p></div><Link className="text-link" href="/impor/">Kelola impor<ArrowRight size={14} aria-hidden="true" /></Link></div><div className="table-scroll"><table className="data-table"><caption className="sr-only">Status sumber data demo</caption><thead><tr><th scope="col">File sumber</th><th scope="col" className="numeric">Baris</th><th scope="col">Status</th></tr></thead><tbody>{sourceFiles.map((file) => <tr key={file.id}><th scope="row"><FileSpreadsheet size={15} aria-hidden="true" />{file.name}</th><td className="numeric">{file.rowCount}</td><td><Badge tone={file.status === "VALID" ? "success" : "warning"}>{file.status === "VALID" ? "Valid" : "Perlu tinjauan"}</Badge></td></tr>)}</tbody></table></div></section>
        <section className="panel" aria-labelledby="audit-title"><div className="panel-heading"><div><h3 id="audit-title">Catatan perencanaan</h3><p>Status eksplisit untuk setiap keputusan</p></div></div><ul className="audit-list"><li><CircleCheck size={17} aria-hidden="true" /><div><strong>{standaloneCount} spesifikasi mandiri</strong><p>Tetap dianalisis sebagai kelompok terpisah.</p></div></li><li><Clock3 size={17} aria-hidden="true" /><div><strong>{demoSummary.missingAgeCount} lokasi belum memiliki usia aset</strong><p>Ditandai untuk tinjauan pada prioritas lokasi.</p></div></li><li><MapPin size={17} aria-hidden="true" /><div><strong>Alokasi lokasi belum final</strong><p>Jumlah ideal tampil sebagai referensi pencadangan.</p></div></li></ul></section>
      </div>
      <section className="next-step"><div><h2>Lanjutkan perencanaan</h2><p>{pendingMappingCount > 0 ? "Selesaikan pemetaan RFQ sebelum meninjau hasil policy." : "Tinjau hasil policy berdasarkan keputusan pemetaan sesi ini."}</p></div><div className="next-step-links"><Link href="/inventory-policy/">Inventory Policy<ArrowRight size={15} aria-hidden="true" /></Link><Link href="/prioritas-lokasi/">Prioritas Lokasi<ArrowRight size={15} aria-hidden="true" /></Link></div></section>
    </>
  );
}
