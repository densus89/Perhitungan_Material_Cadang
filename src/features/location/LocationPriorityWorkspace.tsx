"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, ShieldAlert, Clock, Building2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { KpiCard } from "../../components/ui/KpiCard";
import { gandul, locationPriorities, policyRows } from "../../demo/fixtures";
import { sortLocationPriorities } from "../../domain/location-priority";
import { LocationPriorityTable, type RankedLocation } from "./LocationPriorityTable";
import { LocationDetailDrawer } from "./LocationDetailDrawer";
import styles from "./location.module.css";

export function LocationPriorityWorkspace() {
  const [condition, setCondition] = useState("ALL");
  const [upt, setUpt] = useState("ALL");
  const [giQuery, setGiQuery] = useState("");
  const [displayOrder, setDisplayOrder] = useState("PRIORITY");
  const [detailId, setDetailId] = useState<string | null>(null);
  const sorted = sortLocationPriorities(locationPriorities, gandul);
  const rows: RankedLocation[] = sorted.map((row, index) => {
    const uptRows = sorted.filter((item) => item.upt === row.upt);
    const sameAge = sorted.some((item) => item.id !== row.id && item.condition === row.condition && item.assetAgeYears === row.assetAgeYears);
    const ageReason = row.assetAgeYears === null
      ? "Umur belum tersedia; sesama umur kosong memakai jarak Haversine ke Gandul."
      : sameAge
        ? `Umur sama (${row.assetAgeYears} tahun); jarak Haversine ke Gandul yang lebih dekat didahulukan.`
        : `Umur diketahui (${row.assetAgeYears} tahun); umur lebih tua didahulukan dalam kondisi yang sama, sebelum umur kosong.`;
    return {
      ...row, rank: index + 1, distanceKm: row.distanceKm!,
      worstUptCondition: uptRows[0].condition,
      uptAssetCount: uptRows.reduce((total, item) => total + item.assetCount, 0),
      uptGiCount: new Set(uptRows.map((item) => item.gi)).size,
      rankReason: `${row.condition} menurut urutan P0 → P4. ${ageReason} Jika jarak sama, nama GI lalu UPT menjadi pembeda.`,
    };
  });
  const visible = rows.filter((row) => (condition === "ALL" || row.condition === condition)
    && (upt === "ALL" || row.upt === upt)
    && row.gi.toLocaleLowerCase("id-ID").includes(giQuery.toLocaleLowerCase("id-ID")));
  if (displayOrder === "DISTANCE") visible.sort((left, right) => left.distanceKm - right.distanceKm || left.rank - right.rank);
  if (displayOrder === "GI") visible.sort((left, right) => left.gi.localeCompare(right.gi, "id-ID") || left.upt.localeCompare(right.upt, "id-ID") || left.rank - right.rank);
  const detail = rows.find((row) => row.id === detailId);

  function resetFilters() { setCondition("ALL"); setUpt("ALL"); setGiQuery(""); setDisplayOrder("PRIORITY"); }

  return <>
    <div className="page-heading"><div><p className="eyebrow">PENEMPATAN MATERIAL CADANG</p><h1>Prioritas Lokasi</h1><p className="page-description">Urutan kebutuhan UPT / GI berdasarkan kondisi aset, umur, dan kedekatan dengan Gandul.</p></div><Badge tone="demo">Skenario sintetis</Badge></div>
    <div className="kpi-grid">
      <KpiCard label="Lokasi dalam prioritas" value={rows.length} detail="Seluruh kondisi P0–P4 tetap dalam data" icon={MapPin} />
      <KpiCard label="Lokasi P0" value={rows.filter((row) => row.condition === "P0").length} detail="Kondisi paling kritis didahulukan" icon={ShieldAlert} attention />
      <KpiCard label="UPT tercakup" value={new Set(rows.map((row) => row.upt)).size} detail="Diwakili kondisi terburuk seluruh aset" icon={Building2} />
      <KpiCard label="Umur belum tersedia" value={rows.filter((row) => row.assetAgeYears === null).length} detail="Sesama umur kosong dibandingkan jaraknya" icon={Clock} />
    </div>
    <section className={`panel feature-panel ${styles.summary}`} aria-label="Dasar urutan prioritas">
      <div className="section-heading"><h2>Dasar urutan prioritas</h2><Link href="/inventory-policy/" className="text-link"><ArrowLeft size={14} aria-hidden="true" /> Inventory Policy</Link></div>
      <p className="page-description">P0 → P1 → P2 → P3 → P4. Dalam kondisi yang sama, umur diketahui mendahului umur kosong dan umur lebih tua didahulukan. Umur sama atau keduanya kosong memakai jarak Haversine terdekat ke Gandul, lalu nama GI dan UPT.</p>
      <p className="page-description">Kondisi lokasi mewakili aset terburuk pada GI. Kondisi terburuk UPT dihitung dari seluruh aset pada semua GI dalam UPT, termasuk lokasi yang disembunyikan filter.</p>
      <p className="scope-note">Jumlah ideal referensi berasal dari policy material: bukan alokasi per lokasi. Angka berulang tidak dijumlahkan atau dikalikan dengan jumlah lokasi maupun aset.</p>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h3>Prioritas penempatan</h3><p aria-live="polite">{visible.length} dari {rows.length} lokasi · peringkat tetap mengikuti seluruh data</p></div><button className="button" onClick={resetFilters}>Reset filter</button></div>
      <div className={`mapping-filters ${styles.filters}`}>
        <div className="filter-field search-field"><label htmlFor="location-gi">Cari GI</label><input id="location-gi" className="field-control" placeholder="Nama GI" value={giQuery} onChange={(event) => setGiQuery(event.target.value)} /></div>
        <div className="filter-field"><label htmlFor="location-condition">Kondisi lokasi</label><select id="location-condition" className="field-control" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="ALL">Semua P0–P4</option>{["P0", "P1", "P2", "P3", "P4"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className="filter-field"><label htmlFor="location-upt">UPT</label><select id="location-upt" className="field-control" value={upt} onChange={(event) => setUpt(event.target.value)}><option value="ALL">Semua UPT</option>{[...new Set(rows.map((row) => row.upt))].sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className="filter-field"><label htmlFor="location-order">Urutan tampilan</label><select id="location-order" className="field-control" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)}><option value="PRIORITY">Peringkat prioritas</option><option value="DISTANCE">Jarak terdekat</option><option value="GI">Nama GI / UPT</option></select></div>
      </div>
      <LocationPriorityTable rows={visible} onDetail={setDetailId} />
      <p className="scope-note">Filter hanya menyembunyikan baris. Mengubah urutan tampilan tidak mengubah peringkat prioritas, kondisi terburuk UPT, atau jumlah ideal referensi.</p>
    </section>
    {detail && <LocationDetailDrawer row={detail} policy={policyRows.find((row) => row.id === detail.policyId)} onClose={() => setDetailId(null)} />}
  </>;
}
