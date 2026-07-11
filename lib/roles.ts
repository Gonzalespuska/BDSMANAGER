/**
 * Roles — pure data & types (žiadne server imports!).
 *
 * Tento súbor je bezpečné importnúť aj z client komponentov.
 * `lib/auth.ts` re-exportuje tieto symboly pre server-side použitie.
 *
 * Vzhľadom k tomu, že `lib/auth.ts` importuje `next/headers` (cez supabase
 * server client), nemôže byť importnutý z client komponentov. Preto všetky
 * UI-related konštanty (labely, farby, ikony) žijú TU.
 *
 * ⚠ ROLA `skolenie` BOLA ODSTRÁNENÁ (2026-07-10). Podklady sú teraz sekcia
 * dostupná pre všetkých: mladší agenti (< 90 dní od `users.created_at`) ju
 * vidia ako záložku „Podklady" v hlavnom menu, starší v dropdowne pod ich
 * menom (predpokladáme, že už si to prečítali). Existujúci `skolenie` users
 * boli prehodení na `obchod` cez scripts/migrate-skolenie.mjs. DB CHECK
 * constraint stále povoľuje hodnotu 'skolenie' kvôli back-compat, ale
 * v UI ju nevytvárame.
 */

export type AppUserRole =
  | "admin"
  | "obchod"
  | "obhliadky"
  | "realizacie"
  | "office";

/** Labely rolí pre UI — Slovak labels. */
export const ROLE_LABELS: Record<AppUserRole, string> = {
  admin: "Admin",
  obchod: "Obchod",
  obhliadky: "Obhliadky",
  realizacie: "Realizácie",
  office: "Office",
};

/** Tailwind farby pre role badge — pastel pozadie + tmavý text. */
export const ROLE_BADGE_CLASSES: Record<AppUserRole, string> = {
  admin: "bg-amber-100 text-amber-800 border-amber-200",
  obchod: "bg-sky-100 text-sky-800 border-sky-200",
  obhliadky: "bg-violet-100 text-violet-800 border-violet-200",
  realizacie: "bg-emerald-100 text-emerald-800 border-emerald-200",
  office: "bg-amber-100 text-amber-800 border-amber-200",
};

/** Lucide ikona pre rolu (názov, importnúť cez @/components dynamicky). */
export const ROLE_ICON_NAME: Record<AppUserRole, string> = {
  admin: "ShieldCheck",
  obchod: "Phone",
  obhliadky: "ClipboardList",
  realizacie: "Hammer",
  office: "Headphones",
};

/** Allowed roles array pre runtime validáciu (server actions, dev routes). */
export const ALLOWED_ROLES: readonly AppUserRole[] = [
  "admin",
  "obchod",
  "obhliadky",
  "realizacie",
  "office",
];

/**
 * Vráti správny dashboard URL pre rolu — každá rola má vlastný hlavný view:
 *   - admin     → /admin (správa tímu, integrácie, štatistiky)
 *   - obchod    → /agent (leady, generátor ponúk)
 *   - obhliadky → /obhliadky (priradené obhliadky, formulár s rozmermi)
 *   - realizacie → /realizacie (naplánované zákazky, materiálové výdaje)
 *   - office    → /office (kancelárska agenda)
 */
export function dashboardPathForRole(role: AppUserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "obchod":
      return "/agent";
    case "obhliadky":
      return "/obhliadky";
    case "realizacie":
      return "/realizacie";
    case "office":
      return "/office";
  }
}

/**
 * Primary nav tabs ktoré rola vidí.
 *   admin      → všetky sekcie + Admin panel + Office (má prístup do všetkého)
 *   obchod     → Leady + Kalendár + Generátor + Tím + Podklady*
 *   obhliadky  → Obhliadky + Kalendár + Tím + Podklady*
 *   realizacie → Realizácie + Kalendár + Tím + Podklady*
 *   office     → Office + Kalendár + Tím + Podklady*
 *
 * * Podklady sa zobrazuje v hlavnom menu iba pre agentov mladších ako
 *   90 dní (nováčikovský onboarding). Starší agenti ju nájdu v dropdowne
 *   pod ich menom (predpoklad: už si to prečítali).
 *
 * Skutočná viditeľnosť "podklady" tab-u sa určuje v AppShell dynamicky
 * z `user.created_at`. Táto funkcia vracia zoznam AK by bol tento agent
 * nováčik (mladší 90 dní) — AppShell prípadne odstráni.
 */
export function navTabsForRole(role: AppUserRole): NavTabId[] {
  switch (role) {
    case "admin":
      return [
        "agent",
        "obhliadky",
        "obhliadnute",
        "realizacie",
        "calendar",
        "generator",
        "podklady",
        "spravy",
        "notifikacie",
        "admin",
      ];
    case "obchod":
      // "Obhliadnuté" — obhliadka HOTOVÁ obhliadkárom, obchodák musí spraviť
      // ďalší krok (poslať CP, alebo označiť lost). Sedí medzi Leady a Kalendár.
      // "Správy" — Messenger inbox pre DM od obhliadkárov (napr. „prístup?").
      return [
        "agent",
        "obhliadnute",
        "calendar",
        "generator",
        "podklady",
        "spravy",
        "notifikacie",
      ];
    case "obhliadky":
      return ["obhliadky", "calendar", "podklady", "spravy", "notifikacie"];
    case "realizacie":
      return ["realizacie", "calendar", "podklady", "spravy"];
    case "office":
      return ["office", "calendar", "podklady", "spravy", "notifikacie"];
  }
}

export type NavTabId =
  | "agent"
  | "obhliadky"
  | "obhliadnute"
  | "realizacie"
  | "office"
  | "podklady"
  | "calendar"
  | "generator"
  | "team"
  | "spravy"
  | "notifikacie"
  | "admin";
