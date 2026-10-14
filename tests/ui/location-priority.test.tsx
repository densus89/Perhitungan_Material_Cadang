import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LocationPage from "../../app/(workspace)/prioritas-lokasi/page";
import { AuthenticatedDemoWorkspace as WorkspaceLayout } from "../fixtures/AuthenticatedDemoWorkspace";
import { locationPriorities, policyRows } from "../../src/demo/fixtures";

function table() { return screen.getByRole("table", { name: "Prioritas penempatan UPT / GI" }); }
function rows() { return within(table()).getAllByRole("row").slice(1); }
function location(name: RegExp) { return within(table()).getByRole("row", { name }); }
function renderPage() { render(<WorkspaceLayout><LocationPage /></WorkspaceLayout>); }

describe("location placement priority workspace", () => {
  it("initially includes all P0–P4 locations in condition, age, then distance priority", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Prioritas Lokasi", level: 1 })).toBeInTheDocument();
    expect(rows()).toHaveLength(8);
    expect(rows().map((row) => within(row).getByRole("rowheader").textContent)).toEqual([
      "GI Demo Kembar UPT Demo Barat", "GI Demo Kembar UPT Demo Timur", "GI Demo Cendana UPT Demo Selatan",
      "GI Demo Kenanga UPT Demo Barat", "GI Demo Melati UPT Demo Timur", "GI Demo Akasia UPT Demo Tengah",
      "GI Demo Pinus UPT Demo Utara", "GI Demo Flamboyan UPT Demo Tengah",
    ]);
    expect(rows().map((row) => within(row).getAllByRole("cell")[2].textContent)).toEqual(["P0", "P0", "P1", "P2", "P2", "P3", "P3", "P4"]);
    expect(rows()[0]).toHaveTextContent(/28 tahun/);
    expect(rows()[0]).toHaveTextContent(/P0.*umur diketahui.*lebih tua/i);
    expect(location(/GI Demo Kenanga/)).toHaveTextContent(/umur sama.*jarak/i);
    expect(location(/GI Demo Akasia/)).toHaveTextContent(/Umur belum tersedia.*jarak Haversine/i);
    expect(location(/GI Demo Pinus/)).toHaveTextContent(/Umur belum tersedia/);
    expect(screen.getByRole("article", { name: "Umur belum tersedia" })).toHaveTextContent("2");
  });

  it("filters only visibility and restores original ranks and unmodified fixtures", () => {
    const original = JSON.stringify(locationPriorities);
    renderPage();
    fireEvent.change(screen.getByLabelText("Kondisi lokasi"), { target: { value: "P4" } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("GI Demo Flamboyan");
    expect(within(rows()[0]).getAllByRole("cell")[0]).toHaveTextContent(/^8$/);
    expect(screen.getByRole("article", { name: "Lokasi dalam prioritas" })).toHaveTextContent("8");
    fireEvent.change(screen.getByLabelText("Kondisi lokasi"), { target: { value: "ALL" } });
    expect(rows()).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("UPT"), { target: { value: "UPT Demo Barat" } });
    expect(rows()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Cari GI"), { target: { value: "Kenanga" } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("GI Demo Kenanga");
    fireEvent.change(screen.getByLabelText("Cari GI"), { target: { value: "tidak tersedia" } });
    expect(table()).toHaveTextContent("Tidak ada lokasi pada filter ini");
    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(rows()).toHaveLength(8);
    expect(JSON.stringify(locationPriorities)).toBe(original);
  });

  it("represents a multi-asset UPT by its worst condition even after hiding its worst GI", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Kondisi lokasi"), { target: { value: "P2" } });
    const kenanga = location(/GI Demo Kenanga/);
    expect(within(kenanga).getAllByRole("cell")[2]).toHaveTextContent(/^P2$/);
    expect(within(kenanga).getAllByRole("cell")[3]).toHaveTextContent(/^P0$/);
    fireEvent.click(within(kenanga).getByRole("button", { name: "Detail" }));
    const drawer = screen.getByRole("dialog", { name: "Detail prioritas lokasi" });
    expect(drawer).toHaveTextContent(/Kondisi terburuk UPT.*P0/);
    expect(drawer).toHaveTextContent(/5 aset.*2 GI/);
    expect(drawer).toHaveTextContent(/terburuk.*seluruh aset/i);
  });

  it("shows unchanged policy reference per row with no allocation or multiplication", () => {
    renderPage();
    expect(within(table()).getByRole("columnheader", { name: /Jumlah ideal referensi/ })).toHaveTextContent("bukan alokasi per lokasi");
    for (const row of rows()) expect(within(row).getAllByRole("cell")[7]).toHaveTextContent(/^3 unit$/);
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Detail" }));
    const drawer = screen.getByRole("dialog", { name: "Detail prioritas lokasi" });
    expect(drawer).toHaveTextContent("Jumlah ideal referensi3 unit");
    expect(drawer).toHaveTextContent("bukan alokasi per lokasi");
    expect(drawer).toHaveTextContent(policyRows[0].specification);
    expect(drawer).toHaveTextContent("Gandul");
    expect(drawer).toHaveTextContent("-6.343459, 106.787061");
    expect(drawer).toHaveTextContent(/Haversine.*km/);
    expect(drawer).toHaveTextContent(/tidak dijumlahkan atau dikalikan/i);
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows visual distance sorting while preserving canonical priority ranks", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Urutan tampilan"), { target: { value: "DISTANCE" } });
    expect(within(rows()[0]).getByRole("rowheader")).toHaveTextContent("GI Demo Akasia");
    expect(within(rows()[0]).getAllByRole("cell")[0]).toHaveTextContent(/^6$/);
    fireEvent.change(screen.getByLabelText("Urutan tampilan"), { target: { value: "GI" } });
    expect(within(rows()[0]).getByRole("rowheader")).toHaveTextContent("GI Demo Akasia");
    expect(within(rows()[1]).getByRole("rowheader")).toHaveTextContent("GI Demo Cendana");
    fireEvent.change(screen.getByLabelText("Urutan tampilan"), { target: { value: "PRIORITY" } });
    expect(within(rows()[0]).getByRole("rowheader")).toHaveTextContent("GI Demo Kembar UPT Demo Barat");
  });
});
