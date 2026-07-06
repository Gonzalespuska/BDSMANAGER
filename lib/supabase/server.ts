import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase client pre Server Components / Route Handlers / Server Actions.
 * Číta auth state z httpOnly cookies (cez Next.js cookies() helper).
 *
 * RLS pravidlá platia (toto NIE JE service role) — vidí len to čo prihlásený
 * user má povolené cez Supabase Auth + RLS policies.
 *
 * 🔓 DEV BYPASS:
 *   V dev móde (NODE_ENV !== "production") nemáme reálnu Supabase session
 *   (lib/auth.ts vracia mock peter usera bez auth cookie), takže RLS by
 *   filtroval všetko preč. Vrátime admin client (service role) ktorý RLS
 *   obchádza. App-level filter (assigned_to = peter.id) musí spraviť page.
 */
export async function createClient() {
  // Rovnaká defense-in-depth ako v getCurrentAppUser: dev bypass IBA
  // ak ALLOW_DEV_AUTH_BYPASS=1 je explicitne nastavený.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_AUTH_BYPASS === "1" &&
    process.env.SUPABASE_SECRET_KEY
  ) {
    return createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component → set() volá z RSC, čo Next 14 nepovolí.
            // Bez problémov ignorujeme — middleware sa o cookies postará.
          }
        },
      },
    },
  );
}
