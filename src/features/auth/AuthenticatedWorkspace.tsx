"use client";

import type { ReactNode } from "react";
import type { Actor } from "../../domain/access";
import { AuthWorkspaceProvider, type AssignedUnit } from "../../state/AuthWorkspaceProvider";
import { DemoWorkspaceProvider } from "../../state/DemoWorkspaceProvider";
import { AppShell } from "../../components/shell/AppShell";

export function AuthenticatedWorkspace({ actor, units, children }: {
  actor: Actor; units?: readonly AssignedUnit[]; children: ReactNode;
}) {
  return <AuthWorkspaceProvider actor={actor} units={units}>
    <DemoWorkspaceProvider><AppShell>{children}</AppShell></DemoWorkspaceProvider>
  </AuthWorkspaceProvider>;
}
