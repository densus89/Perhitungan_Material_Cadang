import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { NextRouter } from "next/router";
import { AuthenticatedWorkspace } from "../../src/features/auth/AuthenticatedWorkspace";
import { workspaceActor } from "../fixtures/workspace-actor";
import { ImportWorkspace } from "../../src/features/import/ImportWorkspace";
import MappingPage from "../../app/(workspace)/pemetaan-rfq/page";
import SummaryPage from "../../app/(workspace)/ringkasan/page";

vi.mock("../../app/auth/actions", () => ({ logoutAction: async () => ({ status: "idle" }) }));

/** Only the router boundary is supplied; all links, views, and demo state are real. */
function ClientNavigationWorkspace({ initialPath = "/impor/" }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  const router: NextRouter = {
    basePath: "", route: path, pathname: path, asPath: path, query: {},
    isLocaleDomain: false, isFallback: false, isReady: true, isPreview: false,
    push: async (href) => { setPath(typeof href === "string" ? href : href.pathname ?? "/"); return true; },
    replace: async (href) => { setPath(typeof href === "string" ? href : href.pathname ?? "/"); return true; },
    back: () => {}, forward: () => {}, reload: () => {}, beforePopState: () => {},
    prefetch: async () => {}, events: { on: () => {}, off: () => {}, emit: () => {} },
  };
  return <RouterContext.Provider value={router}><PathnameContext.Provider value={path}>
    <output aria-label="Rute aktif">{path}</output>
    <AuthenticatedWorkspace actor={workspaceActor}>{path === "/impor/" ? <ImportWorkspace initialDrafts={[]} actorUnits={[{ id: "unit-jbb", name: "UIT Jawa Bagian Barat" }]} /> : path === "/pemetaan-rfq/" ? <MappingPage /> : path === "/ringkasan/" ? <SummaryPage /> : <p>Tujuan alur: {path}</p>}</AuthenticatedWorkspace>
  </PathnameContext.Provider></RouterContext.Provider>;
}

function clickClientLink(link: HTMLElement) {
  let clientNavigationPreventedReload = false;
  // Observe the real Link handler, then suppress jsdom's unsupported document navigation.
  document.addEventListener("click", (event) => {
    clientNavigationPreventedReload = event.defaultPrevented;
    event.preventDefault();
  }, { once: true });
  fireEvent.click(link);
  expect(clientNavigationPreventedReload).toBe(true);
}

describe("workspace client navigation", () => {
  it.each(["Setujui", "Tolak"])("refreshes dashboard counts after a %s round trip and clears pending status at zero", (decision) => {
    render(<ClientNavigationWorkspace initialPath="/ringkasan/" />);
    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent("3 pemetaan RFQ menunggu approval");
    clickClientLink(screen.getByRole("link", { name: "Tinjau pemetaan" }));
    fireEvent.click(within(screen.getByRole("row", { name: /mapping-near\s/ })).getByRole("button", { name: decision }));
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    clickClientLink(within(nav).getByRole("link", { name: "Ringkasan" }));
    expect(within(screen.getByRole("article", { name: "Menunggu approval" })).getByText("1")).toBeVisible();
    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent("1 pemetaan RFQ menunggu approval");
    expect(screen.getByText(`${decision === "Tolak" ? 4 : 2} spesifikasi mandiri`)).toBeVisible();

    clickClientLink(screen.getByRole("link", { name: "Tinjau pemetaan" }));
    fireEvent.click(within(screen.getByRole("row", { name: /mapping-transformer-guard/ })).getByRole("button", { name: "Tolak" }));
    clickClientLink(within(nav).getByRole("link", { name: "Ringkasan" }));
    expect(within(screen.getByRole("article", { name: "Menunggu approval" })).getByText("0")).toBeVisible();
    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent("Semua pemetaan RFQ telah ditinjau");
    expect(within(screen.getByRole("main")).getByRole("status")).not.toHaveTextContent("draft");
    expect(screen.getByText(`${decision === "Tolak" ? 5 : 3} spesifikasi mandiri`)).toBeVisible();
  });

  it("uses client navigation for every active sidebar workflow link", () => {
    render(<ClientNavigationWorkspace />);
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    for (const [name, path] of [
      ["Ringkasan", "/ringkasan/"], ["Impor", "/impor/"], ["Pemetaan RFQ", "/pemetaan-rfq/"],
      ["Analisis ABC", "/analisis-abc/"], ["Inventory Policy", "/inventory-policy/"], ["Prioritas Lokasi", "/prioritas-lokasi/"], ["Ekspor", "/ekspor/"],
    ]) {
      clickClientLink(within(nav).getByRole("link", { name }));
      expect(screen.getByLabelText("Rute aktif")).toHaveTextContent(path);
    }
    expect(screen.getByRole("link", { name: "Lewati ke konten utama" })).toHaveAttribute("href", "#konten-utama");
  });

  it("keeps approvals across production import view round trips", () => {
    render(<ClientNavigationWorkspace />);
    expect(screen.getByLabelText("Berkas snapshot XLSX")).toBeVisible();
    clickClientLink(within(screen.getByRole("navigation", { name: "Navigasi utama" })).getByRole("link", { name: "Pemetaan RFQ" }));
    expect(screen.getByRole("heading", { level: 1, name: "Pemetaan RFQ" })).toBeVisible();
    const pendingRow = screen.getByRole("row", { name: /mapping-near\s/ });
    fireEvent.click(within(pendingRow).getByRole("button", { name: "Setujui" }));

    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    clickClientLink(within(nav).getByRole("link", { name: "Impor" }));
    expect(screen.getByLabelText("Berkas snapshot XLSX")).toBeVisible();
    expect(screen.getByRole("button", { name: "Unggah dan proses di server" })).toBeDisabled();

    clickClientLink(within(nav).getByRole("link", { name: "Pemetaan RFQ" }));
    fireEvent.change(screen.getByLabelText("Status pemetaan"), { target: { value: "ALL" } });
    expect(screen.getByRole("row", { name: /mapping-near\s/ })).toHaveTextContent("DISETUJUI");
    expect(screen.getByRole("row", { name: /mapping-near-peer\s/ })).toHaveTextContent("DISETUJUI");
  });

  it("uses client navigation for summary actions and the shared status banner", () => {
    render(<ClientNavigationWorkspace initialPath="/ringkasan/" />);
    for (const [name, path] of [
      ["Impor data", "/impor/"], ["Tinjau pemetaan", "/pemetaan-rfq/"],
      ["Buka analisis", "/analisis-abc/"], ["Kelola impor", "/impor/"],
      ["Inventory Policy", "/inventory-policy/"], ["Prioritas Lokasi", "/prioritas-lokasi/"],
    ]) {
      clickClientLink(within(screen.getByRole("main")).getByRole("link", { name }));
      expect(screen.getByLabelText("Rute aktif")).toHaveTextContent(path);
      clickClientLink(within(screen.getByRole("navigation", { name: "Navigasi utama" })).getByRole("link", { name: "Ringkasan" }));
    }
  });
});
