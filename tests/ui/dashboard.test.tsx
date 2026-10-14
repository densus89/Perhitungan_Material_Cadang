import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AuthenticatedWorkspace } from "../../src/features/auth/AuthenticatedWorkspace";
import SummaryPage from "../../app/(workspace)/ringkasan/page";
import { workspaceActor } from "../fixtures/workspace-actor";

vi.mock("../../app/auth/actions", () => ({ logoutAction: async () => ({ status: "idle" }) }));

function Dashboard() {
  return <PathnameContext.Provider value="/ringkasan/"><AuthenticatedWorkspace actor={workspaceActor}><SummaryPage /></AuthenticatedWorkspace></PathnameContext.Provider>;
}

describe("dashboard workspace", () => {
  it("provides navigation to every planning step and identifies synthetic data", () => {
    render(<Dashboard />);

    const navigation = screen.getByRole("navigation", { name: "Navigasi utama" });
    expect(screen.getByText("Data Demo")).toBeVisible();
    expect(screen.getByRole("main")).toBeInTheDocument();
    for (const [name, href] of [
      ["Impor", "/impor/"],
      ["Pemetaan RFQ", "/pemetaan-rfq/"],
      ["Analisis ABC", "/analisis-abc/"],
      ["Inventory Policy", "/inventory-policy/"],
      ["Prioritas Lokasi", "/prioritas-lokasi/"],
    ]) {
      expect(within(navigation).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "Lewati ke konten utama" })).toHaveAttribute("href", "#konten-utama");
  });

  it("shows fixture totals with clear approval and missing-data status", () => {
    render(<Dashboard />);

    expect(within(screen.getByRole("article", { name: "Material dianalisis" })).getByText("8")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Populasi aset" })).getByText("259")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Menunggu approval" })).getByText("3")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Lokasi prioritas" })).getByText("8")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("3 pemetaan RFQ menunggu approval");
    expect(screen.getByText(/2 lokasi belum memiliki usia aset/)).toBeVisible();
  });

  it("exposes every ABC class and the chart values in semantic tables", () => {
    render(<Dashboard />);

    const distribution = screen.getByRole("table", { name: "Distribusi kelas ABC" });
    for (const category of ["A1", "A2", "B1", "B2", "C"]) {
      expect(within(distribution).getByRole("rowheader", { name: category })).toBeVisible();
    }
    expect(within(distribution).getAllByRole("row")).toHaveLength(6);

    const curve = screen.getByRole("table", { name: "Data kurva ABC" });
    const transformer = within(curve).getByRole("row", { name: /Trafo Demo 60 MVA/ });
    expect(transformer).toHaveTextContent("12,31%");
    expect(transformer).toHaveTextContent("73,75%");
    expect(within(curve).getByRole("row", { name: /Isolator Demo/ })).toHaveTextContent("100,00%");
    expect(within(curve).getAllByRole("row")).toHaveLength(6);
  });
});
