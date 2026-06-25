import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Helper pre Next.js middleware:
 *   1. Refreshne Supabase session cookies pri každom requeste (aby tokeny
 *      nikdy neexpirovali pod prihlaseným userom)
 *   2. Auth wall — chránené routy (/admin, /agent) bez session → /login
 *
 * Role-based redirect (admin vs agent dashboard) NEROBÍME tu, lebo by
 * to znamenalo DB query (public.users) v middleware na každý request.
 * Namiesto toho rolu kontroluje `/admin/layout.tsx` cez `getCurrentAppUser()`
 * a redirectne na /agent ak rola nie je admin.
 */
const PROTECTED_PREFIXES = ["/admin", "/agent"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // 🔓 DEV BYPASS: žiadny auth wall, /admin a /agent dostupné bez prihlásenia.
  // getCurrentAppUser v dev vždy vráti bootstrap admina, takže layouts fungujú.
  if (process.env.NODE_ENV !== "production") {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Force-refresh auth token — DÔLEŽITÉ aby session nikdy neexpirovala
  // počas používania.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  // Auth wall — bez session na chránenú routu → /login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", path);
    return NextResponse.redirect(url);
  }

  return response;
}
