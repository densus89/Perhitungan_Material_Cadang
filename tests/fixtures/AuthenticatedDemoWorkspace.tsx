import type { ReactNode } from "react";
import { vi } from "vitest";
import { AuthenticatedWorkspace } from "../../src/features/auth/AuthenticatedWorkspace";
import { workspaceActor, workspaceUnits } from "./workspace-actor";

vi.mock("../../app/auth/actions", () => ({ logoutAction: async () => ({ status: "idle" }) }));

export function AuthenticatedDemoWorkspace({ children }: { children: ReactNode }) {
  return <AuthenticatedWorkspace actor={workspaceActor} units={workspaceUnits}>{children}</AuthenticatedWorkspace>;
}
