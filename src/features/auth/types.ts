export type AuthField = "email" | "password" | "confirmPassword";

/** Only safe presentation data crosses the Server Action boundary. */
export interface AuthFormState {
  status: "idle" | "error" | "success";
  code?: "ACTIVATION_FAILED";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
}

export type AuthFormAction = (previous: AuthFormState, data: FormData) => Promise<AuthFormState>;

export const initialAuthState: AuthFormState = { status: "idle" };
