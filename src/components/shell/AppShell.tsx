"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { normalizeWorkspacePath } from "./presentation";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  const persistentImport = normalizeWorkspacePath(usePathname()) === "/impor";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#konten-utama">Lewati ke konten utama</a>
      <SideNav />
      <div className="workspace"><TopBar /><main id="konten-utama" className="workspace-main" tabIndex={-1}>{children}</main><footer className="workspace-footer">{persistentImport ? "Snapshot aset tersimpan · Aktivasi versi memerlukan persetujuan DIV RST" : "Modul perencanaan menggunakan skenario sintetis · Bukan hasil perhitungan operasional"}</footer></div>
    </div>
  );
}
