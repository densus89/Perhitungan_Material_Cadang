import type { User } from "@supabase/supabase-js";

export const E2E_SYNTHETIC_MARKER = "material-cadang-e2e-v1";
export const E2E_IDENTITIES = {
  admin: {
    email: "e2e-admin.synthetic@pln.co.id",
    displayName: "Admin E2E Sintetis",
    role: "RST_ADMIN",
    unitCode: null,
  },
  operator: {
    email: "e2e-operator.synthetic@pln.co.id",
    displayName: "Operator E2E Sintetis",
    role: "UNIT_OPERATOR",
    unitCode: "UIT JBB",
  },
} as const;

export type E2EEnvironment = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  siteUrl: string;
  password: string;
};

const confirmation = "yes-delete-synthetic-users";
const safeOperationFailure = /^Synthetic E2E (user lookup|user cleanup|unit lookup|user creation|profile activation|role assignment|unit assignment|MFA factor listing|MFA factor deletion) failed$/;

export function safeE2eFailure(error: unknown, fallback: string): string {
  return error instanceof Error && safeOperationFailure.test(error.message) ? error.message : fallback;
}

function nonEmpty(input: Record<string, unknown>, name: string, invalid: string[]) {
  const value = input[name];
  if (typeof value !== "string" || !value.trim()) {
    invalid.push(name);
    return "";
  }
  return value.trim();
}

function exactOrigin(value: string, protocols: readonly string[]) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function parseE2eEnvironment(input: Record<string, unknown>): E2EEnvironment {
  const invalid: string[] = [];
  const supabaseUrl = nonEmpty(input, "NEXT_PUBLIC_SUPABASE_URL", invalid);
  const supabasePublishableKey = nonEmpty(input, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", invalid);
  const supabaseSecretKey = nonEmpty(input, "SUPABASE_SECRET_KEY", invalid);
  const siteUrl = nonEmpty(input, "NEXT_PUBLIC_SITE_URL", invalid);
  const password = nonEmpty(input, "E2E_TEST_PASSWORD", invalid);

  if (supabaseUrl) {
    let hostedDevelopmentTarget = false;
    try {
      const url = new URL(supabaseUrl);
      hostedDevelopmentTarget = exactOrigin(supabaseUrl, ["https:"])
        && /^[a-z0-9]{20}\.supabase\.co$/i.test(url.hostname);
    } catch {
      hostedDevelopmentTarget = false;
    }
    if (!hostedDevelopmentTarget) invalid.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (siteUrl && !exactOrigin(siteUrl, ["http:", "https:"])) invalid.push("NEXT_PUBLIC_SITE_URL");
  if (password && password.length < 12) invalid.push("E2E_TEST_PASSWORD");
  if (input.E2E_CONFIRM_SYNTHETIC_DEV_PROJECT !== confirmation) {
    invalid.push("E2E_CONFIRM_SYNTHETIC_DEV_PROJECT");
  }

  if (invalid.length) {
    throw new Error(`Missing or invalid E2E environment variables: ${[...new Set(invalid)].join(", ")}`);
  }
  return { supabaseUrl, supabasePublishableKey, supabaseSecretKey, siteUrl, password };
}

export function assertSyntheticE2eUser(user: Pick<User, "email" | "app_metadata">): void {
  const exactEmail = Object.values(E2E_IDENTITIES).some((identity) => identity.email === user.email);
  if (!exactEmail || user.app_metadata.e2e_marker !== E2E_SYNTHETIC_MARKER) {
    throw new Error("Refusing to manage a non-synthetic E2E user");
  }
}
