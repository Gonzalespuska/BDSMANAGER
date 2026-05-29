import Link from "next/link";
import { LogOut, ShieldCheck, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/login/actions";
import type { AppUser } from "@/lib/auth";

/**
 * Spoločný layout shell pre /admin a /agent.
 *  - Header s logom + role pill + odhlásením
 *  - Children render-uje aplikačný content
 */
export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link
            href={isAdmin ? "/admin" : "/agent"}
            className="hover:opacity-80 transition-opacity"
          >
            <div className="text-base font-bold tracking-tight">
              BDS<span className="text-sky-500">Manager</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Epoxidovo
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span>{user.email}</span>
              <span
                className={
                  isAdmin
                    ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-foreground text-background text-[10px] font-bold uppercase"
                    : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold uppercase"
                }
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
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Agent view →
              </Link>
            )}

            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" aria-hidden />
                Odhlásiť
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
