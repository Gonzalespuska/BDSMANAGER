import { createClient } from "@/lib/supabase/server";

export type AppUserRole = "admin" | "user";

export interface AppUser {
  id: string;
  auth_id: string | null;
  email: string;
  name: string;
  role: AppUserRole;
  active: boolean;
}

/**
 * Vráti aktuálne prihláseného usera kombinujúc Supabase Auth + naše `public.users`.
 *
 * Tieto musia byť oba:
 *   1. Auth session existuje (user sa prihlásil)
 *   2. V `public.users` má riadok s prepojeným auth_id
 *   3. active = true
 *
 * Ak čokoľvek chýba → vracia null (volajúci by mal redirect na /login).
 *
 * RLS auto-filtruje `users` na riadky kde `auth_id = auth.uid()` (cez policy
 * `users_select`), takže `.maybeSingle()` vráti len jeho riadok.
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: appUser, error } = await supabase
    .from("users")
    .select("id, auth_id, email, name, role, active")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentAppUser] lookup failed:", error.message);
    return null;
  }

  if (!appUser || !appUser.active) return null;

  return appUser as AppUser;
}

/**
 * Vráti správny dashboard URL pre rolu.
 * Používa sa po prihlásení a v middleware redirectoch.
 */
export function dashboardPathForRole(role: AppUserRole): string {
  return role === "admin" ? "/admin" : "/agent";
}
