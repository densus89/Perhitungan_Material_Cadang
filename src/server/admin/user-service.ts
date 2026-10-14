import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "../../domain/access";
import { inviteUserSchema, updateUserAccessSchema, type InviteUserInput, type UpdateUserAccessInput, type ManagedUser } from "../../domain/user-admin";
import type { Database } from "../../lib/supabase/database.types";

type AuditEvent = Database["public"]["Tables"]["audit_events"]["Insert"];
export type AccessReplaceOutcome = "UPDATED" | "FAILED" | "FORBIDDEN" | "ACCESS_CONFLICT";
export interface UserAdminDependencies {
  siteUrl: string;
  unitsExist(ids: string[]): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;
  invite(email: string, redirectTo: string): Promise<{ userId?: string; conflict?: boolean }>;
  deleteAuthUser(id: string): Promise<void>;
  saveInvitation(id: string, input: InviteUserInput): Promise<void>;
  markInvited(id: string): Promise<void>;
  revokeAccess(id: string): Promise<void>;
  readUser(id: string): Promise<{ status: ManagedUser["status"] } | null>;
  replaceAccess(input: UpdateUserAccessInput, actorId: string): Promise<AccessReplaceOutcome>;
  audit(event: AuditEvent): Promise<void>;
  log(code: string): void;
}
export type AdminResult = { status: 200 | 201 | 403 | 409 | 422 | 500; code: string; message: string };
const forbidden: AdminResult = { status: 403, code: "FORBIDDEN", message: "Akses administrasi DIV RST diperlukan." };
const invalid: AdminResult = { status: 422, code: "INVALID_INPUT", message: "Periksa email, role, dan Unit Induk yang dipilih." };
const conflict: AdminResult = { status: 409, code: "USER_EXISTS", message: "Akun sudah terdaftar atau telah diundang." };
const failure: AdminResult = { status: 500, code: "ADMIN_FAILED", message: "Tidak dapat menyimpan akses. Hubungi admin DIV RST." };
async function failureAudit(deps: UserAdminDependencies, event: AuditEvent) {
  try { await deps.audit(event); } catch { deps.log("FAILURE_AUDIT_FAILED"); }
}
export async function inviteUser(actor: Actor, raw: unknown, deps: UserAdminDependencies): Promise<AdminResult> {
  if (actor.role !== "RST_ADMIN" || actor.status !== "ACTIVE") return forbidden;
  const parsed = inviteUserSchema.safeParse(raw); if (!parsed.success) return invalid;
  const input = parsed.data; let userId: string | undefined;
  try {
    if (!await deps.unitsExist(input.unitIndukIds)) return invalid;
    if (await deps.emailExists(input.email)) return conflict;
    const invited = await deps.invite(input.email, `${deps.siteUrl.replace(/\/$/, "")}/auth/callback?next=/auth/set-password`);
    if (invited.conflict) return conflict;
    if (!invited.userId) throw new Error("INVITE_FAILED");
    userId = invited.userId;
    await deps.saveInvitation(userId, input);
    await deps.audit({ actor_id: actor.userId, action: "USER_INVITED", target_type: "profile", target_id: userId, details: { role: input.role, unit_induk_ids: input.unitIndukIds } });
    await deps.markInvited(userId);
    return { status: 201, code: "USER_INVITED", message: "Undangan berhasil dikirim." };
  } catch {
    let cleanupFailed = false; let revokeFailed = false;
    if (userId) {
      try { await deps.revokeAccess(userId); } catch { revokeFailed = true; deps.log("INVITE_REVOKE_FAILED"); }
      try { await deps.deleteAuthUser(userId); } catch { cleanupFailed = true; deps.log("INVITE_CLEANUP_FAILED"); }
    }
    await failureAudit(deps, { actor_id: actor.userId, action: "USER_INVITE_FAILED", target_type: "profile", target_id: userId ?? null, details: { cleanup_failed: cleanupFailed, revoke_failed: revokeFailed } });
    deps.log("USER_INVITE_FAILED"); return failure;
  }
}
export async function updateUserAccess(actor: Actor, raw: unknown, deps: UserAdminDependencies): Promise<AdminResult> {
  if (actor.role !== "RST_ADMIN" || actor.status !== "ACTIVE") return forbidden;
  const parsed = updateUserAccessSchema.safeParse(raw); if (!parsed.success) return invalid;
  const input = parsed.data;
  if (input.userId === actor.userId) return { status: 409, code: "SELF_ACCESS_CHANGE", message: "Gunakan admin lain untuk mengubah akses akun sendiri." };
  try {
    if (!await deps.unitsExist(input.unitIndukIds)) return invalid;
    const current = await deps.readUser(input.userId);
    if (!current || (current.status === "INVITED" && input.status === "ACTIVE") || (current.status !== "INVITED" && input.status === "INVITED")) return { status: 409, code: "ACCESS_CONFLICT", message: "Status akun tidak dapat diubah dengan permintaan ini." };
    const outcome = await deps.replaceAccess(input, actor.userId);
    if (outcome === "FORBIDDEN") return forbidden;
    if (outcome === "ACCESS_CONFLICT") return { status: 409, code: "ACCESS_CONFLICT", message: "Status akun tidak dapat diubah dengan permintaan ini." };
    if (outcome === "FAILED") { deps.log("USER_ACCESS_UPDATE_FAILED"); return failure; }
    return { status: 200, code: "ACCESS_UPDATED", message: "Akses berhasil diperbarui." };
  } catch {
    await failureAudit(deps, { actor_id: actor.userId, action: "USER_ACCESS_UPDATE_FAILED", target_type: "profile", target_id: input.userId, details: {} });
    deps.log("USER_ACCESS_UPDATE_FAILED"); return failure;
  }
}
type Client = SupabaseClient<Database>;
function check(result: { error: unknown }) { if (result.error) throw new Error("ADMIN_PERSISTENCE_FAILED"); }
export function createUserAdminDependencies(client: Client, siteUrl: string): UserAdminDependencies {
  async function updateProfile(id: string, values: Database["public"]["Tables"]["profiles"]["Update"]) {
    const result = await client.from("profiles").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).select("id");
    check(result); if (result.data?.length !== 1) throw new Error("PROFILE_MISSING");
  }
  async function assignments(userId: string, input: Pick<UpdateUserAccessInput, "role" | "unitIndukIds">) {
    check(await client.from("user_role_assignments").upsert({ user_id: userId, role: input.role }, { onConflict: "user_id" }));
    check(await client.from("user_unit_assignments").delete().eq("user_id", userId));
    if (input.unitIndukIds.length) check(await client.from("user_unit_assignments").insert(input.unitIndukIds.map((id) => ({ user_id: userId, unit_induk_id: id }))));
  }
  return {
    siteUrl,
    async unitsExist(ids) { if (!ids.length) return true; const result = await client.from("unit_induk").select("id").in("id", ids); check(result); return result.data?.length === ids.length; },
    async emailExists(email) { const result = await client.from("profiles").select("id").eq("email", email); check(result); return !!result.data?.length; },
    async invite(email, redirectTo) {
      const result = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (result.error && ["email_exists", "user_already_exists"].includes(result.error.code ?? "")) return { conflict: true };
      check(result); return { userId: result.data.user?.id };
    },
    async deleteAuthUser(id) { check(await client.auth.admin.deleteUser(id)); },
    async saveInvitation(id, input) { await updateProfile(id, { display_name: input.displayName, status: "DISABLED" }); await assignments(id, input); },
    async markInvited(id) { await updateProfile(id, { status: "INVITED" }); },
    async revokeAccess(id) { await updateProfile(id, { status: "DISABLED" }); },
    async readUser(id) { const result = await client.from("profiles").select("status").eq("id", id).maybeSingle(); check(result); return result.data; },
    async replaceAccess(input, actorId) {
      const result = await client.rpc("admin_replace_user_access", { p_actor_id: actorId, p_user_id: input.userId, p_role: input.role, p_unit_induk_ids: input.unitIndukIds, p_status: input.status });
      check(result);
      if (!["UPDATED", "FAILED", "FORBIDDEN", "ACCESS_CONFLICT"].includes(result.data ?? "")) throw new Error("ADMIN_PERSISTENCE_FAILED");
      return result.data as AccessReplaceOutcome;
    },
    async audit(event) { check(await client.from("audit_events").insert(event)); },
    log(code) { console.error(`[user-admin] ${code}`); },
  };
}
export async function loadManagedUsers(client: Client) {
  const [profiles, roles, assignments, units] = await Promise.all([
    client.from("profiles").select("id,email,display_name,status,updated_at").order("email"),
    client.from("user_role_assignments").select("user_id,role"),
    client.from("user_unit_assignments").select("user_id,unit_induk_id"),
    client.from("unit_induk").select("id,code,name").order("name"),
  ]);
  for (const result of [profiles, roles, assignments, units]) check(result);
  const users: ManagedUser[] = (profiles.data ?? []).map((profile) => ({ userId: profile.id, email: profile.email, displayName: profile.display_name, role: roles.data?.find((role) => role.user_id === profile.id)?.role ?? null, unitIndukIds: (assignments.data ?? []).filter((assignment) => assignment.user_id === profile.id).map((assignment) => assignment.unit_induk_id), status: profile.status, updatedAt: profile.updated_at }));
  return { users, units: units.data ?? [] };
}
