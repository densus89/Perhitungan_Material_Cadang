import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../src/lib/supabase/server";
import { ActorAccessError, requireActor } from "../src/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    await requireActor(await createServerSupabaseClient());
    redirect("/ringkasan/");
  } catch (error) {
    if (error instanceof ActorAccessError && error.code === "MFA_REQUIRED") redirect("/auth/mfa/");
    if (error instanceof ActorAccessError) redirect("/login/");
    throw error;
  }
}
