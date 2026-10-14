"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser";
import styles from "./auth.module.css";

function invitationTokens(fragment: string): { access_token: string; refresh_token: string } | null {
  if (!fragment.startsWith("#") || fragment.length === 1) return null;
  const raw = fragment.slice(1);
  // URLSearchParams tolerates bad percent escapes/UTF-8; invitations must not.
  try {
    for (const pair of raw.split("&")) {
      if (!pair || !pair.includes("=")) return null;
      decodeURIComponent(pair.replace(/\+/g, " "));
    }
  } catch { return null; }
  const params = new URLSearchParams(raw);
  const allowed = new Set(["access_token", "refresh_token", "type", "token_type", "expires_in", "expires_at"]);
  const names = [...params.keys()];
  if (names.some((name) => !allowed.has(name)) || new Set(names).size !== names.length) return null;
  const accessToken = params.get("access_token"); const refreshToken = params.get("refresh_token");
  if (!accessToken || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) || !refreshToken || /\s/.test(refreshToken)) return null;
  if (params.has("type") && params.get("type") !== "invite") return null;
  if (params.has("token_type") && params.get("token_type") !== "bearer") return null;
  for (const field of ["expires_in", "expires_at"]) if (params.has(field) && !/^\d+$/.test(params.get(field)!)) return null;
  return { access_token: accessToken, refresh_token: refreshToken };
}

export function InviteBridge() {
  const router = useRouter(); const started = useRef(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Tokens live only in this transient browser operation and Supabase's cookie
    // session. Scrub before parsing, creating a client, or awaiting any work.
    void (async () => {
      const fragment = window.location.hash;
      window.history.replaceState(null, "", "/auth/invite/");
      const tokens = invitationTokens(fragment);
      if (!tokens) throw new Error("INVALID_INVITATION");
      const { data, error } = await createBrowserSupabaseClient().auth.setSession(tokens);
      if (error || !data.session) throw new Error("INVALID_INVITATION");
      router.replace("/auth/set-password/");
    })().catch(() => {
      setFailed(true);
      router.replace("/login/?error=invalid-link");
    });
  }, [router]);
  return <p className={styles.feedback} role={failed ? "alert" : "status"}>{failed ? "Tautan undangan tidak valid atau sudah kedaluwarsa. Hubungi admin DIV RST." : "Memproses undangan…"}</p>;
}
