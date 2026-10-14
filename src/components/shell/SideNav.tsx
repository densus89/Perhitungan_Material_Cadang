"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChartNoAxesCombined, ClipboardCheck, Download, FileInput, LayoutDashboard, MapPin, PackageCheck, ScanLine, Users, Zap } from "lucide-react";
import { useActor } from "../../state/AuthWorkspaceProvider";
import { isPlanningRoute, normalizeWorkspacePath, planningRoutes } from "./presentation";
import styles from "./shell.module.css";

const planningIcons = {
  summary: LayoutDashboard,
  import: FileInput,
  mapping: ScanLine,
  analysis: ChartNoAxesCombined,
  policy: PackageCheck,
  location: MapPin,
  export: Download,
} satisfies Record<(typeof planningRoutes)[number]["icon"], typeof LayoutDashboard>;

export function SideNav() {
  const actor = useActor();
  const pathname = usePathname() ?? "/";
  const currentPath = pathname === "/" ? "/ringkasan" : normalizeWorkspacePath(pathname);
  const planningContext = isPlanningRoute(pathname);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-symbol"><Zap size={23} aria-hidden="true" /></span>
        <div><p className="brand-overline">RUANG KERJA</p><h2>Perencanaan Material Cadang</h2></div>
      </div>
      <p className="nav-section-label">PERENCANAAN</p>
      <nav aria-label="Navigasi utama">
        {planningRoutes.map(({ label, href, icon }) => {
          const Icon = planningIcons[icon];
          return (
            <Link key={href} href={href} aria-current={currentPath === normalizeWorkspacePath(href) ? "page" : undefined}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
            </Link>
          );
        })}
      </nav>
      {actor.role === "RST_ADMIN" && <section className={styles.administration}>
        <p className="nav-section-label">ADMINISTRASI</p>
        <nav aria-label="Administrasi"><Link href="/admin/pengguna/" aria-current={currentPath === "/admin/pengguna" ? "page" : undefined}><Users size={18} aria-hidden="true" /><span>Kelola Pengguna</span></Link></nav>
      </section>}
      <div className="sidebar-footer"><ClipboardCheck size={18} aria-hidden="true" /><div>{planningContext ? <><strong>Perencanaan Data Demo</strong><p>Modul perencanaan memakai data sintetis.</p></> : <><strong>Administrasi Pengguna</strong><p>Kelola akses dan penugasan pengguna.</p></>}</div></div>
    </aside>
  );
}
