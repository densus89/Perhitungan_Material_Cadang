import "server-only";
import { isAllowedPlnEmail, normalizePlnEmail } from "../../domain/access";
import type { AuthFormState } from "../../features/auth/types";

type Outcome = { error: unknown | null };

/** The request-scoped Supabase client implements this injectable boundary. */
export interface AuthGateway {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<Outcome>;
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<Outcome>;
    getUser(): Promise<Outcome & { data: { user: { email?: string } | null } }>;
    updateUser(input: { password: string }): Promise<Outcome>;
    signOut(options: { scope: "local" }): Promise<Outcome>;
  };
  rpc(name: "activate_my_profile"): PromiseLike<Outcome>;
}

export const credentialFailure: AuthFormState = {
  status: "error",
  message: "Email atau kata sandi tidak valid. Silakan coba lagi.",
};
export const resetResponse: AuthFormState = {
  status: "success",
  message: "Jika akun memenuhi syarat, tautan pemulihan akan dikirim ke email PLN tersebut.",
};
export const setupFailure: AuthFormState = {
  status: "error", message: "Tidak dapat menyimpan kata sandi. Gunakan tautan yang masih berlaku atau coba lagi.",
};
export const logoutFailure: AuthFormState = {
  status: "error", message: "Tidak dapat keluar. Silakan coba lagi.",
};

export function validateEmail(email: string): AuthFormState | null {
  return isAllowedPlnEmail(email) ? null : {
    status: "error", fieldErrors: { email: "Gunakan email dengan domain @pln.co.id." },
  };
}

export function validateSignIn(input: { email: string; password: string }): AuthFormState | null {
  return validateEmail(input.email) ?? (input.password.length ? null : {
    status: "error", fieldErrors: { password: "Masukkan kata sandi." },
  });
}

export function validatePasswords(input: { password: string; confirmPassword: string }): AuthFormState | null {
  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (input.password.length < 12) fieldErrors.password = "Kata sandi minimal 12 karakter.";
  if (input.confirmPassword !== input.password) fieldErrors.confirmPassword = "Konfirmasi kata sandi harus sama.";
  return Object.keys(fieldErrors).length ? { status: "error", fieldErrors } : null;
}

export async function signIn(input: { email: string; password: string }, gateway: AuthGateway): Promise<AuthFormState> {
  const invalid = validateSignIn(input);
  if (invalid) return invalid;
  try {
    const { error } = await gateway.auth.signInWithPassword({ email: normalizePlnEmail(input.email), password: input.password });
    return error ? credentialFailure : { status: "success" };
  } catch {
    return credentialFailure;
  }
}

export async function requestPasswordReset(input: { email: string; siteUrl: string }, gateway: AuthGateway): Promise<AuthFormState> {
  const invalid = validateEmail(input.email);
  if (invalid) return invalid;
  try {
    await gateway.auth.resetPasswordForEmail(normalizePlnEmail(input.email), {
      redirectTo: `${input.siteUrl}/auth/callback?next=/auth/set-password`,
    });
  } catch {
    // A delivery/provider failure must not disclose whether an account exists.
  }
  return resetResponse;
}

export async function hasPasswordSetupSession(gateway: Pick<AuthGateway, "auth">): Promise<boolean> {
  try {
    const { data, error } = await gateway.auth.getUser();
    return !error && !!data.user?.email && isAllowedPlnEmail(data.user.email);
  } catch {
    return false;
  }
}

export async function completeInvite(input: { password: string; confirmPassword: string }, gateway: AuthGateway): Promise<AuthFormState> {
  const invalid = validatePasswords(input);
  if (invalid) return invalid;
  if (!await hasPasswordSetupSession(gateway)) return setupFailure;

  try {
    const { error } = await gateway.auth.updateUser({ password: input.password });
    if (error) return setupFailure;
  } catch {
    return setupFailure;
  }

  try {
    const { error } = await gateway.rpc("activate_my_profile");
    if (!error) return { status: "success" };
  } catch {
    // Auth password changes cannot be rolled back with the previous password.
  }
  await signOut(gateway);
  return {
    status: "error",
    code: "ACTIVATION_FAILED",
    message: "Kata sandi telah disimpan, tetapi akses belum dapat diaktifkan. Hubungi admin DIV RST sebelum mencoba masuk kembali.",
  };
}

export async function signOut(gateway: AuthGateway): Promise<AuthFormState> {
  try {
    const { error } = await gateway.auth.signOut({ scope: "local" });
    return error ? logoutFailure : { status: "success" };
  } catch {
    return logoutFailure;
  }
}
