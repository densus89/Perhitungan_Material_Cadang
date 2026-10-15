import { importIdSchema } from "../../../../../src/domain/asset-import/schemas";
import { assetImportMutation } from "../../../../../src/server/import/http";
import { completeSourceUpload } from "../../../../../src/server/import/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) { const { importId } = await context.params; return assetImportMutation(request, importIdSchema, completeSourceUpload, { importId }); }
