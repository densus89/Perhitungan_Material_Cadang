import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "../../config/env";
import type { Database } from "./database.types";

/** Refresh and route convenience only. Every server operation must reauthorize. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const refreshedCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const refreshHeaders: Record<string, string> = { "Cache-Control": "private, no-store" };
  const env = getPublicEnv();

  const client = createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          refreshedCookies.set(cookie.name, cookie);
        }
        Object.assign(refreshHeaders, headers);
        // Rebuild request overrides so the render sees refreshed session cookies.
        response = NextResponse.next({ request });
        for (const { name, value, options } of refreshedCookies.values()) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let authenticated = false;
  try {
    const { data, error } = await client.auth.getUser();
    authenticated = !error && !!data.user;
  } catch {
    // A stale session or unavailable Auth endpoint cannot establish identity.
  }

  const path = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const publicRoute = path === "/login" || path === "/auth/callback" || path === "/auth/set-password" || path === "/auth/forgot-password";
  const destination = !authenticated && !publicRoute ? "/login" : authenticated && path === "/login" ? "/ringkasan" : null;

  if (destination) {
    // Fixed local destinations discard query strings, including untrusted next.
    const redirect = NextResponse.redirect(new URL(destination, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    response = redirect;
  }
  for (const [name, value] of Object.entries(refreshHeaders)) response.headers.set(name, value);
  return response;
}
