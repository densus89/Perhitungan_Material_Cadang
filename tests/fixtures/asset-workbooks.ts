import ExcelJS from "exceljs";

/** Entirely synthetic fixtures: no operational source rows. */
export const headers = ["UNIT_INDUK", "UPT", "NAMA_GI", "TID", "NO_ASET", "NAMA_PERALATAN", "SPESIFIKASI_MARA", "JUMLAH", "SATUAN", "KONDISI_ASET", "TANGGAL_OPERASI", "USIA_ASET_TAHUN", "NILAI_BUKU_SAP"];
export const assetRow: unknown[] = ["UNIT DEMO", "UPT DEMO", "GI DEMO", "0001", "000002", "TRAFO", "150/20 kV 60 MVA", 2, "UNIT", "P2", null, 10, 0];

export function gridFixture(name = "DATA_ASET", headerRow = 1) {
  return { sheets: [{ name, rows: [...Array.from({ length: headerRow - 1 }, () => ["Judul sintetis"]), [...headers], [...assetRow]] }] };
}

export async function workbookBytes(sheets: { name: string; rows: unknown[][] }[]) {
  const workbook = new ExcelJS.Workbook();
  for (const source of sheets) {
    const sheet = workbook.addWorksheet(source.name);
    source.rows.forEach((row) => sheet.addRow(row));
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
