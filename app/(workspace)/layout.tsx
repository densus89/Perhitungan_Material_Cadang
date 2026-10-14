import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../src/lib/supabase/server";
import { ActorAccessError, requireActor } from "../../src/server/auth/actor";
import { AuthenticatedWorkspace } from "../../src/features/auth/AuthenticatedWorkspace";
import { LogoutButton } from "../../src/features/auth/LogoutButton";
import { logoutAction } from "../auth/actions";

export const dynamic = "force-dynamic";

function AccessUnavailable() {
  return <main className="workspace-main"><p role="alert">Akses aplikasi tidak tersedia. Hubungi admin DIV RST.</p><LogoutButton action={logoutAction} /></main>;
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const client = await createServerSupabaseClient();
  let actor;
  try {
    actor = await requireActor(client);
  } catch (error) {
    if (error instanceof ActorAccessError) {
      if (error.status === 401) redirect("/login/");
      if (error.code === "MFA_REQUIRED") redirect("/auth/mfa/");
      return <AccessUnavailable />;
    }
    throw error;
  }

  let units: { id: string; name: string }[] = [];
  if (actor.unitIndukIds.length) {
    const { data, error } = await client.from("unit_induk").select("id,name").in("id", [...actor.unitIndukIds]);
    if (error || !data || actor.unitIndukIds.some((id) => !data.some((unit) => unit.id === id))) return <AccessUnavailable />;
    // Resolve labels with the same RLS session and retain assignment order.
    units = actor.unitIndukIds.map((id) => data.find((unit) => unit.id === id)!);
  }
  return <AuthenticatedWorkspace actor={actor} units={units}>{children}</AuthenticatedWorkspace>;
}
