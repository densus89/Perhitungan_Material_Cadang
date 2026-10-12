import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportPage from "../../app/(workspace)/impor/page";
import WorkspaceLayout from "../../app/(workspace)/layout";

describe("metadata-only import demo", () => {
  it("displays local file metadata without reading or uploading its contents", () => {
    render(<WorkspaceLayout><ImportPage /></WorkspaceLayout>);
    const file = new File(["PRIVATE_CONTENT_MUST_NOT_APPEAR"], "contoh-lokal.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const readText = vi.fn(() => { throw new Error("Content reads are forbidden"); });
    const readBuffer = vi.fn(() => { throw new Error("Content reads are forbidden"); });
    Object.defineProperties(file, { text: { value: readText }, arrayBuffer: { value: readBuffer } });

    fireEvent.change(screen.getByLabelText("Pilih berkas lokal (metadata saja)"), { target: { files: [file] } });

    expect(screen.getByText("contoh-lokal.xlsx")).toBeVisible();
    expect(screen.getByText(`${file.size} byte`)).toBeVisible();
    expect(screen.getByText(file.type)).toBeVisible();
    expect(screen.getByText(/tidak membaca, mem-parsing, atau mengunggah isi berkas/i)).toBeVisible();
    expect(screen.queryByText("PRIVATE_CONTENT_MUST_NOT_APPEAR")).not.toBeInTheDocument();
    expect(readText).not.toHaveBeenCalled();
    expect(readBuffer).not.toHaveBeenCalled();
    expect(screen.getByText("Data Demo")).toBeVisible();
  });

  it("runs the four stages using synthetic validation and resets the workspace", () => {
    render(<WorkspaceLayout><ImportPage /></WorkspaceLayout>);
    const stages = screen.getByRole("list", { name: "Tahapan impor" });
    for (const name of ["Unggah", "Mapping", "Validasi", "Siap"]) expect(within(stages).getByText(name)).toBeVisible();
    expect(screen.getByRole("button", { name: "Lanjut ke Mapping" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gunakan sumber demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut ke Mapping" }));
    expect(screen.getByLabelText("Kolom spesifikasi demo")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut ke Validasi" }));
    expect(screen.getByRole("table", { name: "Kualitas data sintetis" })).toHaveTextContent("Usia aset kosong");
    fireEvent.click(screen.getByRole("button", { name: "Lanjut ke Siap" }));
    expect(screen.getByRole("link", { name: "Tinjau pemetaan RFQ" })).toHaveAttribute("href", "/pemetaan-rfq/");
    fireEvent.click(screen.getByRole("button", { name: "Reset data demo" }));
    expect(screen.getByRole("button", { name: "Lanjut ke Mapping" })).toBeDisabled();
  });
});
