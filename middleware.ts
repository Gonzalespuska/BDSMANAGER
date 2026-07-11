import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Security headers aplikované na každý response.
 *
 * Toto duplikuje `public/_headers` (Cloudflare Pages level) z dvoch dôvodov:
 *   1) DEV PARITY — `next dev` nečíta _headers, takže bez middleware by sme
 *      v dev neboli chránení a XSS bug by sa odhalil až po deployi.
 *   2) DEFENSE IN DEPTH — ak by sa appka prevliekla z Cloudflare na Vercel
 *      / vlastný self-hosted runtime, _headers prestane fungovať. Middleware
 *      ho prežije.
 *
 * Hodnoty držíme sync s public/_headers.
 */
const SUPABASE_HOST = "wzcehdynanuuzztfrqyi.supabase.co";
const APP_HOST = "https://app.najcrm.sk";
const CSP = [
  `default-src 'self'`,
  // Next.js + RSC payload potrebuje unsafe-inline pre runtime hydration scripts.
  // 'unsafe-eval' je nutné pre next/dynamic chunks loader.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https://*.supabase.co`,
  `font-src 'self' data:`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} ${APP_HOST}`,
  // blob: pre PDF preview modal (generator client — iframe s Blob URL)
  `frame-src 'self' blob:`,
  `object-src 'self' blob:`,
  `frame-ancestors 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security":
    "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": CSP,
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

/**
 * Trasy ktoré NIKDY nesmieme cachovať — obchodák/obhliadkár musí vidieť
 * čerstvé stavy hneď po zmenách (obhliadka odoslaná, CP odoslaná, badge
 * update, notifikácie). Bez explicit no-store CF Pages / browser môžu
 * držať staré snapshoty a user hlási "nič sa neupdatlo, musím F5".
 */
const NO_CACHE_PREFIXES = [
  "/agent",
  "/obhliadky",
  "/obhliadnute",
  "/realizacie",
  "/calendar",
  "/notifikacie",
  "/spravy",
  "/dm/",
  "/office",
  "/admin",
];

function applyNoCache(request: NextRequest, response: NextResponse): void {
  const path = request.nextUrl.pathname;
  const isDynamic = NO_CACHE_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p),
  );
  if (!isDynamic) return;
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  // CDN úrovne — Cloudflare rešpektuje CDN-Cache-Control
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
}

/**
 * Next.js middleware — beží pri každom matchnutom requeste pred renderom.
 *  1. Volá Supabase session refresh helper (čerstvé tokeny).
 *  2. Pridá security headers na výsledný response.
 *  3. Aplikuje no-store na dynamické stránky.
 */
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  applySecurityHeaders(response);
  applyNoCache(request, response);
  return response;
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
