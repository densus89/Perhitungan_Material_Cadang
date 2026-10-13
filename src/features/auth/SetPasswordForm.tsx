"use client";

import { useActionState } from "react";
import { AuthFeedback, AuthInput } from "./AuthFields";
import { initialAuthState, type AuthFormAction } from "./types";
import styles from "./auth.module.css";

export function SetPasswordForm({ action }: { action: AuthFormAction }) {
  const [state, formAction, pending] = useActionState(action, initialAuthState);
  return (
    <form action={formAction} aria-label="Pengaturan kata sandi" aria-busy={pending} className={styles.form}>
      <p>Gunakan kata sandi minimal 12 karakter.</p>
      <fieldset disabled={pending} className={styles.fields}>
        <AuthInput field="password" label="Kata sandi baru" autoComplete="new-password" minLength={12} state={state} prefix="setup" />
        <AuthInput field="confirmPassword" label="Konfirmasi kata sandi" autoComplete="new-password" minLength={12} state={state} prefix="setup" />
        <button type="submit" className="button button--primary" disabled={pending}>{pending ? "Memproses…" : "Simpan kata sandi"}</button>
      </fieldset>
      <AuthFeedback state={state} pending={pending} prefix="setup" />
    </form>
  );
}
