import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="auth-title">
        <p className="eyebrow">Perencanaan Material Cadang</p>
        <h1 id="auth-title">{title}</h1>
        <p className="page-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
