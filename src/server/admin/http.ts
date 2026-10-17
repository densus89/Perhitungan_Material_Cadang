import "server-only";
import type { z } from "zod";
import { getServerEnv } from "../../config/env";
import type { Actor } from "../../domain/access";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { ActorAccessError, requireActor } from "../auth/actor";
import { createUserAdminDependencies, type AdminResult, type UserAdminDependencies } from "./user-service";
import { hasTrustedMutationOrigin } from "../http/mutation-origin";

function json(body: { code: string; message: string }, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
export async function adminMutation<T>(request: Request, schema: z.ZodType<T>, mutation: (actor: Actor, input: T, deps: UserAdminDependencies) => Promise<AdminResult>, extra?: { userId: string }) {
  try {
    const actor = await requireActor(await createServerSupabaseClient());
    if (actor.role !== "RST_ADMIN") return json({ code: "FORBIDDEN", message: "Akses administrasi DIV RST diperlukan." }, 403);
    const env = getServerEnv();
    if (!hasTrustedMutationOrigin(request)) return json({ code: "FORBIDDEN", message: "Asal permintaan tidak valid." }, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ code: "INVALID_INPUT", message: "Gunakan permintaan JSON yang valid." }, 422);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ code: "INVALID_INPUT", message: "Gunakan permintaan JSON yang valid." }, 422); }
    if (extra) {
      if (!body || typeof body !== "object" || Array.isArray(body) || "userId" in body) return json({ code: "INVALID_INPUT", message: "Data akses tidak valid." }, 422);
      body = { ...body, userId: extra.userId };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return json({ code: "INVALID_INPUT", message: "Periksa email, role, status, dan Unit Induk." }, 422);
    const result = await mutation(actor, parsed.data, createUserAdminDependencies(createAdminSupabaseClient(), env.siteUrl));
    return json({ code: result.code, message: result.message }, result.status);
  } catch (error) {
    if (error instanceof ActorAccessError) return json({ code: error.code, message: "Sesi atau akses tidak valid." }, error.status);
    return json({ code: "ADMIN_FAILED", message: "Tidak dapat menyimpan akses. Hubungi admin DIV RST." }, 500);
  }
}
