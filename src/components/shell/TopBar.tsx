"use client";

import { Badge } from "../ui/Badge";
import { useActor, useAssignedUnits } from "../../state/AuthWorkspaceProvider";
import type { AppRole } from "../../domain/access";
import { LogoutButton } from "../../features/auth/LogoutButton";
import { logoutAction } from "../../../app/auth/actions";
import styles from "./shell.module.css";

const roleLabels: Record<AppRole, string> = {
  RST_ADMIN: "DIV RST Admin", RST_REVIEWER: "DIV RST Reviewer",
  UNIT_OPERATOR: "Operator Unit Induk", VIEWER: "Viewer",
};

export function TopBar() {
  const actor = useActor();
  const units = useAssignedUnits();
  const initials = actor.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <header className={`topbar ${styles.header}`}>
      <div className={styles.context}>
        <div className="workspace-context"><span className="context-dot" aria-hidden="true" /><span>Ruang kerja perencanaan</span><Badge tone="demo">Data Demo</Badge></div>
        <p className={styles.units} aria-label="Unit Induk ditugaskan">{units.length ? units.map((unit) => unit.name).join(" · ") : actor.unitIndukIds.length ? "Nama Unit Induk belum tersedia" : "Belum ada Unit Induk ditugaskan"}</p>
      </div>
      <div className={`topbar-meta ${styles.meta}`}>
        <span className="avatar" aria-hidden="true">{initials || actor.email[0].toUpperCase()}</span>
        <div className={styles.identity}><strong>{actor.displayName}</strong><span>{actor.email}</span><span>{roleLabels[actor.role]}</span></div>
        <LogoutButton action={logoutAction} />
      </div>
    </header>
  );
}
