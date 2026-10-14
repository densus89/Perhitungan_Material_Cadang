import type { Database } from "../lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Permission = "MANAGE_USERS" | "REVIEW_DATASET" | "WRITE_OWN_UNIT" | "READ_NATIONAL_SUMMARY";

export interface Actor {
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: "ACTIVE";
  unitIndukIds: readonly string[];
}

const permissions: Record<AppRole, readonly Permission[]> = {
  RST_ADMIN: ["MANAGE_USERS", "REVIEW_DATASET", "WRITE_OWN_UNIT", "READ_NATIONAL_SUMMARY"],
  RST_REVIEWER: ["REVIEW_DATASET", "READ_NATIONAL_SUMMARY"],
  UNIT_OPERATOR: ["WRITE_OWN_UNIT", "READ_NATIONAL_SUMMARY"],
  VIEWER: ["READ_NATIONAL_SUMMARY"],
};

export function normalizePlnEmail(email: string): string {
  return email.trim().toLowerCase();
}

const explicitlyAllowedGuestEmails = new Set(["sitompul89@gmail.com"]);

export function isAllowedPlnEmail(email: string): boolean {
  const normalized = normalizePlnEmail(email);
  return /^[^\s@]+@pln\.co\.id$/.test(normalized) || explicitlyAllowedGuestEmails.has(normalized);
}

/** Unit-scoped permissions still require an assignment check at the operation. */
export function can(role: AppRole, permission: Permission): boolean {
  return Object.hasOwn(permissions, role) && permissions[role].includes(permission);
}
