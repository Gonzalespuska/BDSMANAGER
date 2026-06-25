import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Calendar as CalendarIcon,
  Phone,
  ShieldCheck,
  Users as UsersIcon,
} from "lucide-react";

import type { AppUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { NavPillClient } from "./nav-pill-client";
import { ProfileMenu } from "./profile-menu";

/**
 * Spoločný layout shell pre /admin, /agent a /generator.
 *  - Veľký header s logom + user accountom + action buttons
 *  - Sekundárny nav s linkami (Leady · Generátor · ...)
 */
export function AppShell({
  user,
  selfPaused,
  children,
}: {
  user: AppUser;
  selfPaused: boolean;
  children: React.ReactNode;
}) {
  const isAdmin = user.role === "admin";
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {isDev && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-[11px] font-medium px-4 py-1.5 text-center">
          ⚡ DEV mode · auth bypass aktívny (prihlásený ako bootstrap admin). Vypne sa v produkcii.
        </div>
      )}

      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-6 flex items-center justify-between gap-3">
          <Link
            href={isAdmin ? "/admin" : "/agent"}
            className="hover:opacity-80 transition-opacity"
          >
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight leading-none">
              BDS<span className="text-sky-500">Manager</span>
            </div>
            <div className="mt-1 text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Epoxidovo
            </div>
          </Link>

          <div className="flex items-center gap-2 md:gap-3">
            {isAdmin && (
              <Link
                href="/agent"
                className="inline-flex items-center gap-1.5 rounded-full border bg-background hover:bg-muted/60 px-4 py-2 text-sm font-semibold text-foreground transition-colors"
              >
                Agent view
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            )}

            <ProfileMenu user={user} selfPaused={selfPaused} />
          </div>
        </div>

        {/* Secondary nav — pills */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 flex-wrap">
          <NavPill href="/agent" icon={<Phone className="w-4 h-4" />}>
            Leady
          </NavPill>
          <NavPill href="/calendar" icon={<CalendarIcon className="w-4 h-4" />}>
            Kalendár
          </NavPill>
          <NavPill
            href="/generator"
            icon={<Calculator className="w-4 h-4" />}
          >
            Generátor ponúk
          </NavPill>
          <NavPill href="/agent/team" icon={<UsersIcon className="w-4 h-4" />}>
            Tím chat
          </NavPill>
          {isAdmin && (
            <NavPill href="/admin" icon={<ShieldCheck className="w-4 h-4" />}>
              Admin
            </NavPill>
          )}
        </nav>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
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
