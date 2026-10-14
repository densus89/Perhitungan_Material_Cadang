"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChartNoAxesCombined, ClipboardCheck, Download, FileInput, LayoutDashboard, MapPin, PackageCheck, ScanLine, Users, Zap } from "lucide-react";
import { useActor } from "../../state/AuthWorkspaceProvider";
import styles from "./shell.module.css";

const steps = [
  { label: "Ringkasan", href: "/ringkasan/", icon: LayoutDashboard },
  { label: "Impor", href: "/impor/", icon: FileInput },
  { label: "Pemetaan RFQ", href: "/pemetaan-rfq/", icon: ScanLine },
  { label: "Analisis ABC", href: "/analisis-abc/", icon: ChartNoAxesCombined },
  { label: "Inventory Policy", href: "/inventory-policy/", icon: PackageCheck },
  { label: "Prioritas Lokasi", href: "/prioritas-lokasi/", icon: MapPin },
  { label: "Ekspor", href: "/ekspor/", icon: Download },
];

export function SideNav() {
  const actor = useActor();
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
          <Link key={href} href={href} aria-current={currentPath === href.replace(/\/$/, "") ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" /><span>{label}</span>
          </Link>
        ))}
      </nav>
      {actor.role === "RST_ADMIN" && <section className={styles.administration}>
        <p className="nav-section-label">ADMINISTRASI</p>
        <nav aria-label="Administrasi"><Link href="/admin/pengguna/" aria-current={currentPath === "/admin/pengguna" ? "page" : undefined}><Users size={18} aria-hidden="true" /><span>Kelola Pengguna</span></Link></nav>
      </section>}
      <div className="sidebar-footer"><ClipboardCheck size={18} aria-hidden="true" /><div><strong>Perencanaan Data Demo</strong><p>Modul perencanaan memakai data sintetis.</p></div></div>
    </aside>
  );
}
