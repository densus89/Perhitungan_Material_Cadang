import { redirect } from "next/navigation";
import { AssetVersionReview } from "../../../src/features/import/AssetVersionReview";
import { createServerSupabaseClient } from "../../../src/lib/supabase/server";
import { ActorAccessError, requireActor } from "../../../src/server/auth/actor";
export const dynamic = "force-dynamic";
export default async function ReviewSnapshotPage() {
  const client = await createServerSupabaseClient(); let actor;
  try { actor = await requireActor(client); } catch (error) { if (error instanceof ActorAccessError && error.status === 401) redirect("/login/"); return <p role="alert">Akses tinjauan tidak tersedia. Hubungi admin DIV RST.</p>; }
  if (actor.status !== "ACTIVE" || !["RST_ADMIN", "RST_REVIEWER"].includes(actor.role)) return <p role="alert">Akses DIV RST diperlukan untuk meninjau snapshot.</p>;
  const { data, error } = await client.from("unit_induk").select("id,name").order("name").limit(500);
  if (error || !data) return <p role="alert">Daftar unit tidak dapat dimuat. Muat ulang halaman.</p>;
  return <AssetVersionReview actor={actor} units={data} />;
}
