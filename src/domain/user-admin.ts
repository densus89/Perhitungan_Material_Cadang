import { z } from "zod";
import { isAllowedPlnEmail, normalizePlnEmail, type AppRole } from "./access";

export const appRoles = ["RST_ADMIN", "RST_REVIEWER", "UNIT_OPERATOR", "VIEWER"] as const;
const accessFields = {
  role: z.enum(appRoles),
  unitIndukIds: z.array(z.uuid()).max(200).refine((ids) => new Set(ids).size === ids.length, "Unit Induk tidak boleh duplikat."),
};
const requireOperatorUnits = (value: { role: AppRole; unitIndukIds: string[] }) => value.role !== "UNIT_OPERATOR" || value.unitIndukIds.length > 0;
const unitIssue = { message: "UNIT_OPERATOR memerlukan setidaknya satu Unit Induk.", path: ["unitIndukIds"] };
export const userAccessSchema = z.object(accessFields).strict().refine(requireOperatorUnits, unitIssue);
export const inviteUserSchema = z.object({
  ...accessFields,
  email: z.string().max(254).transform(normalizePlnEmail).refine(isAllowedPlnEmail, "Gunakan email dengan domain @pln.co.id."),
  displayName: z.string().trim().min(1).max(150),
}).strict().refine(requireOperatorUnits, unitIssue);
export const updateUserAccessSchema = z.object({
  ...accessFields, userId: z.uuid(), status: z.enum(["INVITED", "ACTIVE", "DISABLED"]),
}).strict().refine(requireOperatorUnits, unitIssue);
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserAccessInput = z.infer<typeof updateUserAccessSchema>;
export function validateUserAccess(input: unknown) { return userAccessSchema.safeParse(input); }
export type ManagedUser = { userId: string; email: string; displayName: string; role: AppRole | null; unitIndukIds: string[]; status: "INVITED" | "ACTIVE" | "DISABLED"; updatedAt: string };
export type ManagedUnit = { id: string; code: string; name: string };
