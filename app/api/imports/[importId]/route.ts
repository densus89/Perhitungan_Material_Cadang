import { assetImportRead } from "../../../../src/server/import/http";
import { loadAssetImport } from "../../../../src/server/import/service";
import { importReviewQuerySchema } from "../../../../src/domain/asset-import/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params;
  const query = new URL(request.url).searchParams;
  const raw = query.get("offset") ?? "0", offset = Number(raw);
  const options = importReviewQuerySchema.safeParse({ offset, filter: query.get("filter") ?? "ALL", ...Object.fromEntries(["issue", "source", "condition", "search"].flatMap(key => query.has(key) ? [[key, query.get(key)]] : [])) });
  if (!options.success || !/^\d+$/.test(raw)) return Response.json({ code: "INVALID_INPUT" }, { status: 422, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  return assetImportRead(importId, (actor, id, deps) => loadAssetImport(actor, id, deps, options.data));
}
