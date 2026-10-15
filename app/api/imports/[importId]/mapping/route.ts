import { saveMappingSchema } from "../../../../../src/domain/asset-import/schemas";
import { assetImportMutation } from "../../../../../src/server/import/http";
import { saveImportMapping } from "../../../../../src/server/import/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) { const { importId } = await context.params; return assetImportMutation(request, saveMappingSchema, saveImportMapping, { importId }); }
