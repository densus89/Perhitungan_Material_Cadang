import { ImportWorkspace } from "../../../src/features/import/ImportWorkspace";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";
import { ActorAccessError, requireActor } from "../../../src/server/auth/actor";
import { loadImportDrafts } from "../../../src/server/import/workspace";

export const dynamic = "force-dynamic";
export default async function ImportPage() {
  const client = await createServerSupabaseClient();
  let actor;
  try { actor = await requireActor(client); } catch (error) {
    if (error instanceof ActorAccessError && error.status === 401) redirect("/login/");
    return <p role="alert">Akses impor tidak tersedia. Hubungi admin DIV RST.</p>;
  }
  if (actor.role !== "UNIT_OPERATOR") return <p role="alert">Akses Operator Unit diperlukan untuk impor snapshot.</p>;
  let units, drafts;
  try {
    const { data, error } = await client.from("unit_induk").select("id,name").in("id", [...actor.unitIndukIds]);
    if (error || !data || actor.unitIndukIds.some(id => !data.some(unit => unit.id === id))) throw new Error("Unit unavailable");
    units = actor.unitIndukIds.map(id => data.find(unit => unit.id === id)!);
    drafts = await loadImportDrafts(client, actor);
  } catch { return <p role="alert">Draft impor tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi.</p>; }
  return <ImportWorkspace actorUnits={units} initialDrafts={drafts} />;
}
