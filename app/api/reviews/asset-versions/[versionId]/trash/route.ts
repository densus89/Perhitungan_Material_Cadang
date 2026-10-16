import { reviewMutation } from "../../../../../../src/server/review/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) { return reviewMutation(request, (await params).versionId, "TRASH"); }
