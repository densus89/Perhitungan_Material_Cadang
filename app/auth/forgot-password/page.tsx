import { AuthPage } from "../../../src/features/auth/AuthPage";
import { ForgotPasswordForm } from "../../../src/features/auth/ForgotPasswordForm";
import { resetPasswordAction } from "../actions";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthPage title="Pulihkan kata sandi" description="Masukkan email PLN untuk meminta tautan pemulihan kata sandi.">
      <ForgotPasswordForm action={resetPasswordAction} />
    </AuthPage>
  );
}
