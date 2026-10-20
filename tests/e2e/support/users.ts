import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database";
import {
  E2E_IDENTITIES,
  E2E_SYNTHETIC_MARKER,
  assertSyntheticE2eUser,
  type E2EEnvironment,
} from "./environment";

type AdminClient = SupabaseClient<Database>;

export function requireE2eData<R extends { data: unknown; error: unknown }>(result: R, operation: string): NonNullable<R["data"]> {
  if (result.error || result.data === null || result.data === undefined) throw new Error(`Synthetic E2E ${operation} failed`);
  return result.data as NonNullable<R["data"]>;
}

export function requireE2eSuccess<R extends { error: unknown }>(result: R, operation: string): void {
  if (result.error) throw new Error(`Synthetic E2E ${operation} failed`);
}

export function createE2EAdminClient(environment: E2EEnvironment): AdminClient {
  return createClient<Database>(environment.supabaseUrl, environment.supabaseSecretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function findUserByEmail(client: AdminClient, email: string): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const data = requireE2eData(await client.auth.admin.listUsers({ page, perPage }), "user lookup");
    const match = data.users.find((user) => user.email === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  throw new Error("Synthetic E2E user lookup exceeded the safe page limit");
}

export async function cleanupSyntheticE2EUsers(client: AdminClient): Promise<void> {
  for (const identity of Object.values(E2E_IDENTITIES)) {
    const user = await findUserByEmail(client, identity.email);
    if (!user) continue;
    assertSyntheticE2eUser(user);
    requireE2eSuccess(await client.auth.admin.deleteUser(user.id), "user cleanup");
  }
}

export async function resetSyntheticE2EAdminMfa(client: AdminClient): Promise<void> {
  const user = await findUserByEmail(client, E2E_IDENTITIES.admin.email);
  if (!user) throw new Error("Synthetic E2E MFA user lookup failed");
  assertSyntheticE2eUser(user);
  const listed = requireE2eData(await client.auth.admin.mfa.listFactors({ userId: user.id }), "MFA factor listing");
  for (const factor of listed.factors) {
    requireE2eSuccess(await client.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id }), "MFA factor deletion");
  }
}

export async function provisionSyntheticE2EUsers(client: AdminClient, password: string): Promise<void> {
  await cleanupSyntheticE2EUsers(client);
  const unit = requireE2eData(
    await client.from("unit_induk").select("id").eq("code", E2E_IDENTITIES.operator.unitCode).single(),
    "unit lookup",
  );

  for (const identity of Object.values(E2E_IDENTITIES)) {
    const created = requireE2eData(await client.auth.admin.createUser({
      email: identity.email,
      password,
      email_confirm: true,
      app_metadata: { e2e_marker: E2E_SYNTHETIC_MARKER },
      user_metadata: { display_name: identity.displayName },
    }), "user creation").user;
    if (!created) throw new Error("Synthetic E2E user creation returned no user");
    assertSyntheticE2eUser(created);

    const profile = requireE2eData(await client.from("profiles")
      .update({ display_name: identity.displayName, status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("id", created.id)
      .select("id"), "profile activation");
    if (profile.length !== 1) throw new Error("Synthetic E2E profile activation was not unique");

    requireE2eSuccess(await client.from("user_role_assignments")
      .upsert({ user_id: created.id, role: identity.role }, { onConflict: "user_id" }), "role assignment");
    if (identity.role === "UNIT_OPERATOR") {
      requireE2eSuccess(await client.from("user_unit_assignments")
        .insert({ user_id: created.id, unit_induk_id: unit.id }), "unit assignment");
    }
  }
}
