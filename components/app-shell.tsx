import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  LogOut,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

import { signOutAction } from "@/app/login/actions";
import type { AppUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { NavPillClient } from "./nav-pill-client";

/**
 * Spoločný layout shell pre /admin, /agent a /generator.
 *  - Veľký header s logom + user accountom + action buttons
 *  - Sekundárny nav s linkami (Leady · Generátor · ...)
 */
export function AppShell({
  user,
  children,
}: {
  user: AppUser;
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
            <div
              className={cn(
                "hidden sm:inline-flex items-center gap-2.5 rounded-full border bg-muted/60 px-4 py-2",
                "text-sm font-medium",
              )}
            >
              <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background">
                <UserIcon className="w-4 h-4" aria-hidden />
              </div>
              <span className="text-foreground">{user.email}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  isAdmin
                    ? "bg-foreground text-background"
                    : "bg-sky-100 text-sky-700",
                )}
              >
                {isAdmin ? (
                  <ShieldCheck className="w-3 h-3" aria-hidden />
                ) : (
                  <UserIcon className="w-3 h-3" aria-hidden />
                )}
                {user.role}
              </span>
            </div>

            {isAdmin && (
              <Link
                href="/agent"
                className="inline-flex items-center gap-1.5 rounded-full border bg-background hover:bg-muted/60 px-4 py-2 text-sm font-semibold text-foreground transition-colors"
              >
                Agent view
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            )}

            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2 text-sm font-semibold transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden />
                Odhlásiť
              </button>
            </form>
          </div>
        </div>

        {/* Secondary nav — pills */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 flex-wrap">
          <NavPill href="/agent" icon={<Phone className="w-4 h-4" />}>
            Leady
          </NavPill>
          <NavPill
            href="/generator"
            icon={<Calculator className="w-4 h-4" />}
          >
            Generátor ponúk
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
