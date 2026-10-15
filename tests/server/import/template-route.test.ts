// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../app/api/templates/asset-snapshot/route";
import { buildAssetTemplate } from "../../../src/lib/spreadsheet/build-asset-template";
import { ActorAccessError } from "../../../src/server/auth/actor";

const boundary = vi.hoisted(() => ({ session: vi.fn(), requireActor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../src/lib/supabase/server", () => ({ createServerSupabaseClient: boundary.session }));
vi.mock("../../../src/server/auth/actor", async (original) => ({ ...await original<object>(), requireActor: boundary.requireActor }));

async function readWorkbook(bytes: Uint8Array) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  return workbook;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.session.mockResolvedValue({ auth: {} });
  boundary.requireActor.mockResolvedValue({ userId: "30000000-0000-4000-8000-000000000001", email: "viewer@pln.co.id", displayName: "Viewer", role: "VIEWER", status: "ACTIVE", unitIndukIds: [] });
});

describe("asset workbook template", () => {
  it("generates the three sheets with the canonical headers in fixed order and no populated asset rows", async () => {
    const workbook = await readWorkbook(await buildAssetTemplate());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["PETUNJUK", "DATA_ASET", "REFERENSI"]);
    const data = workbook.getWorksheet("DATA_ASET")!;
    expect(data.getRow(1).values).toEqual([undefined,
      "UNIT_INDUK", "UPT", "NAMA_GI", "BAY_PENGHANTAR", "TID", "NO_ASET",
      "NAMA_PERALATAN", "SPESIFIKASI_MARA", "JUMLAH", "SATUAN", "KONDISI_ASET",
      "TANGGAL_OPERASI", "USIA_ASET_TAHUN", "KODE_CLASS_ASSET", "KODE_JENIS",
      "KODE_SUBJENIS", "NILAI_BUKU_SAP", "HARGA_PENGADAAN_SAAT_INI",
      "TANGGAL_REFERENSI_HARGA", "NILAI_BUKU_PENYESUAIAN", "KODE_MATERIAL", "KETERANGAN",
    ]);
    const populatedRows: number[] = [];
    data.eachRow((row, index) => { if (index > 1 && row.hasValues) populatedRows.push(index); });
    expect(populatedRows).toEqual([]);
  });

  it("keeps filling guidance, frozen styled headers, filter, formats, and comments in the exported file", async () => {
    const workbook = await readWorkbook(await buildAssetTemplate());
    const data = workbook.getWorksheet("DATA_ASET")!;
    expect(data.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(data.autoFilter).toBe("A1:V1");
    expect(data.getCell("A1").font.bold).toBe(true);
    expect(data.getCell("A1").note).toBeTruthy();
    expect(data.getColumn("F").numFmt).toBe("@");
    expect(data.getColumn("I").numFmt).toBe("#,##0.####");
    expect(data.getColumn("L").numFmt).toBe("dd/mm/yyyy");
    expect(data.getColumn("Q").numFmt).toBe("#,##0.00");
    const instructions = JSON.stringify(workbook.getWorksheet("PETUNJUK")!.getSheetValues());
    expect(instructions).toMatch(/P0.*kritis/);
    expect(instructions).toMatch(/nol.*sah/);
    expect(instructions).toContain("Optimum Spare");
  });

  it("uses reference-backed P0-P4 and unit list validation for the prepared input rows", async () => {
    const workbook = await readWorkbook(await buildAssetTemplate());
    const references = workbook.getWorksheet("REFERENSI")!;
    expect([2, 3, 4, 5, 6].map((row) => references.getCell(`A${row}`).value)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    const data = workbook.getWorksheet("DATA_ASET")!;
    for (const address of ["K2", "K1001"]) {
      expect(data.getCell(address).dataValidation).toMatchObject({ type: "list", formulae: ["KondisiAset"], showErrorMessage: true, errorStyle: "stop" });
    }
    expect(workbook.definedNames.getRanges("KondisiAset").ranges).toEqual(["REFERENSI!$A$2:$A$6"]);
    expect(data.getCell("J2").dataValidation).toMatchObject({ type: "list", formulae: ["SatuanAset"] });
  });
});

describe("authenticated template download", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN", "MFA_REQUIRED"] as const)("rejects %s with a private no-store response", async (code) => {
    boundary.requireActor.mockRejectedValue(new ActorAccessError(code));
    const response = await GET();
    expect(response.status).toBe(code === "UNAUTHENTICATED" ? 401 : 403);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("content-disposition")).toBeNull();
  });

  it("downloads the real workbook attachment for an active Actor", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="template-snapshot-aset.xlsx"');
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const workbook = await readWorkbook(new Uint8Array(await response.arrayBuffer()));
    expect(workbook.getWorksheet("DATA_ASET")?.getCell("A1").value).toBe("UNIT_INDUK");
  });

  it("returns a generic private error when the session service fails", async () => {
    boundary.session.mockRejectedValue(new Error("sensitive-internal-error"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.text()).not.toContain("sensitive-internal-error");
  });
});
