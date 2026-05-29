import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client pre Client Components.
 * Auth state je v browser cookies + sessionStorage, automaticky refreshovaný.
 *
 * Použitie v 'use client' komponente:
 *   const supabase = createClient();
 *   const { data } = await supabase.from("leads").select();
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
