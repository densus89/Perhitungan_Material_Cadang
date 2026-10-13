import type { AuthField, AuthFormState } from "./types";
import styles from "./auth.module.css";

export function AuthFeedback({ state, pending, prefix }: { state: AuthFormState; pending: boolean; prefix: string }) {
  if (pending) return <p role="status" aria-live="polite">Memproses permintaan…</p>;
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} aria-live={state.status === "error" ? "assertive" : "polite"} className={styles.feedback}>
      {state.message && <p>{state.message}</p>}
      {Object.entries(state.fieldErrors ?? {}).map(([field, message]) => <p id={`${prefix}-${field}-error`} key={field}>{message}</p>)}
    </div>
  );
}

export function AuthInput({ field, label, state, prefix, autoComplete, minLength }: {
  field: AuthField; label: string; state: AuthFormState; prefix: string; autoComplete: string; minLength?: number;
}) {
  const error = state.fieldErrors?.[field];
  const id = `${prefix}-${field}`;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={field} type={field === "email" ? "email" : "password"}
        autoComplete={autoComplete} required minLength={minLength}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
    </div>
  );
}
