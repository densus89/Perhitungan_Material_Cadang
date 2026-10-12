"use client";

import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, ClipboardCheck, Download, FileInput, LayoutDashboard, MapPin, PackageCheck, ScanLine, Zap } from "lucide-react";

const steps = [
  { label: "Ringkasan", href: "/ringkasan/", icon: LayoutDashboard },
  { label: "Impor", href: "/impor/", icon: FileInput },
  { label: "Pemetaan RFQ", href: "/pemetaan-rfq/", icon: ScanLine },
  { label: "Analisis ABC", href: "/analisis-abc/", icon: ChartNoAxesCombined },
  { label: "Inventory Policy", href: "/inventory-policy/", icon: PackageCheck },
  { label: "Prioritas Lokasi", href: "/prioritas-lokasi/", icon: MapPin },
];

export function SideNav() {
  const pathname = usePathname() ?? "/";
  const currentPath = pathname === "/" ? "/ringkasan" : pathname.replace(/\/$/, "");

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-symbol"><Zap size={23} aria-hidden="true" /></span>
        <div><p className="brand-overline">RUANG KERJA</p><h2>Perencanaan Material Cadang</h2></div>
      </div>
      <p className="nav-section-label">PERENCANAAN</p>
      <nav aria-label="Navigasi utama">
        {steps.map(({ label, href, icon: Icon }) => (
          <a key={href} href={href} aria-current={currentPath === href.replace(/\/$/, "") ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" /><span>{label}</span>
          </a>
        ))}
        <span className="nav-disabled" aria-disabled="true"><Download size={18} aria-hidden="true" /><span>Ekspor</span><small>Segera</small></span>
      </nav>
      <div className="sidebar-footer"><ClipboardCheck size={18} aria-hidden="true" /><div><strong>Lingkungan demonstrasi</strong><p>Seluruh data bersifat sintetis.</p></div></div>
    </aside>
  );
}
