import { reviewRead } from "../../../../../src/server/review/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) { return reviewRead(request, (await params).versionId); }
