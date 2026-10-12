import type { ReactNode } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#konten-utama">Lewati ke konten utama</a>
      <SideNav />
      <div className="workspace"><TopBar /><main id="konten-utama" className="workspace-main" tabIndex={-1}>{children}</main><footer className="workspace-footer">Mockup perencanaan · Skenario sintetis · Bukan hasil perhitungan operasional</footer></div>
    </div>
  );
}
