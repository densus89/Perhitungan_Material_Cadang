import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MappingPage from "../../app/(workspace)/pemetaan-rfq/page";
import WorkspaceLayout from "../../app/(workspace)/layout";

function row(id: string) {
  return screen.getByRole("row", { name: new RegExp(id + "(?:\\s|$)") });
}

function showAllStatuses() {
  fireEvent.change(screen.getByLabelText("Status pemetaan"), { target: { value: "ALL" } });
}

describe("RFQ approval workspace", () => {
  it("propagates one approval to visible normalized peers and records the method", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    fireEvent.click(within(row("mapping-near")).getByRole("button", { name: "Setujui" }));
    showAllStatuses();
    expect(row("mapping-near")).toHaveTextContent("DISETUJUI");
    expect(row("mapping-near-peer")).toHaveTextContent("DISETUJUI");
    fireEvent.click(within(row("mapping-near")).getByRole("button", { name: "Detail audit" }));
    const drawer = screen.getByRole("dialog", { name: "Audit pemetaan RFQ" });
    expect(drawer).toHaveTextContent("PMT Demo Tipe X 150 kV 2000 A");
    expect(drawer).toHaveTextContent("PMT DEMO 150 kV 2000 A");
    expect(drawer).toHaveTextContent("18 aset");
    expect(drawer).toHaveTextContent("ONE");
    expect(within(drawer).getByRole("table", { name: "Perbedaan terstruktur" })).toHaveTextContent("Tipe X");
  });

  it("keeps a hidden normalized peer outside one-approval propagation", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    fireEvent.change(screen.getByLabelText("Cari spesifikasi atau ID"), { target: { value: "mapping-near-peer" } });
    fireEvent.click(within(row("mapping-near-peer")).getByRole("button", { name: "Setujui" }));
    fireEvent.change(screen.getByLabelText("Cari spesifikasi atau ID"), { target: { value: "" } });
    showAllStatuses();
    expect(row("mapping-near-peer")).toHaveTextContent("DISETUJUI");
    expect(row("mapping-near")).toHaveTextContent("MENUNGGU_APPROVAL");
  });

  it("approves a checked normalized specification and its visible peers, preserving unrelated rows", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    showAllStatuses();
    expect(within(row("mapping-exact")).getByRole("checkbox")).toBeDisabled();
    fireEvent.click(within(row("mapping-near")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Setujui terpilih (1)" }));
    expect(row("mapping-near")).toHaveTextContent("DISETUJUI");
    expect(row("mapping-near-peer")).toHaveTextContent("DISETUJUI");
    expect(row("mapping-transformer-guard")).toHaveTextContent("MENUNGGU_APPROVAL");
    expect(row("mapping-exact")).toHaveTextContent("DITERIMA_OTOMATIS");
  });

  it("keeps hidden normalized peers outside selected approval", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    fireEvent.change(screen.getByLabelText("Cari spesifikasi atau ID"), { target: { value: "mapping-near-peer" } });
    fireEvent.click(within(row("mapping-near-peer")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Setujui terpilih (1)" }));
    fireEvent.change(screen.getByLabelText("Cari spesifikasi atau ID"), { target: { value: "" } });
    showAllStatuses();
    expect(row("mapping-near-peer")).toHaveTextContent("DISETUJUI");
    expect(row("mapping-near")).toHaveTextContent("MENUNGGU_APPROVAL");
  });

  it("confirms the exact filtered count before applying approval and supports cancel", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    fireEvent.change(screen.getByLabelText("Keluarga material"), { target: { value: "BREAKER" } });
    fireEvent.click(screen.getByRole("button", { name: "Setujui semua terfilter (2)" }));
    const confirmation = screen.getByRole("dialog", { name: "Konfirmasi persetujuan" });
    expect(confirmation).toHaveTextContent("2 baris pending");
    expect(row("mapping-near")).toHaveTextContent("MENUNGGU_APPROVAL");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Setujui semua terfilter (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi 2 baris" }));
    showAllStatuses();
    expect(row("mapping-near")).toHaveTextContent("DISETUJUI");
    expect(row("mapping-near-peer")).toHaveTextContent("DISETUJUI");
    fireEvent.change(screen.getByLabelText("Keluarga material"), { target: { value: "ALL" } });
    expect(row("mapping-transformer-guard")).toHaveTextContent("MENUNGGU_APPROVAL");
  });

  it("rejects pending rows to standalone specifications and resets decisions", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    fireEvent.click(within(row("mapping-near")).getByRole("button", { name: "Tolak" }));
    showAllStatuses();
    expect(row("mapping-near")).toHaveTextContent("SPESIFIKASI_MANDIRI");
    expect(row("mapping-near-peer")).toHaveTextContent("SPESIFIKASI_MANDIRI");
    fireEvent.click(screen.getByRole("button", { name: "Reset data demo" }));
    expect(row("mapping-near")).toHaveTextContent("MENUNGGU_APPROVAL");
  });

  it("blocks incompatible transformer bulk approval and permits a compatible manual target", () => {
    render(<WorkspaceLayout><MappingPage /></WorkspaceLayout>);
    fireEvent.change(screen.getByLabelText("Keluarga material"), { target: { value: "TRANSFORMER" } });
    fireEvent.click(within(row("mapping-transformer-guard")).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Setujui terpilih (1)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Setujui semua terfilter (1)" })).toBeDisabled();
    expect(within(row("mapping-transformer-guard")).getByRole("button", { name: "Setujui" })).toBeDisabled();
    fireEvent.click(within(row("mapping-transformer-guard")).getByRole("button", { name: "Detail audit" }));
    const drawer = screen.getByRole("dialog", { name: "Audit pemetaan RFQ" });
    fireEvent.change(within(drawer).getByLabelText("Target RFQ manual"), { target: { value: "rfq-demo-t05" } });
    expect(within(drawer).getByRole("button", { name: "Terapkan target manual" })).toBeDisabled();
    fireEvent.change(within(drawer).getByLabelText("Target RFQ manual"), { target: { value: "rfq-demo-t02" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Terapkan target manual" }));
    expect(drawer).toHaveTextContent("DISETUJUI");
    expect(drawer).toHaveTextContent("MANUAL");
    expect(drawer).toHaveTextContent("TRAFO DEMO 60 MVA 150/20 kV");
  });
});
