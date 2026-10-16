"use client";

import { usePathname } from "next/navigation";
import { Badge } from "../ui/Badge";
import { useActor, useAssignedUnits } from "../../state/AuthWorkspaceProvider";
import type { AppRole } from "../../domain/access";
import { LogoutButton } from "../../features/auth/LogoutButton";
import { logoutAction } from "../../../app/auth/actions";
import { isPlanningRoute, normalizeWorkspacePath } from "./presentation";
import styles from "./shell.module.css";

const roleLabels: Record<AppRole, string> = {
  RST_ADMIN: "DIV RST Admin", RST_REVIEWER: "DIV RST Reviewer",
  UNIT_OPERATOR: "Operator Unit Induk", VIEWER: "Viewer",
};

function resolveDisplayName(displayName: string, email: string) {
  const providedName = displayName.trim();
  if (providedName) return providedName;

  // Display-only fallback for bootstrapped profiles; authentication and authorization still use the unchanged Actor identity.
  const localPart = (email.split("@")[0] ?? "").split("+")[0] ?? "";
  const words = localPart.toLocaleLowerCase("id-ID").split(/[._-]+/).filter(Boolean);
  return words.length ? words.map((word) => word[0].toLocaleUpperCase("id-ID") + word.slice(1)).join(" ") : "Pengguna";
}

export function TopBar() {
  const actor = useActor();
  const units = useAssignedUnits();
  const pathname = usePathname();
  const displayName = resolveDisplayName(actor.displayName, actor.email);
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("id-ID");
  const showDemoBadge = isPlanningRoute(pathname) && normalizeWorkspacePath(pathname) !== "/impor";
  return (
    <header className={`topbar ${styles.header}`}>
      <div className={styles.context}>
        <div className="workspace-context"><span className="context-dot" aria-hidden="true" /><span>Ruang kerja perencanaan</span>{showDemoBadge ? <Badge tone="demo">Data Demo</Badge> : null}</div>
        <p className={styles.units} aria-label="Unit Induk ditugaskan">{units.length ? units.map((unit) => unit.name).join(" · ") : actor.unitIndukIds.length ? "Nama Unit Induk belum tersedia" : "Belum ada Unit Induk ditugaskan"}</p>
      </div>
      <div className={`topbar-meta ${styles.meta}`}>
        <span className="avatar" aria-hidden="true">{initials}</span>
        <div className={styles.identity}><strong>{displayName}</strong><span>{actor.email}</span><span>{roleLabels[actor.role]}</span></div>
        <LogoutButton action={logoutAction} />
      </div>
    </header>
  );
}
