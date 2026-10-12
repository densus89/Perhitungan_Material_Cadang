import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function StatusBanner({ children, href, action }: { children: ReactNode; href: string; action: string }) {
  return (
    <div className="status-banner" role="status">
      <CircleAlert size={20} aria-hidden="true" />
      <p>{children}</p>
      <a href={href}>{action}<span aria-hidden="true"> →</span></a>
    </div>
  );
}
