import { Badge } from "../../components/ui/Badge";
import type { PolicyRow } from "../../domain/types";
import { DemoModal } from "../mapping/MappingDetailDrawer";
import styles from "../abc/analysis.module.css";

export const policyMethodLabels = { MANDATORY: "Mandatory", OPTIMUM: "Optimum", ECONOMIC: "Economic", NONE: "Tidak dicadangkan" };

export function PolicyDetailDrawer({ row, onClose }: { row: PolicyRow; onClose: () => void }) {
  const optimum = row.method === "OPTIMUM";
  return <DemoModal title="Penjelasan inventory policy" onClose={onClose} drawer>
    <p className="eyebrow">{row.category} · {policyMethodLabels[row.method]}</p><h3>{row.materialName}</h3><p className="page-description">{row.specification}</p><Badge tone={row.status === "DRAFT" ? "warning" : "demo"}>{row.status === "DRAFT" ? "Draft · Menunggu approval RFQ" : "Contoh hasil sintetis"}</Badge>
    <dl className="metadata-grid"><div><dt>Populasi</dt><dd>{row.population}</dd></div><div><dt>Riwayat kegagalan</dt><dd>{row.failureCount} dalam {row.historyYears} tahun</dd></div><div><dt>Lead time</dt><dd>{row.leadTimeMonths} bulan</dd></div><div><dt>Harga satuan</dt><dd>Rp {row.unitPrice.toLocaleString("id-ID")}</dd></div><div><dt>Jumlah ideal</dt><dd>{row.category === "C" ? 0 : row.idealQuantity} unit</dd></div><div><dt>Status RFQ</dt><dd>{row.mappingStatus}</dd></div></dl>
    <div className={styles.formula}><strong>Dasar metode</strong>{row.category === "C" ? <p>Kategori C selalu 0, terlepas dari lead time.</p> : row.method === "MANDATORY" ? <p>A1 → Mandatory. Jumlah minimum material kritis mengikuti contoh skenario.</p> : optimum ? <><p>A2 atau B1 dengan kegagalan positif → Optimum.</p><code>Laju kegagalan tahunan = kegagalan / tahun histori</code><code>Ekspektasi kebutuhan selama lead time = laju tahunan × lead time / 12</code><p>Rumus menerangkan masukan; angka kandidat di bawah adalah nilai sintetis yang ditetapkan untuk demo.</p></> : <p>B1 tanpa kegagalan atau B2 → Economic. Jumlah ekonomis mengikuti nilai contoh skenario.</p>}</div>
    {optimum && <><div className="table-scroll"><table className="data-table"><caption>Kandidat Optimum sintetis</caption><thead><tr><th scope="col">Pertimbangan</th><th scope="col" className="numeric">Jumlah (unit)</th></tr></thead><tbody><tr><th scope="row">Reliabilitas</th><td className="numeric">{row.reliabilityQuantity}</td></tr><tr><th scope="row">Biaya</th><td className="numeric">{row.costQuantity}</td></tr><tr><th scope="row">Gabungan</th><td className="numeric">{row.combinedQuantity}</td></tr></tbody></table></div><p className="guard-note">Gabungan optimum tidak selalu mencapai 99%. Reliabilitas contoh gabungan ini: {row.achievedReliabilityPercent?.toLocaleString("id-ID")}%.</p></>}
    <p className="page-description">{row.explanation}</p><p className="scope-note">Penjelasan skenario demo, bukan mesin perhitungan operasional. Keputusan RFQ memperbarui status; jumlah dan kandidat tetap sintetis.</p>
  </DemoModal>;
}
