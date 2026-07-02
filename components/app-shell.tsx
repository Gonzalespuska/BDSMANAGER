import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  Calculator,
  Calendar as CalendarIcon,
  ClipboardList,
  Hammer,
  Phone,
  ShieldCheck,
  Users as UsersIcon,
} from "lucide-react";

import { getRealUserRole, type AppUser } from "@/lib/auth";
import { dashboardPathForRole, navTabsForRole, type NavTabId } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/notifications";

import { NavPillClient } from "./nav-pill-client";
import { ProfileMenu } from "./profile-menu";
import { NotificationsBell } from "./notifications-bell";
import { RoleViewDropdown } from "./role-view-dropdown";

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
  realizacie: {
    href: "/realizacie",
    label: "Realizácie",
    icon: <Hammer className="w-4 h-4" />,
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
  const viewAsCookie = (await cookies()).get("view_as_role")?.value;
  const validViewAsRoles = ["obchod", "obhliadky", "realizacie", "office"];
  const currentViewAs = (validViewAsRoles.includes(viewAsCookie ?? "")
    ? viewAsCookie
    : null) as "obchod" | "obhliadky" | "realizacie" | "office" | null;

  const isAdmin = user.role === "admin";
  const isDev = process.env.NODE_ENV !== "production";
  // Nav sa filtruje podľa user.role — ktorá už môže byť view-as override
  const visibleTabs = navTabsForRole(user.role);
  const homeHref = dashboardPathForRole(user.role);

  return (
    <div className="flex flex-col bg-muted/30 min-h-screen">
      {isDev && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-[11px] font-medium px-4 py-1.5 text-center">
          ⚡ DEV mode · auth bypass aktívny (prihlásený ako bootstrap admin). Vypne sa v produkcii.
        </div>
      )}

      <header className="border-b bg-background sticky top-0 z-10">
        {/* Header — kompaktnejší na mobile (menšia logika + hidden CRM subtitle). */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 md:py-4 flex items-center justify-between gap-2 md:gap-3">
          <Link
            href={homeHref}
            className="hover:opacity-80 transition-opacity min-w-0"
          >
            <div className="text-lg md:text-3xl font-extrabold tracking-tight leading-none whitespace-nowrap">
              Epoxidovo<span className="text-sky-500"> Manager</span>
            </div>
            <div className="hidden md:block mt-1 text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              CRM
            </div>
          </Link>

          <div className="flex items-center gap-1.5 md:gap-3">
            {isRealAdmin && <RoleViewDropdown currentViewAs={currentViewAs} />}
            <NotificationsBell initial={notifications} />
            <ProfileMenu user={user} selfPaused={selfPaused} />
          </div>
        </div>

        {/* Secondary nav — horizontal scroll na mobile (žiadny wrap = žiadny
            zaberaný vertikálny priestor pod bar-om). Na desktop wrap ako predtým. */}
        <nav className="max-w-7xl mx-auto px-3 sm:px-6 pb-2 md:pb-3 flex items-center gap-1.5 md:gap-2 md:flex-wrap overflow-x-auto scrollbar-hide -mx-1 md:mx-0 px-1 md:px-6">
          {visibleTabs.map((tabId) => {
            const def = NAV_TAB_DEFS[tabId];
            return (
              <NavPill key={tabId} href={def.href} icon={def.icon}>
                {def.label}
              </NavPill>
            );
          })}
        </nav>
      </header>

      <main
        className={cn(
          "flex-1 w-full mx-auto",
          // wide = širšia max-width (generator/leady); natívny body scroll
          // zachovaný — žiadne h-screen/overflow-hidden gymnastiky.
          wide
            ? "max-w-none px-3 sm:px-4 md:px-6 py-2 md:py-3 pb-6"
            : "max-w-7xl px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 pb-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}

// NavPill je client component aby vedel current pathname
// → aktívna stránka je farebne odlíšená (sky-500 background)
function NavPill(props: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return <NavPillClient {...props} />;
}
