import type { ImportResponse } from "../../domain/asset-import/schemas";
import styles from "./import.module.css";

export function ImportComparisonStep({ response, acknowledged, onSubmit, disabled }: { response: ImportResponse; acknowledged: boolean; onSubmit: () => void; disabled: boolean }) {
  const terminal = ["PENDING_RST", "ACTIVE", "HISTORICAL"].includes(response.stage);
  const blocked = response.stage !== "READY_TO_SUBMIT" || !response.summary || response.summary.blockingErrors > 0 || Boolean(response.summary.issueCounts.AGE_IMPUTED && !acknowledged);
  return <section className={`panel feature-panel ${styles.stack}`} aria-labelledby="comparison-title"><div><p className="eyebrow">04 · PERBANDINGAN VERSI</p><h2 id="comparison-title">Tinjau snapshot & ajukan persetujuan</h2></div>
    <div className={styles.notice}><strong>Snapshot lengkap Unit Induk.</strong><p>Seluruh aset unit harus tercakup. Aset yang tidak ada dalam berkas akan ditandai dihapus dibanding versi aktif. Pengajuan meminta persetujuan DIV RST; versi aktif berubah setelah persetujuan.</p></div>
    {response.comparison ? <><p>{response.comparison.hasActiveVersion ? "Dibandingkan dengan versi aktif saat run diproses." : "Belum ada versi aktif sebagai pembanding; ini snapshot pertama unit."}</p><div className={styles.tags}>{Object.entries({ ADDED: "Ditambah", REMOVED: "Dihapus", CHANGED: "Berubah", UNCHANGED: "Tetap", AMBIGUOUS: "Identitas ambigu" }).map(([key, label]) => <span key={key}>{label}: {response.comparison?.counts[key] ?? 0}</span>)}</div><h3>Pergeseran sumber nilai</h3><div className={styles.tags}>{Object.entries(response.comparison.sourceShifts).map(([source, delta]) => <span key={source}>{source}: {delta > 0 ? "+" : ""}{delta}</span>)}</div></> : !terminal && <p role="status">Perbandingan server belum tersedia. Periksa status sebelum pengajuan.</p>}
    {terminal ? <p role="status">{response.stage === "PENDING_RST" ? "Diajukan · menunggu persetujuan DIV RST. Versi aktif tetap berlaku selama tinjauan." : response.stage === "ACTIVE" ? "Versi ini aktif setelah persetujuan DIV RST." : "Versi ini tersimpan sebagai riwayat."}</p> : <button className="button button--primary" disabled={disabled || blocked || !response.comparison} onClick={onSubmit}>Ajukan persetujuan DIV RST</button>}
  </section>;
}
