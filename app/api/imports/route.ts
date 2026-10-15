import { createImportSchema } from "../../../src/domain/asset-import/schemas";
import { assetImportMutation } from "../../../src/server/import/http";
import { createAssetImport } from "../../../src/server/import/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return assetImportMutation(request, createImportSchema, createAssetImport); }
