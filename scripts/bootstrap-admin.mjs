import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export function parseBootstrapConfig(env, args) {
  if (!args.includes("--confirm")) throw new Error("Bootstrap requires explicit --confirm");
  if (args.some((arg) => !["--confirm", "--allow-existing"].includes(arg))) throw new Error("Unknown bootstrap option");
  for (const key of ["BOOTSTRAP_ADMIN_EMAIL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SITE_URL"]) {
    if (typeof env[key] !== "string" || !env[key].trim()) throw new Error(`Missing configuration: ${key}`);
  }
  const email = env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@pln\.co\.id$/.test(email)) throw new Error("Bootstrap email must use the exact PLN domain");
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
    let url;
    try { url = new URL(env[key]); } catch { throw new Error(`Invalid configuration: ${key}`); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid configuration: ${key}`);
  }
  return { email, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL.trim(), secretKey: env.SUPABASE_SECRET_KEY.trim(), siteUrl: env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/+$/, ""), allowExisting: args.includes("--allow-existing") };
}

export async function bootstrapAdmin(config, gateway) {
  if (await gateway.hasActiveAdmin() && !config.allowExisting) throw new Error("An active RST admin already exists; use --allow-existing explicitly");
  const existing = await gateway.findProfile(config.email);
  if (existing?.status === "DISABLED") throw new Error("Bootstrap cannot restore a disabled account");
  let userId = existing?.id; let created = false;
  try {
    if (!userId) { userId = await gateway.invite(config.email, `${config.siteUrl}/auth/invite`); created = true; }
    await gateway.stage(userId);
    await gateway.assign(userId);
    await gateway.audit({ action: "ADMIN_BOOTSTRAPPED", target_type: "profile", target_id: userId, details: { role: "RST_ADMIN", created } });
    await gateway.restore(userId, existing?.status ?? "INVITED");
  } catch {
    let cleanupFailed = false; let revokeFailed = false;
    if (userId) { try { await gateway.stage(userId); } catch { revokeFailed = true; console.error("[bootstrap-admin] REVOKE_FAILED"); } }
    if (created && userId) { try { await gateway.remove(userId); } catch { cleanupFailed = true; } }
    try { await gateway.audit({ action: "ADMIN_BOOTSTRAP_FAILED", target_type: "profile", target_id: userId ?? null, details: { cleanup_failed: cleanupFailed, revoke_failed: revokeFailed } }); } catch { console.error("[bootstrap-admin] FAILURE_AUDIT_FAILED"); }
    if (cleanupFailed) console.error("[bootstrap-admin] CLEANUP_FAILED");
    throw new Error("Bootstrap persistence failed");
  }
}

function check(result) { if (result.error) throw new Error("Bootstrap database operation failed"); }
export function createBootstrapGateway(client) {
  async function status(userId, value) {
    const result = await client.from("profiles").update({ status: value, updated_at: new Date().toISOString() }).eq("id", userId).select("id");
    check(result); if (result.data?.length !== 1) throw new Error("Bootstrap profile missing");
  }
  return {
    async hasActiveAdmin() {
      const result = await client.from("user_role_assignments").select("user_id,profiles!inner(status)").eq("role", "RST_ADMIN").eq("profiles.status", "ACTIVE").limit(1);
      check(result); return !!result.data?.length;
    },
    async findProfile(email) { const result = await client.from("profiles").select("id,status").eq("email", email).maybeSingle(); check(result); return result.data; },
    async invite(email, redirectTo) { const result = await client.auth.admin.inviteUserByEmail(email, { redirectTo }); check(result); if (!result.data.user?.id) throw new Error("Bootstrap invitation failed"); return result.data.user.id; },
    async assign(userId) { check(await client.from("user_role_assignments").upsert({ user_id: userId, role: "RST_ADMIN" }, { onConflict: "user_id" })); },
    async stage(userId) { await status(userId, "DISABLED"); },
    async restore(userId, value) { await status(userId, value); },
    async remove(userId) { check(await client.auth.admin.deleteUser(userId)); },
    async audit(event) { check(await client.from("audit_events").insert(event)); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = parseBootstrapConfig(process.env, process.argv.slice(2));
    const client = createClient(config.supabaseUrl, config.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    await bootstrapAdmin(config, createBootstrapGateway(client));
    console.log("RST admin access assigned. Complete password setup using the invitation email.");
  } catch (error) {
    // Configuration/guard errors are our fixed messages. Provider messages and
    // objects never leave the gateway or reach stdout/stderr.
    const safe = error instanceof Error && /^(Bootstrap requires|Unknown bootstrap|Missing configuration:|Invalid configuration:|Bootstrap email|An active RST admin|Bootstrap cannot|Bootstrap persistence failed)/.test(error.message);
    console.error(safe ? error.message : "Bootstrap failed; check configuration and database access"); process.exitCode = 1;
  }
}
