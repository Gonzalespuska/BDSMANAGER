import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client pre Server Components / Route Handlers / Server Actions.
 * Číta auth state z httpOnly cookies (cez Next.js cookies() helper).
 *
 * RLS pravidlá platia (toto NIE JE service role) — vidí len to čo prihlásený
 * user má povolené cez Supabase Auth + RLS policies.
 *
 * Použitie:
 *   const supabase = await createClient();
 *   const { data: leads } = await supabase.from("leads").select();
 */
export async function createClient() {
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
