import type { NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/update-session";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next(?:/|$)|favicon\\.ico(?:/|$)|auth/callback(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|txt|xml|webmanifest|pdf)$).*)",
  ],
};
