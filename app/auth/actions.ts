"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../src/lib/supabase/server";
import {
  completeInvite, credentialFailure, logoutFailure, requestPasswordReset, resetResponse,
  setupFailure, signIn, signOut, validateEmail, validatePasswords, validateSignIn,
} from "../../src/server/auth/service";
import type { AuthFormAction, AuthFormState } from "../../src/features/auth/types";

function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export async function loginAction(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  const input = { email: text(data, "email"), password: text(data, "password") };
  const invalid = validateSignIn(input);
  if (invalid) return invalid;
  let result: AuthFormState;
  try {
    result = await signIn(input, await createServerSupabaseClient());
  } catch {
    return credentialFailure;
  }
  if (result.status === "success") redirect("/");
  return result;
}

export async function resetPasswordAction(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  const email = text(data, "email");
  const invalid = validateEmail(email);
  if (invalid) return invalid;
  try {
    // Recovery needs no privileged key. The trusted deployment origin is never
    // accepted from the form, request Host, or forwarding headers.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) return resetResponse;
    const origin = new URL(siteUrl);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return resetResponse;
    return await requestPasswordReset({ email, siteUrl: origin.origin }, await createServerSupabaseClient());
  } catch {
    return resetResponse;
  }
}

export async function setPasswordAction(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  const input = { password: text(data, "password"), confirmPassword: text(data, "confirmPassword") };
  const invalid = validatePasswords(input);
  if (invalid) return invalid;
  let result: AuthFormState;
  try {
    result = await completeInvite(input, await createServerSupabaseClient());
  } catch {
    return setupFailure;
  }
  if (result.code === "ACTIVATION_FAILED") redirect("/login/?error=activation-failed");
  if (result.status === "success") redirect("/");
  return result;
}

export const logoutAction: AuthFormAction = async () => {
  let result: AuthFormState;
  try {
    result = await signOut(await createServerSupabaseClient());
  } catch {
    return logoutFailure;
  }
  if (result.status === "success") redirect("/login/");
  return result;
};
