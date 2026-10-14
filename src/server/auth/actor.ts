import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isAllowedPlnEmail, normalizePlnEmail, type Actor, type AppRole } from "../../domain/access";
import type { Database } from "../../lib/supabase/database.types";

export type { Actor } from "../../domain/access";
type ActorClient = Pick<SupabaseClient<Database>, "auth" | "from">;

export class ActorAccessError extends Error {
  readonly status: 401 | 403;

  constructor(readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "MFA_REQUIRED") {
    super(code === "UNAUTHENTICATED" ? "Authentication required" : code === "MFA_REQUIRED" ? "Multi-factor authentication required" : "Application access denied");
    this.name = "ActorAccessError";
    this.status = code === "UNAUTHENTICATED" ? 401 : 403;
  }
}

async function hasRequiredAssurance(client: ActorClient, role: AppRole): Promise<boolean> {
  if (role !== "RST_ADMIN") return true;
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return !error && data.currentLevel === "aal2";
  } catch {
    return false;
  }
}

const roles: readonly AppRole[] = ["RST_ADMIN", "RST_REVIEWER", "UNIT_OPERATOR", "VIEWER"];

async function authenticatedUser(client: ActorClient): Promise<User | null> {
  try {
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
}

async function actorForUser(client: ActorClient, user: User): Promise<Actor | null> {
  if (!user.email || !isAllowedPlnEmail(user.email)) return null;
  const email = normalizePlnEmail(user.email);

  try {
    const { data: profiles, error: profileError } = await client.from("profiles")
      .select("id, email, display_name, status").eq("id", user.id);
    if (profileError || profiles?.length !== 1) return null;
    const profile = profiles[0];
    if (profile.id !== user.id || profile.status !== "ACTIVE" || !isAllowedPlnEmail(profile.email) || normalizePlnEmail(profile.email) !== email) return null;

    // Do not use limit(1): multiple relational roles must fail closed.
    const { data: assignments, error: roleError } = await client.from("user_role_assignments")
      .select("role").eq("user_id", user.id);
    if (roleError || assignments?.length !== 1 || !roles.includes(assignments[0].role)) return null;

    if (!await hasRequiredAssurance(client, assignments[0].role)) return null;

    const { data: units, error: unitError } = await client.from("user_unit_assignments")
      .select("unit_induk_id").eq("user_id", user.id);
    if (unitError || !units) return null;

    return {
      userId: user.id,
      email,
      displayName: profile.display_name,
      role: assignments[0].role,
      status: "ACTIVE",
      unitIndukIds: units.map((unit) => unit.unit_induk_id),
    };
  } catch {
    return null;
  }
}

/** Always re-read Auth and relational access; no session metadata or actor cache. */
export async function loadActor(client: ActorClient): Promise<Actor | null> {
  const user = await authenticatedUser(client);
  return user ? actorForUser(client, user) : null;
}

export async function requireActor(client: ActorClient): Promise<Actor> {
  const user = await authenticatedUser(client);
  if (!user) throw new ActorAccessError("UNAUTHENTICATED");
  const actor = await actorForUser(client, user);
  if (!actor) {
    // Resolve only enough relational state to distinguish a valid admin who
    // must complete MFA from every other denied identity.
    try {
      const { data, error } = await client.from("user_role_assignments").select("role").eq("user_id", user.id);
      if (!error && data?.length === 1 && data[0].role === "RST_ADMIN") {
        const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!assurance.error && assurance.data.currentLevel !== "aal2") throw new ActorAccessError("MFA_REQUIRED");
      }
    } catch (error) {
      if (error instanceof ActorAccessError) throw error;
    }
    throw new ActorAccessError("FORBIDDEN");
  }
  return actor;
}
