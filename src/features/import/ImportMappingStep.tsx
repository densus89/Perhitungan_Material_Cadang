import { CANONICAL_ASSET_FIELDS } from "../../domain/asset-import/fields";
import type { AssetSheetMapping, CanonicalAssetInput } from "../../domain/asset-import/types";
import styles from "./import.module.css";

export function ImportMappingStep({ mapping, candidates, confirmed, onChange, onConfirm, disabled }: { mapping: AssetSheetMapping; candidates: AssetSheetMapping[]; confirmed: boolean; onChange: (mapping: AssetSheetMapping) => void; onConfirm: (confirmed: boolean) => void; disabled: boolean }) {
  const fields = mapping.columns.flatMap(column => column.field ? [column.field] : []);
  const missing = CANONICAL_ASSET_FIELDS.filter(field => field.requirement === "REQUIRED" && !fields.includes(field.key));
  const valid = !missing.length && new Set(fields).size === fields.length;
  function assign(field: keyof CanonicalAssetInput, index: number) {
    const columns = mapping.columns.map(column => ({ ...column, field: column.columnIndex === index ? field : column.field === field ? null : column.field }));
    onChange({ ...mapping, columns, ambiguousFields: [], missingRequiredFields: CANONICAL_ASSET_FIELDS.filter(target => target.requirement === "REQUIRED" && !columns.some(column => column.field === target.key)).map(target => target.key) });
  }
  return <section className={`panel feature-panel ${styles.stack}`} aria-labelledby="mapping-title">
    <div><p className="eyebrow">02 · PEMETAAN KOLOM</p><h2 id="mapping-title">Konfirmasi sheet, header & target</h2></div>
    <label className="field-label" htmlFor="import-sheet">Sheet dan baris header</label><select id="import-sheet" className="field-control" disabled={disabled} value={`${mapping.sheetName}:${mapping.headerRow}`} onChange={event => { const candidate = candidates.find(item => `${item.sheetName}:${item.headerRow}` === event.target.value); if (candidate) onChange(candidate); }}>{candidates.map(candidate => <option key={`${candidate.sheetName}:${candidate.headerRow}`} value={`${candidate.sheetName}:${candidate.headerRow}`}>{candidate.sheetName} · header baris {candidate.headerRow} · keyakinan {Math.round(candidate.confidence * 100)}%</option>)}</select>
    <p className="section-note">Label huruf dan indeks membedakan header yang sama. Satu kolom sumber hanya dapat mengisi satu target.</p>
    {mapping.ambiguousFields.length > 0 && <p role="status">Header ambigu: {mapping.ambiguousFields.join(", ")}. Periksa pilihan huruf dan indeks sebelum konfirmasi.</p>}
    <div className={styles.mappingGrid}>{CANONICAL_ASSET_FIELDS.map(field => <div key={field.key}><label className="field-label" htmlFor={`mapping-${field.key}`}>{field.header}{field.requirement === "REQUIRED" ? " (wajib)" : field.requirement === "CONDITIONAL" ? " (bersyarat)" : " (opsional)"}</label><select id={`mapping-${field.key}`} className="field-control" disabled={disabled} value={mapping.columns.find(column => column.field === field.key)?.columnIndex ?? ""} onChange={event => assign(field.key, Number(event.target.value))}><option value="">Tidak dipetakan</option>{mapping.columns.map(column => <option key={column.columnIndex} value={column.columnIndex} disabled={Boolean(column.field && column.field !== field.key)}>{column.columnLetter} · {column.columnIndex} · {column.header || "(header kosong)"}</option>)}</select><p className="section-note">{field.description}</p></div>)}</div>
    {missing.length > 0 && <p role="status">Target wajib belum lengkap: {missing.map(field => field.header).join(", ")}.</p>}
    <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled || !valid} onChange={event => onConfirm(event.target.checked)} />Saya mengonfirmasi pemetaan sheet, header, dan seluruh target wajib.</label>
    <p className="section-note">Pemetaan dikonfirmasi disimpan bersama draft; server membaca kembali berkas asli dan memeriksa hash.</p>
  </section>;
}
