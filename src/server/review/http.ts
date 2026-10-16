import "server-only";
import { z } from "zod";
import { ActorAccessError, requireActor } from "../auth/actor";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { importReviewQuerySchema } from "../../domain/asset-import/schemas";
import { reviewActionSchema, reviewFiltersSchema } from "../../features/import/review-contracts";
import { assertReviewer, createReviewDependencies, listPendingAssetVersions, loadAssetVersionReview, approveAndActivateAssetVersion, returnAssetVersion, trashAssetVersion, ReviewError } from "./asset-version-service";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
function failure(error: unknown) { const known = error instanceof ActorAccessError || error instanceof ReviewError; return json({ code: known ? error.code : "REVIEW_FAILED", message: "Tinjauan tidak dapat diproses. Muat ulang untuk memeriksa status terbaru." }, known ? error.status : 500); }
async function context() { const actor = await requireActor(await createServerSupabaseClient()); assertReviewer(actor); return actor; }
export async function reviewRead(request: Request, versionId?: string) {
  try {
    const actor = await context(); const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = (versionId ? importReviewQuerySchema : reviewFiltersSchema).safeParse(versionId ? { offset: Number(params.offset ?? 0), filter: "ALL", ...params, ...(params.offset !== undefined ? { offset: Number(params.offset) } : {}) } : params);
    if (!parsed.success || versionId !== undefined && !z.uuid().safeParse(versionId).success) throw new ReviewError("INVALID_INPUT", 422);
    const deps = createReviewDependencies(createAdminSupabaseClient());
    return json(versionId ? await loadAssetVersionReview(actor, versionId, deps, importReviewQuerySchema.parse(parsed.data)) : await listPendingAssetVersions(actor, parsed.data, deps));
  } catch (error) { return failure(error); }
}
export async function reviewMutation(request: Request, versionId: string, action: "RETURN" | "APPROVE" | "TRASH") {
  try {
    const actor = await context(); if (action === "TRASH" && actor.role !== "RST_ADMIN") throw new ReviewError("FORBIDDEN", 403);
    const site = z.url().parse(process.env.NEXT_PUBLIC_SITE_URL);
    if (request.headers.get("origin") !== new URL(site).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new ReviewError("FORBIDDEN", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ReviewError("INVALID_INPUT", 422);
    const raw = await request.text(); if (raw.length > 32768) throw new ReviewError("INVALID_INPUT", 422);
    let body: unknown; try { body = JSON.parse(raw); } catch { throw new ReviewError("INVALID_INPUT", 422); }
    if (!body || typeof body !== "object" || Array.isArray(body) || "versionId" in body) throw new ReviewError("INVALID_INPUT", 422);
    const parsed = reviewActionSchema.safeParse({ ...body, versionId }); if (!parsed.success) throw new ReviewError("INVALID_INPUT", 422);
    const operation = action === "RETURN" ? returnAssetVersion : action === "TRASH" ? trashAssetVersion : approveAndActivateAssetVersion;
    return json(await operation(actor, parsed.data, createReviewDependencies(createAdminSupabaseClient())));
  } catch (error) { return failure(error); }
}
