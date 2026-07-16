import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  Bell,
  Calculator,
  Calendar as CalendarIcon,
  CheckCheck,
  ClipboardList,
  GraduationCap,
  Hammer,
  Headphones,
  MessageCircle,
  Phone,
  ShieldCheck,
  Users as UsersIcon,
} from "lucide-react";

import { getRealUserRole, type AppUser } from "@/lib/auth";
import { dashboardPathForRole, navTabsForRole, type NavTabId } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/notifications";

import { NavPillClient } from "./nav-pill-client";
import { MobileNavMenu, type MobileNavItem } from "./mobile-nav-menu";
import { ProfileMenu } from "./profile-menu";
import { NotificationsBell } from "./notifications-bell";
import { ImpersonationBanner } from "./impersonation-banner";
import { ReassignRequestsBar } from "./reassign-requests-bar";
import { PoolSearchDrawer } from "./pool-search-drawer";
import { GlobalSearchTrigger } from "./admin/global-search-modal";
import { VacationApprovalsBar } from "./vacation-approvals-bar";
import { Toaster } from "./ui/toast";
import { RoleViewDropdown } from "./role-view-dropdown";
import { MackoLogo } from "./macko-logo";

/** Definícia každej navigačnej dlaždice — href, label, ikona. */
const NAV_TAB_DEFS: Record<
  NavTabId,
  { href: string; label: string; icon: React.ReactNode }
> = {
  agent: {
    href: "/agent",
    label: "Leady",
    icon: <Phone className="w-4 h-4" />,
  },
  obhliadky: {
    href: "/obhliadky",
    label: "Obhliadky",
    icon: <ClipboardList className="w-4 h-4" />,
  },
  obhliadnute: {
    href: "/obhliadnute",
    label: "Obhliadnuté",
    icon: <CheckCheck className="w-4 h-4" />,
  },
  realizacie: {
    href: "/realizacie",
    label: "Realizácie",
    icon: <Hammer className="w-4 h-4" />,
  },
  office: {
    href: "/office",
    label: "Office",
    icon: <Headphones className="w-4 h-4" />,
  },
  podklady: {
    href: "/skolenie",
    label: "Podklady",
    icon: <GraduationCap className="w-4 h-4" />,
  },
  calendar: {
    href: "/calendar",
    label: "Kalendár",
    icon: <CalendarIcon className="w-4 h-4" />,
  },
  generator: {
    href: "/generator",
    label: "Generátor ponúk",
    icon: <Calculator className="w-4 h-4" />,
  },
  team: {
    href: "/agent/team",
    label: "Tím chat",
    icon: <UsersIcon className="w-4 h-4" />,
  },
  spravy: {
    href: "/spravy",
    label: "Správy",
    icon: <MessageCircle className="w-4 h-4" />,
  },
  notifikacie: {
    href: "/notifikacie",
    label: "Notifikácie",
    icon: <Bell className="w-4 h-4" />,
  },
  admin: {
    href: "/admin",
    label: "Admin",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
};

/**
 * Spoločný layout shell pre /admin, /agent a /generator.
 *  - Veľký header s logom + user accountom + action buttons
 *  - Sekundárny nav s linkami (Leady · Generátor · ...)
 */
export async function AppShell({
  user,
  selfPaused,
  notifications,
  wide,
  children,
}: {
  user: AppUser;
  selfPaused: boolean;
  notifications: Notification[];
  /** Calendar a iné full-width stránky majú širší container. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  // Zisti reálnu rolu (bez view-as override) — potrebné pre zobrazenie
  // dropdown-u aj počas view-as (inak by admin sa mohol "uzavrieť" v obchod
  // view bez cesty späť).
  const realRole = await getRealUserRole();
  const isRealAdmin = realRole === "admin";

  // Fetch avatar_url + created_at z DB.
  // created_at slúži na určenie, či je agent stále „nováčik" (< 90 dní) →
  // uvidí Podklady v hlavnom menu. Starší už len v ProfileMenu dropdowne.
  let avatarUrl: string | null = null;
  let userCreatedAt: string | null = null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const sb = createAdminClient();
    const { data } = await sb
      .from("users")
      .select("avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle();
    avatarUrl = (data?.avatar_url as string | null) ?? null;
    userCreatedAt = (data?.created_at as string | null) ?? null;
  } catch {
    /* SQL 20 nebola spustená → avatar_url stĺpec neexistuje, ignoruj */
  }

  // Nováčik = agent mladší ako 90 dní od vytvorenia účtu.
  // Vidí „Podklady" v hlavnom nav. Starší v dropdowne.
  const NOVACIK_DAYS = 90;
  const isNovacik =
    userCreatedAt !== null &&
    Date.now() - new Date(userCreatedAt).getTime() <
      NOVACIK_DAYS * 24 * 3600 * 1000;
  // Admin vidí Podklady vždy (na kontrolu obsahu).
  const showPodkladyInNav = isNovacik || user.role === "admin";
  const viewAsCookie = (await cookies()).get("view_as_role")?.value;
  const validViewAsRoles = ["obchod", "obhliadky", "realizacie", "office"];
  const currentViewAs = (validViewAsRoles.includes(viewAsCookie ?? "")
    ? viewAsCookie
    : null) as "obchod" | "obhliadky" | "realizacie" | "office" | null;

  // Per-user impersonation banner — admin videl "ako Leo Hrisenko"
  // s tlacidlom "Späť na Admin".
  const viewAsUserId = (await cookies()).get("view_as_user_id")?.value ?? null;
  const impersonatedName =
    isRealAdmin && viewAsUserId
      ? // user objekt sa uz prepisal na Leo v getCurrentAppUser →
        // pouzijeme jeho meno pre banner
        user.name || user.email
      : null;

  const isAdmin = user.role === "admin";
  const isDev = process.env.NODE_ENV !== "production";
  // Nav sa filtruje podľa user.role — ktorá už môže byť view-as override
  let visibleTabs = navTabsForRole(user.role);
  if (!showPodkladyInNav) {
    visibleTabs = visibleTabs.filter((t) => t !== "podklady");
  }
  const homeHref = dashboardPathForRole(user.role);

  // "Obhliadnuté" badge count — obchodák (a admin) vidí červený bubble
  // s počtom leadov ktoré obhliadkár PRÁVE odoslal (status='inspected')
  // a čakajú na jeho CP. Bubble zhasne keď pošle CP → status='quote_sent'.
  let obhliadnuteBadge = 0;
  if (visibleTabs.includes("obhliadnute")) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const sb = createAdminClient();
      const q = sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "inspected");
      const scoped =
        user.role === "admin" ? q : q.eq("assigned_to", user.id);
      const { count } = await scoped;
      obhliadnuteBadge = count ?? 0;
    } catch {
      /* fail silently — badge zostane 0 */
    }
  }

  return (
    <div className="flex flex-col bg-muted/30 min-h-screen">
      {/* Global toast notifikacie (top-right) — dostupné z každého client
          komponentu cez `import { toast } from "@/components/ui/toast"`. */}
      <Toaster />
      {/* Sticky top-right žiadosti o preradenie leadu — cvakot + ne-zmizne.
          User 2026-07-15: „nezmitne ak neodkliknes" + „nech mi ta skurvena
          aplikacia cinka ked chce nieco potvrdit".
          Rozšírené na všetky rolí (obchod/obhliadky/realizacie/admin)
          keďže cross-role transfery cez profil (PeerTransferPanel). */}
      {["obchod", "obhliadky", "realizacie", "admin"].includes(user.role) ? (
        <ReassignRequestsBar />
      ) : null}
      {/* Vacation approvals — iba admin. Sticky pod ReassignRequestsBar. */}
      {user.role === "admin" ? <VacationApprovalsBar /> : null}
      {/* Sticky wrapper — banner + dev + header sa scroll-ujú ako jeden celok
          a zostávajú prilepené na hore. User 2026-07-14: „nech ked kukas ako
          niekto je to sticky ten bar". */}
      <div className="sticky top-0 z-20">
        {impersonatedName && <ImpersonationBanner userName={impersonatedName} />}
        {isDev && (
          <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-[11px] font-medium px-4 py-1.5 text-center">
            ⚡ DEV mode · auth bypass aktívny (prihlásený ako bootstrap admin). Vypne sa v produkcii.
          </div>
        )}
        <header className="border-b bg-background">
        {/* Header — kompaktnejší na mobile (menšia logika + hidden CRM subtitle). */}
        <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-3 sm:px-6 py-2 md:py-4 flex items-center justify-between gap-2 md:gap-3">
          <Link
            href={homeHref}
            className="hover:opacity-80 transition-opacity min-w-0 flex items-center gap-2 md:gap-3"
          >
            {/* Macko maskot — client komponent (onError fallback vyžaduje
                event handler → nesmie byť v RSC). Predtým crashoval /admin
                s digest 1227445453. */}
            <MackoLogo />
            <div className="min-w-0">
              <div className="text-lg md:text-3xl font-extrabold tracking-tight leading-none whitespace-nowrap">
                Epoxidovo<span className="text-sky-500"> Manager</span>
              </div>
              <div className="hidden md:block mt-1 text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                CRM
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 md:gap-3">
            {isRealAdmin && <RoleViewDropdown currentViewAs={currentViewAs} />}
            {/* Admin — globálne hľadanie (leady akéhokoľvek stavu + tím).
                User 2026-07-16: „admin musi vediet vyhladat cokolvek ci uz
                lead alebo agenta alebo cokolvek". Cmd+K skratka. */}
            {user.role === "admin" && <GlobalSearchTrigger />}
            {/* Pool search — všetky rolí okrem office/skolenie.
                Dropdown modes + akcie sa dynamicky menia podľa role
                viewera (user 2026-07-15). Pre adminov ostáva pool search
                pre rýchle prevzatie z poolu (nie search kdekoľvek). */}
            {(user.role === "obchod" ||
              user.role === "obhliadky" ||
              user.role === "realizacie" ||
              user.role === "admin") && (
              <PoolSearchDrawer viewerRole={user.role} />
            )}
            {/* Realizator nemá notifikácie — pracuje na stavbe, netreba mu je. */}
            {user.role !== "realizacie" && (
              <NotificationsBell initial={notifications} />
            )}
            <ProfileMenu
              user={user}
              realRole={realRole ?? user.role}
              selfPaused={selfPaused}
              avatarUrl={avatarUrl}
              showPodkladyLink={!showPodkladyInNav}
            />
            {/* Burger — iba mobile. User 2026-07-12: „leady/obhliadnute/
                kalendar nech je v burger menu pri ucte na pravo". */}
            <MobileNavMenu
              items={visibleTabs.map((tabId) => {
                const def = NAV_TAB_DEFS[tabId];
                const inBuilding =
                  tabId === "team" || tabId === "notifikacie";
                const badge =
                  tabId === "obhliadnute" ? obhliadnuteBadge : undefined;
                return {
                  id: tabId,
                  label: def.label,
                  href: def.href,
                  icon: def.icon,
                  inBuilding,
                  badge,
                  tint: tabId === "admin" ? "rose" : "sky",
                } satisfies MobileNavItem;
              })}
            />
          </div>
        </div>

        {/* Secondary nav — na md+ horizontal pills; na mobile ich nahrádza
            burger menu (MobileNavMenu vyššie). */}
        <nav className="hidden md:flex max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1600px] mx-auto pb-2 md:pb-3 items-center gap-1.5 md:gap-2 md:flex-wrap md:overflow-visible px-3 sm:px-6 pr-6">
          {visibleTabs.map((tabId) => {
            const def = NAV_TAB_DEFS[tabId];
            // „In building" — VŠETCI (aj admin) vidia iba blanknuté disabled
            // políčko. Nedá sa klikať, žiadny hover state, žiadny link.
            const inBuilding =
              tabId === "team" || tabId === "notifikacie" || tabId === "podklady";
            if (inBuilding) {
              return (
                <span
                  key={tabId}
                  aria-disabled="true"
                  title="V príprave"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 md:px-4 py-2 text-sm font-semibold whitespace-nowrap shrink-0 border-2 border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none pointer-events-none opacity-70"
                >
                  {def.icon}
                  {def.label}
                  <span className="text-[9px] uppercase tracking-wider font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded ml-1">
                    🚧 in build
                  </span>
                </span>
              );
            }
            const badge = tabId === "obhliadnute" ? obhliadnuteBadge : undefined;
            return (
              <NavPill
                key={tabId}
                href={def.href}
                icon={def.icon}
                tint={tabId === "admin" ? "rose" : "sky"}
                badge={badge}
              >
                {def.label}
              </NavPill>
            );
          })}
        </nav>
      </header>
      </div>

      <main
        className={cn(
          "flex-1 w-full mx-auto",
          // wide = širšia max-width (generator/leady); natívny body scroll
          // zachovaný — žiadne h-screen/overflow-hidden gymnastiky.
          wide
            ? "max-w-none px-3 sm:px-4 md:px-6 py-2 md:py-3 pb-6"
            : "max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1600px] px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 pb-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}

// NavPill je client component aby vedel current pathname
// → aktívna stránka je farebne odlíšená (sky-500 background, admin=rose)
function NavPill(props: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tint?: "sky" | "rose";
  badge?: number;
}) {
  return <NavPillClient {...props} />;
}
