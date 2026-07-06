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

export type AppUserRole =
  | "admin"
  | "obchod"
  | "obhliadky"
  | "realizacie"
  | "office"
  | "skolenie";

/** Labely rolí pre UI — Slovak labels. */
export const ROLE_LABELS: Record<AppUserRole, string> = {
  admin: "Admin",
  obchod: "Obchod",
  obhliadky: "Obhliadky",
  realizacie: "Realizácie",
  office: "Office",
  skolenie: "Školenie",
};

/** Tailwind farby pre role badge — pastel pozadie + tmavý text. */
export const ROLE_BADGE_CLASSES: Record<AppUserRole, string> = {
  admin: "bg-amber-100 text-amber-800 border-amber-200",
  obchod: "bg-sky-100 text-sky-800 border-sky-200",
  obhliadky: "bg-violet-100 text-violet-800 border-violet-200",
  realizacie: "bg-emerald-100 text-emerald-800 border-emerald-200",
  office: "bg-amber-100 text-amber-800 border-amber-200",
  skolenie: "bg-rose-100 text-rose-800 border-rose-200",
};

/** Lucide ikona pre rolu (názov, importnúť cez @/components dynamicky). */
export const ROLE_ICON_NAME: Record<AppUserRole, string> = {
  admin: "ShieldCheck",
  obchod: "Phone",
  obhliadky: "ClipboardList",
  realizacie: "Hammer",
  office: "Headphones",
  skolenie: "GraduationCap",
};

/** Allowed roles array pre runtime validáciu (server actions, dev routes). */
export const ALLOWED_ROLES: readonly AppUserRole[] = [
  "admin",
  "obchod",
  "obhliadky",
  "realizacie",
  "office",
  "skolenie",
];

/**
 * Vráti správny dashboard URL pre rolu — každá rola má vlastný hlavný view:
 *   - admin     → /admin (správa tímu, integrácie, štatistiky)
 *   - obchod    → /agent (leady, generátor ponúk)
 *   - obhliadky → /obhliadky (priradené obhliadky, formulár s rozmermi)
 *   - realizacie → /realizacie (naplánované zákazky, materiálové výdaje)
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
    case "skolenie":
      return "/skolenie";
  }
}

/**
 * Primary nav tabs ktoré rola vidí.
 *   admin      → všetky sekcie + Admin panel + Office + Školenie (má prístup do všetkého)
 *   obchod     → Leady + Kalendár + Generátor + Tím
 *   obhliadky  → Obhliadky + Kalendár + Tím
 *   realizacie → Realizácie + Kalendár + Tím
 *   office     → Office + Kalendár + Tím
 *   skolenie   → IBA Školenie + Tím (onboarding rola pre nováčikov —
 *                nemá prístup k žiadnym leadom / operatíve, iba k tréning
 *                materiálom pokým si ich neprejde a admin ho nepovýši
 *                na obchod/obhliadky/realizacie).
 *
 * DÔLEŽITÉ: Skolenie tab vidí IBA admin (má prístup do všetkého) + rola
 * skolenie (onboarding). Ostatné role tab nevidia — nemajú dôvod chodiť
 * do onboarding sekcie po ukončení školenia.
 */
export function navTabsForRole(role: AppUserRole): NavTabId[] {
  switch (role) {
    case "admin":
      return [
        "agent",
        "obhliadky",
        "realizacie",
        "calendar",
        "generator",
        "skolenie",
        "team",
        "notifikacie",
        "admin",
      ];
    case "obchod":
      return ["agent", "calendar", "generator", "team", "notifikacie"];
    case "obhliadky":
      return ["obhliadky", "calendar", "team", "notifikacie"];
    case "realizacie":
      return ["realizacie", "calendar", "team"];
    case "office":
      return ["office", "calendar", "team", "notifikacie"];
    case "skolenie":
      return ["skolenie", "team", "notifikacie"];
  }
}

export type NavTabId =
  | "agent"
  | "obhliadky"
  | "realizacie"
  | "office"
  | "skolenie"
  | "calendar"
  | "generator"
  | "team"
  | "notifikacie"
  | "admin";
