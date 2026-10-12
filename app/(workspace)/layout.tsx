import type { ReactNode } from "react";
import { AppShell } from "../../src/components/shell/AppShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
