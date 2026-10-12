import { Badge } from "../../components/ui/Badge";
import { policyRows } from "../../demo/fixtures";
import type { AbcResult, MappingSuggestion } from "../../domain/types";
import { hasPendingRfqPeer } from "./rfq-presentation";
import styles from "./analysis.module.css";

const number = (value: number) => value.toLocaleString("id-ID");
const percent = (value: number) => value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AbcResultTable({ rows, mappings }: { rows: readonly AbcResult[]; mappings: readonly MappingSuggestion[] }) {
  return <div className="table-scroll"><table className={`data-table compact-table ${styles.table}`}>
    <caption>Peringkat harga dan audit ABC</caption>
    <thead><tr><th scope="col" className="numeric">Rank harga</th><th scope="col">Material / spesifikasi</th><th scope="col" className="numeric">Harga satuan (Rp)</th><th scope="col" className="numeric">Jumlah efektif</th><th scope="col" className="numeric">Nilai perolehan (Rp)</th><th scope="col" className="numeric">Nilai sebelum (%)</th><th scope="col" className="numeric">Jumlah kumulatif (%)</th><th scope="col">Kategori</th><th scope="col">Status RFQ</th><th scope="col">Alasan audit</th></tr></thead>
    <tbody>{rows.map((row) => {
      const policy = policyRows.find((item) => item.materialName === row.materialName);
      const mapping = mappings.find((item) => item.id === policy?.mappingId);
      const pending = hasPendingRfqPeer(mappings, policy?.mappingId);
      const standalone = mapping?.status === "SPESIFIKASI_MANDIRI";
      return <tr key={row.id}><td className="numeric">{row.rank}</td><th scope="row">{row.materialName}<span className="record-id specification-text">{row.specification}</span></th><td className="numeric">{number(row.unitPrice)}</td><td className="numeric">{number(row.effectiveQuantity)}</td><td className="numeric">{number(row.acquisitionValue)}</td><td className="numeric">{percent(row.valueBeforePercent)}</td><td className="numeric">{percent(row.quantityThroughPercent)}</td><td><span className={styles.category}>{row.category}</span></td><td><Badge tone={pending ? "warning" : standalone ? "neutral" : "success"}>{pending ? "Draft" : standalone ? "Spesifikasi mandiri" : mapping?.status === "DISETUJUI" ? "Disetujui" : "Diterima otomatis"}</Badge>{pending && <span className="record-id">Menunggu approval RFQ</span>}</td><td><span className="specification-text">{row.auditReason}</span></td></tr>;
    })}{rows.length === 0 && <tr><td colSpan={10} className="empty-state">Tidak ada material pada filter ini.</td></tr>}</tbody>
  </table></div>;
}
