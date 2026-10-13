import { AuthPage } from "../../src/features/auth/AuthPage";
import { LoginForm } from "../../src/features/auth/LoginForm";
import { loginAction } from "../auth/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <AuthPage title="Masuk ke akun PLN" description="Gunakan akun email PLN yang telah diundang oleh admin DIV RST.">
      {params.error === "invalid-link" && <p role="alert" className="page-description">Tautan tidak valid atau telah kedaluwarsa. Minta tautan baru atau gunakan pemulihan kata sandi.</p>}
      {params.error === "activation-failed" && <p role="alert" className="page-description">Kata sandi telah disimpan, tetapi akses belum dapat diaktifkan. Hubungi admin DIV RST sebelum mencoba masuk kembali.</p>}
      <LoginForm action={loginAction} />
    </AuthPage>
  );
}
