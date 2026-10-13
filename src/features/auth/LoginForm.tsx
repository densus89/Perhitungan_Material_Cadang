"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthFeedback, AuthInput } from "./AuthFields";
import { initialAuthState, type AuthFormAction } from "./types";
import styles from "./auth.module.css";

export function LoginForm({ action }: { action: AuthFormAction }) {
  const [state, formAction, pending] = useActionState(action, initialAuthState);
  return (
    <form action={formAction} aria-label="Login akun PLN" aria-busy={pending} className={styles.form}>
      <fieldset disabled={pending} className={styles.fields}>
        <AuthInput field="email" label="Email PLN" autoComplete="username" state={state} prefix="login" />
        <AuthInput field="password" label="Kata sandi" autoComplete="current-password" state={state} prefix="login" />
        <button type="submit" className="button button--primary" disabled={pending}>{pending ? "Memproses…" : "Masuk"}</button>
      </fieldset>
      <AuthFeedback state={state} pending={pending} prefix="login" />
      <Link href="/auth/forgot-password/" className="text-link">Lupa kata sandi?</Link>
    </form>
  );
}
