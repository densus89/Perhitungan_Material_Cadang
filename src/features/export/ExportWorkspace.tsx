"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { useDemoWorkspace } from "../../state/DemoWorkspaceProvider";
import { createDemoSnapshot, serializeDemoCsv, type CsvSection } from "./export-demo";

export function ExportWorkspace() {
  const { mappingRows } = useDemoWorkspace();
  const [feedback, setFeedback] = useState("");
  const snapshot = createDemoSnapshot({ mappingRows });

  function download(section?: CsvSection) {
    const content = section ? "\uFEFF" + serializeDemoCsv(snapshot, section) : JSON.stringify(snapshot, null, 2);
    const filename = section ? `material-cadang-demo-${section}.csv` : "material-cadang-demo.json";
    const url = URL.createObjectURL(new Blob([content], { type: section ? "text/csv;charset=utf-8" : "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback(`${filename} siap diunduh. Seluruh data bersifat sintetis.`);
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">SNAPSHOT RUANG KERJA</p><h1>Ekspor Demo</h1><p className="page-description">Unduh skenario sintetis beserta keputusan pemetaan RFQ pada sesi ini.</p></div><Badge tone="demo">Skenario sintetis</Badge></header>
    <div className="status-banner"><ShieldCheck size={18} aria-hidden="true" /><p><strong>Data sintetis untuk demonstrasi.</strong> Ekspor hanya memuat skenario demo dan keputusan sesi; nama berkas lokal dan sumber impor tidak disertakan.</p></div>
    <section className="panel feature-panel feature-stack" aria-label="Unduh data demo">
      <h2>Snapshot sesi demo</h2>
      <p className="page-description">JSON mencakup audit pemetaan, analisis ABC, inventory policy, dan seluruh prioritas lokasi. CSV tersedia per tabel. Filter tampilan tidak membatasi isi ekspor.</p>
      <dl className="metadata-grid export-summary"><div><dt>Audit pemetaan</dt><dd>{snapshot.approvalAudit.length} baris · {snapshot.approvalAudit.filter((row) => row.status === "DISETUJUI").length} disetujui</dd></div><div><dt>Inventory policy</dt><dd>{snapshot.policies.length} baris · {snapshot.policies.filter((row) => row.status === "DRAFT").length} draft</dd></div><div><dt>Prioritas lokasi</dt><dd>{snapshot.locations.length} lokasi · referensi policy</dd></div></dl>
      <div className="toolbar-actions export-actions"><button className="button button--primary" onClick={() => download()}><Download size={16} aria-hidden="true" />Unduh snapshot JSON</button><button className="button" onClick={() => download("approvalAudit")}>Unduh audit CSV</button><button className="button" onClick={() => download("policies")}>Unduh policy CSV</button><button className="button" onClick={() => download("locations")}>Unduh lokasi CSV</button></div>
      <p className="page-description">Angka policy dan ABC adalah nilai ilustratif. Ekspor ini bukan hasil perhitungan operasional.</p>
    </section>
    <section className="panel feature-panel export-reference" aria-label="Batas penggunaan referensi lokasi"><h2>Jumlah ideal adalah referensi material</h2><p className="page-description">Setiap baris lokasi membawa satu <code>idealQuantityReference</code> dan <code>allocationStatus: REFERENCE_ONLY</code>. Angka berulang tidak dijumlahkan atau dikalikan dengan lokasi maupun aset. Ekspor tidak menghasilkan alokasi per GI / UPT.</p></section>
    {feedback && <p className="feedback-message" role="status">{feedback}</p>}
  </>;
}
