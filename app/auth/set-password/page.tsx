import { redirect } from "next/navigation";
import { AuthPage } from "../../../src/features/auth/AuthPage";
import { SetPasswordForm } from "../../../src/features/auth/SetPasswordForm";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";
import { hasPasswordSetupSession } from "../../../src/server/auth/service";
import { setPasswordAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  let validSession = false;
  try {
    validSession = await hasPasswordSetupSession(await createServerSupabaseClient());
  } catch {
    // A stale or unverified session never exposes the password setup form.
  }
  if (!validSession) redirect("/login/?error=invalid-link");
  return (
    <AuthPage title="Atur kata sandi" description="Buat kata sandi untuk menyelesaikan undangan atau pemulihan akun PLN Anda.">
      <SetPasswordForm action={setPasswordAction} />
    </AuthPage>
  );
}
