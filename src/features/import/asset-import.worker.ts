import { readAssetWorkbook } from "../../lib/spreadsheet/read-asset-workbook";
import type { ParsedAssetWorkbook } from "../../lib/spreadsheet/read-asset-workbook";
import type { AssetSheetMapping } from "../../domain/asset-import/types";

export interface AssetImportWorkerRequest { file: File; ruleVersion: string; mapping?: AssetSheetMapping }
export type AssetImportWorkerResult = ({ type: "result"; sha256: string; ruleVersion: string } & Omit<ParsedAssetWorkbook, "rows">) | { type: "progress"; message: string } | { type: "error"; message: string };

// Detection proposals may map duplicate headers to one target. Preview a unique,
// editable proposal, but keep the detection evidence until the operator edits it.
function previewMapping(proposal: AssetSheetMapping): AssetSheetMapping {
  const used = new Set<string>();
  const ambiguousFields = new Set(proposal.ambiguousFields);
  const columns = proposal.columns.map(column => {
    if (!column.field) return column;
    if (used.has(column.field)) { ambiguousFields.add(column.field); return { ...column, field: null }; }
    used.add(column.field); return column;
  });
  return { ...proposal, columns, ambiguousFields: [...ambiguousFields] };
}

self.onmessage = async (event: MessageEvent<AssetImportWorkerRequest>) => {
  const { file, ruleVersion, mapping } = event.data;
  const send = (result: AssetImportWorkerResult) => self.postMessage(result);
  try {
    send({ type: "progress", message: "Membaca workbook dan menghitung SHA-256 di perangkat…" });
    const bytes = await file.arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
    let proposal = mapping ? previewMapping(mapping) : undefined;
    let parsed = await readAssetWorkbook(bytes, { ruleVersion, confirmedMapping: proposal, collectRows: false, previewLimit: 100 });
    if (!mapping && parsed.layout.requiresConfirmation && parsed.layout.candidates.length) {
      proposal = previewMapping(parsed.layout.selected ?? parsed.layout.candidates[0]);
      const partial = await readAssetWorkbook(bytes, { ruleVersion, confirmedMapping: proposal, collectRows: false, previewLimit: 100 });
      parsed = { ...partial, layout: { ...parsed.layout, selected: partial.layout.selected, requiresConfirmation: true } };
    }
    if (proposal && parsed.layout.selected) {
      parsed.layout.selected = { ...parsed.layout.selected, ambiguousFields: proposal.ambiguousFields };
      parsed.layout.requiresConfirmation ||= proposal.ambiguousFields.length > 0;
    }
    send({ type: "result", sha256, ruleVersion, ...parsed });
  } catch {
    send({ type: "error", message: "Workbook tidak dapat dibaca. Periksa XLSX, sheet, dan baris header yang dipilih." });
  }
};
