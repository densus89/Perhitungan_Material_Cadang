import { z } from "zod";

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type ServerEnv = PublicEnv & {
  supabaseSecretKey: string;
  siteUrl: string;
};

const requiredString = z.string().trim().min(1);
const requiredUrl = requiredString.pipe(z.url());

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requiredString,
});

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: requiredString,
  NEXT_PUBLIC_SITE_URL: requiredUrl,
});

function parseEnv<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Missing or invalid environment variables: ${variables.join(", ")}`);
  }
  return result.data;
}

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const env = parseEnv(publicSchema, input);
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const env = parseEnv(serverSchema, input);
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY,
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
  };
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
