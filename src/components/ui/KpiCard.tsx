import type { LucideIcon } from "lucide-react";

export function KpiCard({ label, value, detail, icon: Icon, attention = false }: { label: string; value: number; detail: string; icon: LucideIcon; attention?: boolean }) {
  return (
    <article className={`kpi-card${attention ? " kpi-card--attention" : ""}`} aria-label={label}>
      <div className="kpi-label"><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
      <p className="kpi-value">{value.toLocaleString("id-ID")}</p>
      <p className="kpi-detail">{detail}</p>
    </article>
  );
}
