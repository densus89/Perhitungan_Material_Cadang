import { importIdSchema } from "../../../../../src/domain/asset-import/schemas";
import { assetImportMutation } from "../../../../../src/server/import/http";
import { processStoredWorkbook } from "../../../../../src/server/import/process-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) { const { importId } = await context.params; return assetImportMutation(request, importIdSchema, (actor, input, deps) => processStoredWorkbook(actor, input.importId, deps), { importId }); }
