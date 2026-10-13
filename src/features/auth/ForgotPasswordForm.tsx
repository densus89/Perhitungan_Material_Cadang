"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthFeedback, AuthInput } from "./AuthFields";
import { initialAuthState, type AuthFormAction } from "./types";
import styles from "./auth.module.css";

export function ForgotPasswordForm({ action }: { action: AuthFormAction }) {
  const [state, formAction, pending] = useActionState(action, initialAuthState);
  return (
    <form action={formAction} aria-label="Pemulihan kata sandi" aria-busy={pending} className={styles.form}>
      <fieldset disabled={pending} className={styles.fields}>
        <AuthInput field="email" label="Email PLN" autoComplete="email" state={state} prefix="reset" />
        <button type="submit" className="button button--primary" disabled={pending}>{pending ? "Memproses…" : "Kirim tautan pemulihan"}</button>
      </fieldset>
      <AuthFeedback state={state} pending={pending} prefix="reset" />
      <Link href="/login/" className="text-link">Kembali ke login</Link>
    </form>
  );
}
