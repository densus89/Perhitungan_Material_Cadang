import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../src/lib/supabase/server";
import { loadActor } from "../src/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const actor = await loadActor(await createServerSupabaseClient());
  redirect(actor ? "/ringkasan/" : "/login/");
}
