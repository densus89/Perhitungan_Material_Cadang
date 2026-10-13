"use client";

import { useActionState } from "react";
import { AuthFeedback } from "./AuthFields";
import { initialAuthState, type AuthFormAction } from "./types";

/** The authenticated shell supplies the logout Server Action. */
export function LogoutButton({ action }: { action: AuthFormAction }) {
  const [state, formAction, pending] = useActionState(action, initialAuthState);
  return (
    <form action={formAction} aria-label="Keluar dari akun" aria-busy={pending}>
      <button type="submit" className="button" disabled={pending}>{pending ? "Memproses…" : "Keluar"}</button>
      <AuthFeedback state={state} pending={pending} prefix="logout" />
    </form>
  );
}
