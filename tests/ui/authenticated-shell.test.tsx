import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AuthenticatedWorkspace } from "../../src/features/auth/AuthenticatedWorkspace";
import { useActor } from "../../src/state/AuthWorkspaceProvider";
import type { AppRole } from "../../src/domain/access";
import { workspaceActor, workspaceUnits } from "../fixtures/workspace-actor";
import SummaryPage from "../../app/(workspace)/ringkasan/page";
import ImportPage from "../../app/(workspace)/impor/page";
import MappingPage from "../../app/(workspace)/pemetaan-rfq/page";
import AbcPage from "../../app/(workspace)/analisis-abc/page";
import PolicyPage from "../../app/(workspace)/inventory-policy/page";
import LocationPage from "../../app/(workspace)/prioritas-lokasi/page";
import ExportPage from "../../app/(workspace)/ekspor/page";

vi.mock("../../app/auth/actions", () => ({
  logoutAction: async () => ({ status: "error", message: "Tidak dapat keluar. Silakan coba lagi." }),
}));

function ActorConsumer() {
  const actor = useActor();
  return <p>{actor.userId}</p>;
}

describe("authenticated workspace shell", () => {
  it.each<[AppRole, string]>([
    ["RST_ADMIN", "DIV RST Admin"], ["RST_REVIEWER", "DIV RST Reviewer"],
    ["UNIT_OPERATOR", "Operator Unit Induk"], ["VIEWER", "Viewer"],
  ])("shows the authenticated identity and readable %s role", (role, label) => {
    render(<AuthenticatedWorkspace actor={{ ...workspaceActor, role }}><ActorConsumer /></AuthenticatedWorkspace>);
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Operator Perencanaan")).toBeVisible();
    expect(within(header).getByText("operator@pln.co.id")).toBeVisible();
    expect(within(header).getByText(label)).toBeVisible();
    expect(screen.getByRole("main")).toHaveTextContent("workspace-user");
    expect(within(header).getByRole("button", { name: "Keluar" })).toBeEnabled();
    expect(screen.queryByLabelText("Pengguna demo")).not.toBeInTheDocument();
  });

  it.each([
    ["", "bootstrap.admin@pln.co.id", "Bootstrap Admin", "BA"],
    ["   ", "rst_operator+awal@pln.co.id", "Rst Operator", "RO"],
  ])("derives a readable identity from email when displayName is %j", (displayName, email, label, initials) => {
    render(<AuthenticatedWorkspace actor={{ ...workspaceActor, displayName, email }}><p>Konten</p></AuthenticatedWorkspace>);
    const header = screen.getByRole("banner");
    expect(within(header).getByText(label)).toBeVisible();
    expect(within(header).getByText(email)).toBeVisible();
    expect(within(header).getByText(initials)).toBeVisible();
  });

  it("shows only assigned Unit Induk names", () => {
    render(<AuthenticatedWorkspace actor={workspaceActor} units={[...workspaceUnits, { id: "unassigned", name: "Unit Lain" }]}><p>Konten</p></AuthenticatedWorkspace>);
    const units = screen.getByLabelText("Unit Induk ditugaskan");
    expect(units).toHaveTextContent("UIT Jawa Bagian Barat");
    expect(units).toHaveTextContent("UIT Jawa Bagian Tengah");
    expect(units).not.toHaveTextContent("Unit Lain");
  });

  it("identifies an account with no assigned units without claiming national unit assignments", () => {
    render(<AuthenticatedWorkspace actor={{ ...workspaceActor, unitIndukIds: [] }}><p>Konten</p></AuthenticatedWorkspace>);
    expect(screen.getByLabelText("Unit Induk ditugaskan")).toHaveTextContent("Belum ada Unit Induk ditugaskan");
  });

  it("shows the admin navigation with its active route", () => {
    render(<PathnameContext.Provider value="/admin/pengguna/"><AuthenticatedWorkspace actor={{ ...workspaceActor, role: "RST_ADMIN" }}><p>Admin</p></AuthenticatedWorkspace></PathnameContext.Provider>);
    const nav = screen.getByRole("navigation", { name: "Administrasi" });
    expect(within(nav).getByRole("link", { name: "Kelola Pengguna" })).toHaveAttribute("href", "/admin/pengguna/");
    expect(within(nav).getByRole("link", { name: "Kelola Pengguna" })).toHaveAttribute("aria-current", "page");
  });

  it("does not label the real admin workspace as demo data", () => {
    render(<PathnameContext.Provider value="/admin/pengguna/"><AuthenticatedWorkspace actor={{ ...workspaceActor, role: "RST_ADMIN" }}><p>Admin</p></AuthenticatedWorkspace></PathnameContext.Provider>);
    expect(screen.queryByText("Data Demo")).not.toBeInTheDocument();
  });

  it.each<AppRole>(["RST_REVIEWER", "UNIT_OPERATOR", "VIEWER"])("does not show admin navigation to %s", (role) => {
    render(<AuthenticatedWorkspace actor={{ ...workspaceActor, role }}><p>Konten</p></AuthenticatedWorkspace>);
    expect(screen.queryByRole("link", { name: "Kelola Pengguna" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Administrasi" })).not.toBeInTheDocument();
  });

  it("submits the shell logout control and announces the server action failure", async () => {
    render(<AuthenticatedWorkspace actor={workspaceActor}><p>Konten</p></AuthenticatedWorkspace>);
    fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tidak dapat keluar. Silakan coba lagi."));
  });

  it.each([
    ["/ringkasan/", SummaryPage], ["/impor/", ImportPage], ["/pemetaan-rfq/", MappingPage],
    ["/analisis-abc/", AbcPage], ["/inventory-policy/", PolicyPage], ["/prioritas-lokasi/", LocationPage], ["/ekspor/", ExportPage],
  ])("keeps the visible Data Demo warning on authenticated %s", (pathname, Page) => {
    render(<PathnameContext.Provider value={pathname}><AuthenticatedWorkspace actor={workspaceActor}><Page /></AuthenticatedWorkspace></PathnameContext.Provider>);
    expect(screen.getByText("Data Demo")).toBeVisible();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
