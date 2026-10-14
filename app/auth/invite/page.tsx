import { AuthPage } from "../../../src/features/auth/AuthPage";
import { InviteBridge } from "../../../src/features/auth/InviteBridge";

export const dynamic = "force-dynamic";

export default function InvitePage() {
  return <AuthPage title="Terima undangan" description="Memverifikasi undangan akses akun PLN Anda."><InviteBridge /></AuthPage>;
}
