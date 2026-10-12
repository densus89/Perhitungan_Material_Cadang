import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AbcPage from "../../app/(workspace)/analisis-abc/page";
import PolicyPage from "../../app/(workspace)/inventory-policy/page";
import WorkspaceLayout from "../../app/(workspace)/layout";
import { MappingReview } from "../../src/features/mapping/MappingReview";
import { abcResults } from "../../src/demo/fixtures";

function policyRow(name: string) {
  return within(screen.getByRole("table", { name: "Kebijakan inventory per material" })).getByRole("row", { name: new RegExp("^" + name + "\\s?(?:TRAFO|PMT|CT|KONEKTOR|ISOLATOR)\\s", "i") });
}

function Flow({ destination }: { destination: "abc" | "policy" }) {
  const [mapping, setMapping] = useState(true);
  return <WorkspaceLayout><button onClick={() => setMapping(false)}>Lihat hasil</button>{mapping ? <MappingReview /> : destination === "abc" ? <AbcPage /> : <PolicyPage />}</WorkspaceLayout>;
}

describe("ABC analysis and policy workspaces", () => {
  it("uses separate mode totals and restores the original price rank after visual filtering", () => {
    const original = JSON.stringify(abcResults);
    render(<WorkspaceLayout><AbcPage /></WorkspaceLayout>);
    expect(screen.getByRole("tab", { name: "Filtered" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("article", { name: "Populasi efektif" })).toHaveTextContent("195");
    expect(screen.getByRole("article", { name: "Nilai perolehan (Rp)" })).toHaveTextContent("390.510.000.000");
    fireEvent.click(screen.getByRole("tab", { name: "Whitelist" }));
    expect(screen.getByRole("article", { name: "Populasi efektif" })).toHaveTextContent("162");
    expect(screen.getByRole("article", { name: "Nilai perolehan (Rp)" })).toHaveTextContent("229.780.000.000");
    fireEvent.change(screen.getByLabelText("Kategori ABC"), { target: { value: "B1" } });
    const ranking = screen.getByRole("table", { name: "Peringkat harga dan audit ABC" });
    expect(within(ranking).getAllByRole("row")).toHaveLength(2);
    expect(within(within(ranking).getByRole("row", { name: /CT Demo Khusus/ })).getAllByRole("cell")[0]).toHaveTextContent(/^3$/);
    expect(screen.getByRole("article", { name: "Populasi efektif" })).toHaveTextContent("162");
    fireEvent.change(screen.getByLabelText("Kategori ABC"), { target: { value: "ALL" } });
    expect(within(ranking).getAllByRole("row")).toHaveLength(6);
    expect(JSON.stringify(abcResults)).toBe(original);
  });

  it("shows every required ranking input, cumulative table, and audit reason", () => {
    render(<WorkspaceLayout><AbcPage /></WorkspaceLayout>);
    const ranking = screen.getByRole("table", { name: "Peringkat harga dan audit ABC" });
    for (const label of ["Rank harga", "Harga satuan (Rp)", "Jumlah efektif", "Nilai perolehan (Rp)", "Nilai sebelum (%)", "Jumlah kumulatif (%)", "Kategori", "Alasan audit"]) {
      expect(within(ranking).getByRole("columnheader", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("table", { name: "Data kurva ABC" })).toBeInTheDocument();
    expect(within(ranking).getByRole("row", { name: /Trafo Demo Tipe Y/ })).toHaveTextContent("Draft");
    expect(within(ranking).getByRole("row", { name: /Konektor Demo Tipe Z/ })).toHaveTextContent("Spesifikasi mandiri");
    fireEvent.change(screen.getByLabelText("Cari material ABC"), { target: { value: "tidak tersedia" } });
    expect(ranking).toHaveTextContent("Tidak ada material pada filter ini");
  });

  it("maps categories and failure history to Mandatory, Optimum, and Economic", () => {
    render(<WorkspaceLayout><PolicyPage /></WorkspaceLayout>);
    expect(policyRow("Trafo Demo 60 MVA")).toHaveTextContent("Mandatory");
    expect(policyRow("PMT Demo Tipe X")).toHaveTextContent("Optimum");
    expect(policyRow("CT Demo Khusus")).toHaveTextContent("Optimum");
    expect(policyRow("CT Demo 150 kV")).toHaveTextContent("Economic");
    expect(policyRow("Konektor Demo Tipe Z")).toHaveTextContent("Economic");
    expect(policyRow("PMT Demo Tipe X")).toHaveTextContent("Draft");
    expect(policyRow("Trafo Demo Tipe Y")).toHaveTextContent("Draft");
    expect(policyRow("CT Demo Khusus")).toHaveTextContent("Spesifikasi mandiri");
    expect(policyRow("Konektor Demo Tipe Z")).toHaveTextContent("Spesifikasi mandiri");
  });

  it.each(["Isolator Demo", "Isolator Demo lead time panjang"])("keeps %s at C=0 for its authored lead-time example", (material) => {
    render(<WorkspaceLayout><PolicyPage /></WorkspaceLayout>);
    const row = policyRow(material);
    expect(row).toHaveTextContent("Tidak dicadangkan");
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent(/^0$/);
    fireEvent.click(within(row).getByRole("button", { name: "Penjelasan" }));
    const drawer = screen.getByRole("dialog", { name: "Penjelasan inventory policy" });
    expect(drawer).toHaveTextContent("Kategori C selalu 0, terlepas dari lead time");
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains the synthetic optimum candidates without implying a 99% guarantee", () => {
    render(<WorkspaceLayout><PolicyPage /></WorkspaceLayout>);
    fireEvent.click(within(policyRow("PMT Demo Tipe X")).getByRole("button", { name: "Penjelasan" }));
    const drawer = screen.getByRole("dialog", { name: "Penjelasan inventory policy" });
    expect(drawer).toHaveTextContent("Populasi24");
    expect(drawer).toHaveTextContent("Riwayat kegagalan4 dalam 5 tahun");
    expect(drawer).toHaveTextContent("Lead time12 bulan");
    expect(drawer).toHaveTextContent("Harga satuanRp 650.000.000");
    const candidates = within(drawer).getByRole("table", { name: "Kandidat Optimum sintetis" });
    expect(within(candidates).getByRole("row", { name: "Reliabilitas 3" })).toBeInTheDocument();
    expect(within(candidates).getByRole("row", { name: "Biaya 1" })).toBeInTheDocument();
    expect(within(candidates).getByRole("row", { name: "Gabungan 2" })).toBeInTheDocument();
    expect(drawer).toHaveTextContent("97,8%");
    expect(drawer).toHaveTextContent("Gabungan optimum tidak selalu mencapai 99%");
  });

  it("reflects current RFQ approval in policy while retaining the synthetic quantities", () => {
    render(<Flow destination="policy" />);
    fireEvent.click(within(screen.getByRole("row", { name: /mapping-near\s/ })).getByRole("button", { name: "Setujui" }));
    fireEvent.click(screen.getByRole("button", { name: "Lihat hasil" }));
    expect(policyRow("PMT Demo Tipe X")).toHaveTextContent("Disetujui");
    expect(policyRow("PMT Demo Tipe X")).not.toHaveTextContent("Draft");
    expect(within(policyRow("PMT Demo Tipe X")).getAllByRole("cell")[2]).toHaveTextContent(/^2$/);
    expect(policyRow("Trafo Demo Tipe Y")).toHaveTextContent("Draft");
  });

  it("retains a rejected RFQ material as standalone in the ABC ranking", () => {
    render(<Flow destination="abc" />);
    fireEvent.click(within(screen.getByRole("row", { name: /mapping-near\s/ })).getByRole("button", { name: "Tolak" }));
    fireEvent.click(screen.getByRole("button", { name: "Lihat hasil" }));
    fireEvent.click(screen.getByRole("tab", { name: "Whitelist" }));
    const row = within(screen.getByRole("table", { name: "Peringkat harga dan audit ABC" })).getByRole("row", { name: /PMT Demo Tipe X/ });
    expect(row).toHaveTextContent("Spesifikasi mandiri");
    expect(row).not.toHaveTextContent("Draft");
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent(/^2$/);
  });

  it("keeps policy search local and exposes an empty result without changing totals", () => {
    render(<WorkspaceLayout><PolicyPage /></WorkspaceLayout>);
    expect(screen.getByRole("article", { name: "Material dalam policy" })).toHaveTextContent("8");
    fireEvent.change(screen.getByLabelText("Cari material policy"), { target: { value: "tidak tersedia" } });
    expect(screen.getByRole("table", { name: "Kebijakan inventory per material" })).toHaveTextContent("Tidak ada material pada filter ini");
    expect(screen.getByRole("article", { name: "Material dalam policy" })).toHaveTextContent("8");
  });

  it.each(["abc", "policy"] as const)("keeps the %s group draft when a hidden normalized RFQ peer remains pending", (destination) => {
    render(<Flow destination={destination} />);
    fireEvent.change(screen.getByLabelText("Cari spesifikasi atau ID"), { target: { value: "mapping-near PMT" } });
    fireEvent.click(within(screen.getByRole("row", { name: /mapping-near\s/ })).getByRole("button", { name: "Setujui" }));
    fireEvent.click(screen.getByRole("button", { name: "Lihat hasil" }));
    if (destination === "abc") fireEvent.click(screen.getByRole("tab", { name: "Whitelist" }));
    const row = destination === "abc" ? within(screen.getByRole("table", { name: "Peringkat harga dan audit ABC" })).getByRole("row", { name: /PMT Demo Tipe X/ }) : policyRow("PMT Demo Tipe X");
    expect(row).toHaveTextContent("Draft");
    expect(row).toHaveTextContent("Menunggu approval RFQ");
  });
});
