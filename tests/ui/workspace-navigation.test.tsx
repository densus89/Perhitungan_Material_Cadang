import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { NextRouter } from "next/router";
import WorkspaceLayout from "../../app/(workspace)/layout";
import ImportPage from "../../app/(workspace)/impor/page";
import MappingPage from "../../app/(workspace)/pemetaan-rfq/page";
import SummaryPage from "../../app/(workspace)/ringkasan/page";

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
    <WorkspaceLayout>{path === "/impor/" ? <ImportPage /> : path === "/pemetaan-rfq/" ? <MappingPage /> : path === "/ringkasan/" ? <SummaryPage /> : <p>Tujuan alur: {path}</p>}</WorkspaceLayout>
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
  it("uses client navigation for every active sidebar workflow link", () => {
    render(<ClientNavigationWorkspace />);
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    for (const [name, path] of [
      ["Ringkasan", "/ringkasan/"], ["Impor", "/impor/"], ["Pemetaan RFQ", "/pemetaan-rfq/"],
      ["Analisis ABC", "/analisis-abc/"], ["Inventory Policy", "/inventory-policy/"], ["Prioritas Lokasi", "/prioritas-lokasi/"],
    ]) {
      clickClientLink(within(nav).getByRole("link", { name }));
      expect(screen.getByLabelText("Rute aktif")).toHaveTextContent(path);
    }
    expect(within(nav).queryByRole("link", { name: /Ekspor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lewati ke konten utama" })).toHaveAttribute("href", "#konten-utama");
  });

  it("keeps import stage, file metadata, and approvals across same-layout view round trips", () => {
    render(<ClientNavigationWorkspace />);
    const file = new File(["metadata only"], "sesi-demo.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText("Pilih berkas lokal (metadata saja)"), { target: { files: [file] } });
    for (const stage of ["Mapping", "Validasi", "Siap"]) fireEvent.click(screen.getByRole("button", { name: `Lanjut ke ${stage}` }));

    clickClientLink(screen.getByRole("link", { name: "Tinjau pemetaan RFQ" }));
    expect(screen.getByRole("heading", { level: 1, name: "Pemetaan RFQ" })).toBeVisible();
    const pendingRow = screen.getByRole("row", { name: /mapping-near\s/ });
    fireEvent.click(within(pendingRow).getByRole("button", { name: "Setujui" }));

    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    clickClientLink(within(nav).getByRole("link", { name: "Impor" }));
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Siap");
    expect(screen.getByText(/1 pemetaan masih menunggu approval/)).toBeVisible();
    for (let index = 0; index < 3; index++) fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
    expect(screen.getByText("sesi-demo.xlsx")).toBeVisible();
    expect(screen.getByText(`${file.size} byte`)).toBeVisible();
    expect(screen.getByText(file.type)).toBeVisible();

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
