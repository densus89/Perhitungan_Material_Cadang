import { assetImportRead } from "../../../../src/server/import/http";
import { loadAssetImport } from "../../../../src/server/import/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) { const { importId } = await context.params; return assetImportRead(importId, loadAssetImport); }
