import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js middleware — beží pri každom matchnutom requeste pred renderom.
 * Volá Supabase session refresh helper aby tokeny vždy boli čerstvé.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match všetkých requestov OKREM:
     * - _next/static (assets)
     * - _next/image (image optimization)
     * - favicon.ico
     * - obrázky (svg|png|jpg|jpeg|gif|webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
