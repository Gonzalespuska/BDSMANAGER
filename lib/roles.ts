/**
 * Roles — pure data & types (žiadne server imports!).
 *
 * Tento súbor je bezpečné importnúť aj z client komponentov.
 * `lib/auth.ts` re-exportuje tieto symboly pre server-side použitie.
 *
 * Vzhľadom k tomu, že `lib/auth.ts` importuje `next/headers` (cez supabase
 * server client), nemôže byť importnutý z client komponentov. Preto všetky
 * UI-related konštanty (labely, farby, ikony) žijú TU.
 */

export type AppUserRole = "admin" | "obchod" | "obhliadky" | "realizacie";

/** Labely rolí pre UI — Slovak labels. */
export const ROLE_LABELS: Record<AppUserRole, string> = {
  admin: "Admin",
  obchod: "Obchod",
  obhliadky: "Obhliadky",
  realizacie: "Realizácie",
};

/** Tailwind farby pre role badge — pastel pozadie + tmavý text. */
export const ROLE_BADGE_CLASSES: Record<AppUserRole, string> = {
  admin: "bg-amber-100 text-amber-800 border-amber-200",
  obchod: "bg-sky-100 text-sky-800 border-sky-200",
  obhliadky: "bg-violet-100 text-violet-800 border-violet-200",
  realizacie: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

/** Lucide ikona pre rolu (názov, importnúť cez @/components dynamicky). */
export const ROLE_ICON_NAME: Record<AppUserRole, string> = {
  admin: "ShieldCheck",
  obchod: "Phone",
  obhliadky: "ClipboardList",
  realizacie: "Hammer",
};

/** Allowed roles array pre runtime validáciu (server actions, dev routes). */
export const ALLOWED_ROLES: readonly AppUserRole[] = [
  "admin",
  "obchod",
  "obhliadky",
  "realizacie",
];

/**
 * Vráti správny dashboard URL pre rolu.
 *   - admin → /admin
 *   - obchod / obhliadky / realizacie → /agent (zdielaný dashboard
 *     s leadmi; obhliadky/realizacie nemajú vlastné view zatiaľ)
 */
export function dashboardPathForRole(role: AppUserRole): string {
  return role === "admin" ? "/admin" : "/agent";
}
