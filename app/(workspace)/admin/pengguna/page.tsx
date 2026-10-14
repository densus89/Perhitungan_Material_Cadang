import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../src/lib/supabase/server";
import { ActorAccessError, requireActor } from "../../../../src/server/auth/actor";
import { loadManagedUsers } from "../../../../src/server/admin/user-service";
import { UserManagement } from "../../../../src/features/admin/UserManagement";

export const dynamic = "force-dynamic";
export default async function UsersPage() {
  const client = await createServerSupabaseClient();
  let actor;
  try { actor = await requireActor(client); } catch (error) {
    if (error instanceof ActorAccessError && error.status === 401) redirect("/login/");
    return <p role="alert">Akses aplikasi tidak tersedia. Hubungi admin DIV RST.</p>;
  }
  if (actor.role !== "RST_ADMIN") return <p role="alert">Akses administrasi DIV RST diperlukan.</p>;
  let data;
  try {
    // RLS authorizes these request-scoped reads; no privileged client is needed.
    data = await loadManagedUsers(client);
  } catch {
    return <p role="alert">Daftar pengguna tidak dapat dimuat. Silakan coba lagi.</p>;
  }
  return <UserManagement role={actor.role} currentUserId={actor.userId} {...data} />;
}
