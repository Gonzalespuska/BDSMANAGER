import { NextResponse } from "next/server";

/**
 * assertDevOnly — dvojvrstvová ochrana pre /api/dev/* endpoints.
 *
 * Blokuje vždy keď:
 *   1) NODE_ENV === "production", ALEBO
 *   2) DEV_ACCESS_TOKEN je v env nastavený, ale header
 *      x-dev-access-token sa nezhoduje (alebo chýba).
 *
 * Použitie v handleri:
 *   const blocked = assertDevOnly(request);
 *   if (blocked) return blocked;
 *
 * Deploy → nastav v Cloudflare Pages env:
 *   DEV_ACCESS_TOKEN=<náhodný long string>
 * A ak by NODE_ENV misconfig (build glitch) prešla, tento token by ťa chránil.
 */
export function assertDevOnly(request: Request): NextResponse | null {
  // Vrstva 1: NODE_ENV
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled in production", { status: 403 });
  }

  // Vrstva 2: ak je DEV_ACCESS_TOKEN nastavený, vyžaduj header match
  const requiredToken = process.env.DEV_ACCESS_TOKEN?.trim();
  if (requiredToken) {
    const provided = request.headers.get("x-dev-access-token")?.trim();
    // Konštantný-časový compare (chráni pred timing útokom)
    if (!provided || !safeEqual(provided, requiredToken)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
