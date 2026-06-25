import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * Vráti aktuálne prihláseného usera.
 *
 * 🔓 DEV MÓDE (NODE_ENV !== "production"):
 *   Vždy vráti bootstrap admina z DB — auth wall vypnutý, žiadne klikanie
 *   po /login pri každom F5. Logout button v hlavičke je naďalej zobrazený
 *   ale prakticky no-op (re-auth ihneď).
 *
 * 🔒 PROD:
 *   Cez Supabase Auth + lookup do public.users + active=true check.
 */
// Module-level cache pre dev bypass — DB query iba pri prvom hite.
// Default v dev: obchodák (user) rola, aby si videl appku tak ako ju vidia oni.
// Admin chrome (Admin pill, Admin view →) sa neukazuje.
let DEV_USER_CACHE: AppUser | null = null;

export async function getCurrentAppUser(): Promise<AppUser | null> {
  // ─── DEV BYPASS — vystupuje ako obchodák ─────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    if (DEV_USER_CACHE) return DEV_USER_CACHE;
    DEV_USER_CACHE = {
      id: "dev-user",
      auth_id: null,
      email: "peter@epoxidovo.sk",
      name: "Peter (Obchodák)",
      role: "user",
      active: true,
    };
    return DEV_USER_CACHE;
  }

  // ─── PROD path ──────────────────────────────────────────────────────
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
 */
export function dashboardPathForRole(role: AppUserRole): string {
  return role === "admin" ? "/admin" : "/agent";
}
