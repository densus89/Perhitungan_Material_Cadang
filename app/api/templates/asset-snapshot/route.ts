import { createServerSupabaseClient } from "../../../../src/lib/supabase/server";
import { buildAssetTemplate } from "../../../../src/lib/spreadsheet/build-asset-template";
import { ActorAccessError, requireActor } from "../../../../src/server/auth/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  try {
    await requireActor(await createServerSupabaseClient());
    const bytes = await buildAssetTemplate();
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="template-snapshot-aset.xlsx"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ActorAccessError) {
      return Response.json({ code: error.code, message: "Sesi atau akses tidak valid." }, { status: error.status, headers: privateHeaders });
    }
    return Response.json({ code: "TEMPLATE_FAILED", message: "Template tidak dapat dibuat. Coba lagi nanti." }, { status: 500, headers: privateHeaders });
  }
}
