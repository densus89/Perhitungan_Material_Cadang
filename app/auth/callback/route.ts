import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";

export const dynamic = "force-dynamic";

const destinations: Readonly<Record<string, string>> = {
  "/": "/",
  "/auth/set-password": "/auth/set-password/",
  "/auth/set-password/": "/auth/set-password/",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const codes = url.searchParams.getAll("code");
  const tokenHashes = url.searchParams.getAll("token_hash");
  const types = url.searchParams.getAll("type");
  const nextValues = url.searchParams.getAll("next");
  const next = nextValues[0] ?? "/auth/set-password";
  let target = "/login/?error=invalid-link";

  const pkce = codes.length === 1 && !!codes[0].trim() && tokenHashes.length === 0 && types.length === 0;
  const invitation = codes.length === 0 && tokenHashes.length === 1 && !!tokenHashes[0].trim() && types.length === 1 && types[0] === "invite";
  const providerError = ["error", "error_code", "error_description"].some((name) => url.searchParams.has(name));
  // PKCE remains bound to the initiating browser's verifier. Admin invitations
  // instead verify the emailed token hash server-side and write session cookies.
  if (!providerError && (pkce || invitation) && nextValues.length <= 1 && Object.hasOwn(destinations, next)) {
    try {
      const client = await createServerSupabaseClient();
      const { error } = invitation
        ? await client.auth.verifyOtp({ token_hash: tokenHashes[0], type: "invite" })
        : await client.auth.exchangeCodeForSession(codes[0]);
      if (!error) target = destinations[next];
    } catch {
      // Never reflect provider errors, codes, or query strings into the UI.
    }
  }

  const response = NextResponse.redirect(new URL(target, url.origin));
  // Callback is intentionally outside Proxy; it owns these cache protections.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
