import "server-only";
import ExcelJS from "exceljs";
import { CANONICAL_ASSET_FIELDS } from "../../domain/asset-import/fields";
import type { AssetCondition, CanonicalAssetField } from "../../domain/asset-import/types";

const conditions: readonly AssetCondition[] = ["P0", "P1", "P2", "P3", "P4"];
const units = ["UNIT", "SET", "BUAH", "METER", "KM", "KG", "LITER"];
const preparedRows = 1000;
const requirementLabels = { REQUIRED: "Wajib", CONDITIONAL: "Kondisional", OPTIONAL: "Opsional" };
const formats: Record<CanonicalAssetField["format"], string> = {
  TEXT: "@", NUMBER: "#,##0.####", MONEY: "#,##0.00", DATE: "dd/mm/yyyy", CONDITION: "@", UNIT: "@",
};

function styleHeader(row: ExcelJS.Row) {
  row.height = 44;
  row.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

export async function buildAssetTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet("PETUNJUK");
  const data = workbook.addWorksheet("DATA_ASET", { views: [{ state: "frozen", ySplit: 1 }] });
  const references = workbook.addWorksheet("REFERENSI", { views: [{ state: "frozen", ySplit: 1 }] });

  instructions.columns = [{ width: 34 }, { width: 100 }];
  instructions.addRow(["Template snapshot aset", "Aturan pengisian"]);
  const guidance = [
    ["Cakupan", "Satu workbook berisi snapshot lengkap satu Unit Induk. Isi DATA_ASET mulai baris 2; satu baris per aset atau kelompok aset yang dapat dipertanggungjawabkan."],
    ["Kebutuhan kolom", "Wajib harus diisi. Kondisional diisi sesuai konteks dan jalur valuasi. Opsional dapat dikosongkan; identitas dan tanggal operasi tetap disarankan."],
    ["Kondisi", "P0 paling kritis dan P4 paling baik. Kondisi P0-P4 tidak digunakan untuk menebak usia atau depresiasi."],
    ["Jalur valuasi", "Prioritas: nilai buku SAP, nilai buku penyesuaian yang sah, lalu estimasi dari harga referensi, usia, dan masa manfaat. Minimal satu jalur harus dapat diselesaikan."],
    ["Nol dan kosong", "Nilai nol adalah nilai buku yang sah. Biarkan data yang belum diketahui kosong; jangan menggantinya dengan nol."],
    ["Harga pengadaan", "Harga pengadaan saat ini disimpan terpisah untuk Optimum Spare kelas A2/B1 dan dasar estimasi nilai buku terdepresiasi. Harga baru bukan nilai ABC langsung."],
    ["Format", "Gunakan angka dan tanggal Excel, bukan teks berformat mata uang. Identitas aset, TID, dan kode disimpan sebagai teks agar nol awal terjaga."],
    ["Baris pengisian", `Validasi daftar disiapkan untuk ${preparedRows} baris. Untuk baris tambahan, salin format dan validasi baris kosong sebelumnya. Jangan ubah urutan atau nama header.`],
    ["Hasil sistem", "Masa manfaat, nilai ABC final, sumber nilai, donor, status validasi, dan versi aturan dihitung sistem. Jangan menambahkan hasil tersebut sebagai input."],
    ["Contoh sintetis", "NO_ASET dapat diisi teks 000001. Contoh ini hanya petunjuk dan bukan baris aset operasional."],
  ];
  for (const row of guidance) instructions.addRow(row);
  instructions.addRow([]);
  instructions.addRow(["Kolom", "Kebutuhan dan definisi"]);
  styleHeader(instructions.getRow(instructions.rowCount));
  for (const field of CANONICAL_ASSET_FIELDS) {
    instructions.addRow([field.header, `${requirementLabels[field.requirement]}. ${field.description}`]);
  }
  instructions.eachRow((row, index) => {
    row.alignment = { wrapText: true, vertical: "top" };
    if (index > 1) row.height = index <= guidance.length + 1 ? 45 : 34;
  });
  styleHeader(instructions.getRow(1));

  data.columns = CANONICAL_ASSET_FIELDS.map((field) => ({
    header: field.header, key: field.key, width: field.format === "MONEY" ? 28 : field.key === "spesifikasiMara" ? 48 : 24,
    style: { numFmt: formats[field.format] },
  }));
  styleHeader(data.getRow(1));
  data.autoFilter = "A1:V1";
  CANONICAL_ASSET_FIELDS.forEach((field, index) => {
    data.getCell(1, index + 1).note = `${requirementLabels[field.requirement]}. ${field.description}`;
  });

  references.columns = [{ header: "KONDISI_ASET", width: 24 }, { header: "SATUAN", width: 24 }];
  for (let index = 0; index < Math.max(conditions.length, units.length); index++) {
    references.addRow([conditions[index] ?? null, units[index] ?? null]);
  }
  styleHeader(references.getRow(1));
  workbook.definedNames.add("REFERENSI!$A$2:$A$6", "KondisiAset");
  workbook.definedNames.add(`REFERENSI!$B$2:$B$${units.length + 1}`, "SatuanAset");

  for (let row = 2; row <= preparedRows + 1; row++) {
    for (const [column, name] of [["K", "KondisiAset"], ["J", "SatuanAset"]] as const) {
      data.getCell(`${column}${row}`).dataValidation = {
        type: "list", allowBlank: false, formulae: [name], showErrorMessage: true, errorStyle: "stop",
        errorTitle: "Nilai tidak valid", error: "Pilih nilai dari daftar REFERENSI.",
      };
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
