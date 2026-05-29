import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client — používa SUPABASE_SECRET_KEY.
 *
 * ⚠️ TENTO KLIENT OBÍDE VŠETKY RLS POLICIES — má full access ku DB.
 * ⚠️ NIKDY ho neimportuj v 'use client' komponente.
 * ⚠️ NIKDY ho neexponuj cez Route Handler bez kontroly oprávnení (musíš sám
 *    overiť že volajúci user je admin, lebo RLS ťa už neochráni).
 *
 * Použitie len v server-side kontextoch:
 *   - Webhooks (lead intake — nie je prihlásený user)
 *   - Admin operácie (vytvorenie usera s nastavenou rolou)
 *   - Seed scripty
 *
 * V Route Handleri vždy najprv over identitu cez `createClient()` (RLS-aware),
 * a až potom použí admin klienta na privileged operáciu.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY",
    );
  }

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
