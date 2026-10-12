import { Badge } from "../../components/ui/Badge";
import type { AssetCondition, LocationPriority } from "../../domain/types";
import styles from "./location.module.css";

export interface RankedLocation extends LocationPriority {
  rank: number;
  distanceKm: number;
  worstUptCondition: AssetCondition;
  uptAssetCount: number;
  uptGiCount: number;
  rankReason: string;
}

export function LocationPriorityTable({ rows, onDetail }: { rows: readonly RankedLocation[]; onDetail: (id: string) => void }) {
  return <div className="table-scroll"><table className={`data-table compact-table ${styles.table}`}>
    <caption>Prioritas penempatan UPT / GI</caption>
    <thead><tr>
      <th scope="col" className="numeric">Peringkat</th><th scope="col">GI / UPT</th><th scope="col">Material</th><th scope="col">Kondisi lokasi</th><th scope="col">Terburuk UPT</th><th scope="col" className="numeric">Umur aset</th><th scope="col" className="numeric">Jarak Gandul (km)</th><th scope="col" className="numeric">Jumlah aset</th><th scope="col" className="numeric">Jumlah ideal referensi<span className="record-id">bukan alokasi per lokasi</span></th><th scope="col">Alasan peringkat</th><th scope="col">Audit</th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      <td className={`numeric ${styles.rank}`}>{row.rank}</td>
      <th scope="row">{row.gi}{" "}<span className="record-id">{row.upt}</span></th>
      <td>{row.materialName}</td>
      <td><Badge tone={row.condition === "P0" ? "warning" : "neutral"}>{row.condition}</Badge></td>
      <td><Badge tone={row.worstUptCondition === "P0" ? "warning" : "neutral"}>{row.worstUptCondition}</Badge></td>
      <td className="numeric">{row.assetAgeYears === null ? <span className={styles.missing}>Umur belum tersedia</span> : `${row.assetAgeYears} tahun`}</td>
      <td className="numeric">{row.distanceKm.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
      <td className="numeric">{row.assetCount}</td>
      <td className={`numeric ${styles.rank}`}>{row.idealQuantityReference} unit</td>
      <td className={styles.reason}>{row.rankReason}</td>
      <td><button className="text-button" onClick={() => onDetail(row.id)}>Detail</button></td>
    </tr>)}{rows.length === 0 && <tr><td colSpan={11} className="empty-state">Tidak ada lokasi pada filter ini.</td></tr>}</tbody>
  </table></div>;
}
