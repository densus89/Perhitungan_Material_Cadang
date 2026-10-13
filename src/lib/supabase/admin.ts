import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "../../config/env";
import type { Database } from "./database.types";

export function createAdminSupabaseClient() {
  const env = getServerEnv();
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
