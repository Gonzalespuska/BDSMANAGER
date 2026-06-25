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

// Throttle pre last_active_at update — neutopíme DB writes pri každom requeste.
const LAST_ACTIVE_CACHE = new Map<string, number>();
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000; // 5 min

async function touchLastActive(userId: string): Promise<void> {
  const now = Date.now();
  const prev = LAST_ACTIVE_CACHE.get(userId) ?? 0;
  if (now - prev < LAST_ACTIVE_THROTTLE_MS) return;
  LAST_ACTIVE_CACHE.set(userId, now);
  try {
    const admin = createAdminClient();
    await admin
      .from("users")
      .update({ last_active_at: new Date(now).toISOString() })
      .eq("id", userId);
  } catch (e) {
    console.warn("[touchLastActive] update failed:", e);
  }
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  // ─── DEV BYPASS — vystupuje ako obchodák ─────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    if (!DEV_USER_CACHE) {
      // Pokus o lookup reálneho peter user-a z DB (aby sme mali správny UUID
      // pre RLS / assigned_to filtre / last_active tracking).
      try {
        const admin = createAdminClient();
        const { data: peter } = await admin
          .from("users")
          .select("id, auth_id, email, name, role, active")
          .eq("email", "peter@epoxidovo.sk")
          .maybeSingle();
        if (peter && peter.active) {
          DEV_USER_CACHE = peter as AppUser;
        } else {
          DEV_USER_CACHE = {
            id: "dev-user",
            auth_id: null,
            email: "peter@epoxidovo.sk",
            name: "Peter (Obchodák)",
            role: "user",
            active: true,
          };
        }
      } catch {
        DEV_USER_CACHE = {
          id: "dev-user",
          auth_id: null,
          email: "peter@epoxidovo.sk",
          name: "Peter (Obchodák)",
          role: "user",
          active: true,
        };
      }
    }
    if (DEV_USER_CACHE.id !== "dev-user") {
      void touchLastActive(DEV_USER_CACHE.id);
    }
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

  void touchLastActive(appUser.id);
  return appUser as AppUser;
}

/**
 * Vráti správny dashboard URL pre rolu.
 */
export function dashboardPathForRole(role: AppUserRole): string {
  return role === "admin" ? "/admin" : "/agent";
}
