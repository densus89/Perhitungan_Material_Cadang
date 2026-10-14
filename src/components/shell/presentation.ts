export const planningRoutes = [
  { label: "Ringkasan", href: "/ringkasan/", icon: "summary" },
  { label: "Impor", href: "/impor/", icon: "import" },
  { label: "Pemetaan RFQ", href: "/pemetaan-rfq/", icon: "mapping" },
  { label: "Analisis ABC", href: "/analisis-abc/", icon: "analysis" },
  { label: "Inventory Policy", href: "/inventory-policy/", icon: "policy" },
  { label: "Prioritas Lokasi", href: "/prioritas-lokasi/", icon: "location" },
  { label: "Ekspor", href: "/ekspor/", icon: "export" },
] as const;

export function normalizeWorkspacePath(pathname: string | null | undefined) {
  const normalized = (pathname ?? "").replace(/\/+$/, "");
  return normalized || "/";
}

export function isPlanningRoute(pathname: string | null | undefined) {
  const currentPath = normalizeWorkspacePath(pathname);
  return planningRoutes.some(({ href }) => normalizeWorkspacePath(href) === currentPath);
}
