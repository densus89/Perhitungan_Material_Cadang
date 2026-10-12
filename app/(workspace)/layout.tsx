import type { ReactNode } from "react";
import { AppShell } from "../../src/components/shell/AppShell";
import { DemoWorkspaceProvider } from "../../src/state/DemoWorkspaceProvider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <DemoWorkspaceProvider><AppShell>{children}</AppShell></DemoWorkspaceProvider>;
}
