import "server-only";
import { z } from "zod";
import type { Actor } from "../../domain/access";
import { importIdSchema, importResponseSchema } from "../../domain/asset-import/schemas";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { requireActor, ActorAccessError } from "../auth/actor";
import { createImportDependencies, type ImportDependencies } from "./dependencies";
import { ImportError } from "./service";
import { hasTrustedMutationOrigin } from "../http/mutation-origin";

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } }); }
function denied(code: string, status: number) { return json({ code, message: "Permintaan impor tidak dapat diproses." }, status); }
function failure(error: unknown) {
  if (error instanceof ActorAccessError) return denied(error.code, error.status);
  if (error instanceof ImportError) return denied(error.code, error.status);
  return denied("IMPORT_FAILED", 500);
}
async function actorContext() {
  const session = await createServerSupabaseClient(); const actor = await requireActor(session);
  if (actor.role !== "UNIT_OPERATOR" || actor.status !== "ACTIVE") throw new ActorAccessError("FORBIDDEN");
  return { session, actor };
}
async function scopeImport(context: Awaited<ReturnType<typeof actorContext>>, importId: string) {
  // RLS read and explicit assignment are both checked before constructing a service client.
  const { data, error } = await context.session.from("import_sessions").select("unit_induk_id").eq("id", importId).maybeSingle();
  if (error || !data || !context.actor.unitIndukIds.includes(data.unit_induk_id)) throw new ImportError("NOT_FOUND", 404);
}
export async function assetImportMutation<T>(request: Request, schema: z.ZodType<T>, handler: (actor: Actor, input: T, deps: ImportDependencies) => Promise<unknown>, extra?: { importId: string }) {
  try {
    const context = await actorContext();
    if (!hasTrustedMutationOrigin(request)) return denied("FORBIDDEN", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return denied("INVALID_INPUT", 422);
    // Mapping payloads are small; browser preview/raw workbook rows are never accepted.
    const raw = await request.text(); if (raw.length > 2 * 1024 * 1024) return denied("INVALID_INPUT", 422);
    let body: unknown; try { body = JSON.parse(raw); } catch { return denied("INVALID_INPUT", 422); }
    if (extra) {
      if (!body || typeof body !== "object" || Array.isArray(body) || "importId" in body) return denied("INVALID_INPUT", 422);
      body = { ...body, importId: extra.importId };
    }
    const parsed = schema.safeParse(body); if (!parsed.success) return denied("INVALID_INPUT", 422);
    if (extra) await scopeImport(context, extra.importId);
    else {
      const unitId = z.object({ unitId: z.uuid() }).parse(parsed.data).unitId;
      if (!context.actor.unitIndukIds.includes(unitId)) return denied("FORBIDDEN", 403);
    }
    const result = await handler(context.actor, parsed.data, createImportDependencies(createAdminSupabaseClient()));
    return json(importResponseSchema.parse(result));
  } catch (error) { return failure(error); }
}
export async function assetImportRead(importId: string, handler: (actor: Actor, importId: string, deps: ImportDependencies) => Promise<unknown>) {
  try {
    const context = await actorContext();
    if (!importIdSchema.safeParse({ importId }).success) return denied("INVALID_INPUT", 422);
    await scopeImport(context, importId);
    return json(importResponseSchema.parse(await handler(context.actor, importId, createImportDependencies(createAdminSupabaseClient()))));
  } catch (error) { return failure(error); }
}
