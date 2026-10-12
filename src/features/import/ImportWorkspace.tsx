"use client";

import { FileSpreadsheet, Upload, ArrowRight } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { useDemoWorkspace, type ImportStage } from "../../state/DemoWorkspaceProvider";
import { locationPriorities } from "../../demo/fixtures";

const stages = ["Unggah", "Mapping", "Validasi", "Siap"];

export function ImportWorkspace() {
  const workspace = useDemoWorkspace();
  const { importStage, localFileMetadata, demoSourcesSelected, mappingRows } = workspace;
  const pending = mappingRows.filter((row) => row.status === "MENUNGGU_APPROVAL").length;
  const standalone = mappingRows.filter((row) => row.status === "SPESIFIKASI_MANDIRI").length;
  const missingAge = locationPriorities.filter((row) => row.assetAgeYears === null).length;
  const canContinue = Boolean(localFileMetadata || demoSourcesSelected);

  return <>
    <header className="page-heading"><div><p className="eyebrow">PERSIAPAN DATA</p><h1>Impor & kualitas data</h1><p className="page-description">Simulasikan persiapan sumber dan tinjau kualitas data sintetis.</p></div><button className="button" onClick={workspace.resetDemo}>Reset data demo</button></header>
    <div className="status-banner"><Upload size={18} aria-hidden="true" /><p>Mockup v1 tidak membaca, mem-parsing, atau mengunggah isi berkas. Pilihan lokal hanya menampilkan metadata; seluruh hasil tetap memakai data sintetis.</p></div>
    <ol className="import-stages" aria-label="Tahapan impor">{stages.map((name, index) => <li key={name} aria-current={importStage === index ? "step" : undefined} className={index <= importStage ? "stage-active" : ""}><span>{index + 1}</span>{name}</li>)}</ol>
    <section className="panel feature-panel" aria-labelledby="import-step-title">
      <div className="section-heading"><h2 id="import-step-title">{stages[importStage]}</h2><Badge tone="demo">Simulasi · {importStage + 1}/4</Badge></div>
      {importStage === 0 && <>
        <div className="import-dropzone"><FileSpreadsheet size={32} aria-hidden="true" /><h3>Pilih sumber untuk simulasi</h3><p className="page-description">Metadata berkas lokal hanya tersimpan dalam memori sesi ini.</p><label className="field-label" htmlFor="local-file">Pilih berkas lokal (metadata saja)</label><input id="local-file" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.target.files?.[0]; workspace.selectFileMetadata(file ? { name: file.name, size: file.size, type: file.type || "Tidak diketahui" } : null); event.target.value = ""; }} /><span className="section-note">atau gunakan sumber sintetis yang sudah tersedia</span><button className="button button--primary" onClick={workspace.useDemoSources}>Gunakan sumber demo</button></div>
        {localFileMetadata && <dl className="metadata-grid"><div><dt>Nama berkas</dt><dd>{localFileMetadata.name}</dd></div><div><dt>Ukuran</dt><dd>{localFileMetadata.size} byte</dd></div><div><dt>Tipe</dt><dd>{localFileMetadata.type}</dd></div></dl>}
        {demoSourcesSelected && <p className="feedback-message" role="status">Sumber demo dipilih. Tidak ada berkas lokal yang dibaca.</p>}
        <div className="table-scroll"><table className="data-table"><caption>Sumber sintetis tersedia</caption><thead><tr><th scope="col">Sumber</th><th scope="col">Jenis</th><th scope="col">Baris demo</th><th scope="col">Status</th></tr></thead><tbody>{workspace.sourceFiles.map((file) => <tr key={file.id}><th scope="row">{file.name}</th><td>{file.kind}</td><td>{file.rowCount}</td><td><Badge tone={file.status === "VALID" ? "success" : "warning"}>{file.status === "VALID" ? "Valid" : "Perlu tinjauan"}</Badge></td></tr>)}</tbody></table></div>
      </>}
      {importStage === 1 && <div className="feature-stack"><p className="page-description">Pemetaan kolom berikut adalah contoh dari sumber sintetis, bukan hasil pembacaan berkas pilihan.</p><label className="field-label" htmlFor="spec-column">Kolom spesifikasi demo</label><select id="spec-column" className="field-control" defaultValue="spesifikasi"><option value="spesifikasi">Spesifikasi material → originalSpecification</option><option value="deskripsi">Deskripsi material → originalSpecification</option></select><div className="metadata-grid"><div><dt>Identitas aset</dt><dd>ID aset demo</dd></div><div><dt>Lokasi</dt><dd>UPT + GI demo</dd></div><div><dt>Katalog</dt><dd>Target RFQ demo</dd></div></div><p className="section-note">Pilihan ini hanya mensimulasikan konfigurasi; fixture dan hasil perhitungan tidak berubah.</p></div>}
      {importStage === 2 && <><p className="page-description">Ringkasan berikut hanya berasal dari fixture sintetis yang aktif.</p><div className="table-scroll"><table className="data-table"><caption>Kualitas data sintetis</caption><thead><tr><th scope="col">Pemeriksaan</th><th scope="col">Jumlah</th><th scope="col">Tindak lanjut</th></tr></thead><tbody><tr><th scope="row">Pemetaan menunggu approval</th><td>{pending}</td><td>Tinjau usulan RFQ sebelum penggabungan</td></tr><tr><th scope="row">Spesifikasi mandiri</th><td>{standalone}</td><td>Pertahankan kelompok spesifikasi sendiri</td></tr><tr><th scope="row">Usia aset kosong</th><td>{missingAge}</td><td>Gunakan jarak untuk urutan prioritas berikutnya</td></tr><tr><th scope="row">Nama GI lintas UPT</th><td>2</td><td>Identitas tetap memakai UPT + GI</td></tr></tbody></table></div></>}
      {importStage === 3 && <div className="feature-stack"><Badge tone="success">Skenario demo siap ditinjau</Badge><h3>Data sintetis tersedia untuk proses berikutnya</h3><p className="page-description">{pending} pemetaan masih menunggu approval. Persetujuan RFQ tetap diperlukan untuk usulan yang mendekati spesifikasi.</p><a href="/pemetaan-rfq/" className="button button--primary">Tinjau pemetaan RFQ <ArrowRight size={16} aria-hidden="true" /></a></div>}
      <div className="wizard-actions">{importStage > 0 && <button className="button" onClick={() => workspace.setImportStage((importStage - 1) as ImportStage)}>Kembali</button>}{importStage < 3 && <button className="button button--primary" disabled={!canContinue} onClick={() => workspace.setImportStage((importStage + 1) as ImportStage)}>Lanjut ke {stages[importStage + 1]} <ArrowRight size={14} aria-hidden="true" /></button>}</div>
    </section>
  </>;
}
