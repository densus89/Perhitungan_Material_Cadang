import Link from "next/link";
import { Badge } from "../../components/ui/Badge";
import { gandul } from "../../demo/fixtures";
import type { PolicyRow } from "../../domain/types";
import { DemoModal } from "../mapping/MappingDetailDrawer";
import { policyMethodLabels } from "../policy/PolicyDetailDrawer";
import type { RankedLocation } from "./LocationPriorityTable";
import styles from "./location.module.css";

export function LocationDetailDrawer({ row, policy, onClose }: { row: RankedLocation; policy?: PolicyRow; onClose: () => void }) {
  return <DemoModal title="Detail prioritas lokasi" onClose={onClose} drawer>
    <p className="eyebrow">PERINGKAT {row.rank} · {row.upt}</p><h3>{row.gi}</h3><p className="page-description">{row.materialName}</p><Badge tone="demo">Skenario sintetis</Badge>
    <dl className="metadata-grid">
      <div><dt>Kondisi lokasi</dt><dd>{row.condition} · terburuk dari {row.assetCount} aset pada GI</dd></div>
      <div><dt>Kondisi terburuk UPT</dt><dd>{row.worstUptCondition} · {row.uptAssetCount} aset di {row.uptGiCount} GI</dd></div>
      <div><dt>Umur aset</dt><dd>{row.assetAgeYears === null ? "Umur belum tersedia" : `${row.assetAgeYears} tahun`}</dd></div>
      <div><dt>Koordinat lokasi</dt><dd>{row.latitude}, {row.longitude}</dd></div>
      <div><dt>Koordinat Gandul</dt><dd>{gandul.latitude}, {gandul.longitude}</dd></div>
      <div><dt>Jarak Haversine ke Gandul</dt><dd>{row.distanceKm.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km · jarak garis lurus</dd></div>
    </dl>
    <div className={styles.explanation}><strong>Alasan peringkat {row.rank}</strong><p>{row.rankReason}</p><p>Kondisi terburuk mewakili seluruh aset UPT; ringkasan tetap memakai semua GI saat filter menyembunyikan lokasi.</p></div>
    <dl className="audit-detail"><div><dt>Policy material</dt><dd>{policy?.specification ?? row.materialName}</dd></div>{policy && <div><dt>Metode policy</dt><dd>{policy.category} · {policyMethodLabels[policy.method]}</dd></div>}<div><dt>Jumlah ideal referensi</dt><dd>{row.idealQuantityReference} unit</dd></div></dl>
    <p className="guard-note">Jumlah ideal referensi: bukan alokasi per lokasi. Referensi material yang sama tidak dijumlahkan atau dikalikan dengan jumlah GI, UPT, maupun aset.</p>
    <Link href="/inventory-policy/" className="text-link">Lihat Inventory Policy</Link>
  </DemoModal>;
}
