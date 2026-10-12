import { Badge } from "../ui/Badge";

export function TopBar() {
  return (
    <header className="topbar">
      <div className="workspace-context"><span className="context-dot" aria-hidden="true" /><span>Ruang kerja perencanaan</span><span className="context-divider" aria-hidden="true">/</span><strong>Skenario demo</strong></div>
      <div className="topbar-meta"><Badge tone="demo">Data Demo</Badge><span className="avatar" aria-label="Pengguna demo">DM</span></div>
    </header>
  );
}
