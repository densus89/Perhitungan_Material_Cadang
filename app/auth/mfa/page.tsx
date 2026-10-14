import { redirect } from "next/navigation";
import { AuthPage } from "../../../src/features/auth/AuthPage";
import { MfaSetup } from "../../../src/features/auth/MfaSetup";
import { isAllowedPlnEmail } from "../../../src/domain/access";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  let allowed = false;
  try {
    const { data, error } = await (await createServerSupabaseClient()).auth.getUser();
    allowed = !error && !!data.user?.email && isAllowedPlnEmail(data.user.email);
  } catch {}
  if (!allowed) redirect("/login/");
  return <AuthPage title="Keamanan akun" description="Hubungkan aplikasi autentikator untuk melindungi akses Admin DIV RST."><MfaSetup /></AuthPage>;
}
