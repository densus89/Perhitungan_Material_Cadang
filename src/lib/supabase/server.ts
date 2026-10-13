import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "../../config/env";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          // Server Components have read-only cookies; Proxy writes refresh cookies
          // and cache headers. Actions/Route Handlers can write their own cookies.
          if (!(error instanceof Error) || !error.message.startsWith("Cookies can only be modified in a Server Action or Route Handler.")) {
            throw error;
          }
        }
      },
    },
  });
}
