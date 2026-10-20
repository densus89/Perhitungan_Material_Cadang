import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "../../config/env";
import type { Database } from "./database";

export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
}
