"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  Pause,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

import type { AppUser } from "@/lib/auth";
import { signOutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";

/**
 * Klikateľný profil pill v headeri.
 *
 * Obsah dropdown menu:
 *   - Admin: link na /admin/agents (kde pauzuje obchodníkov)
 *   - Odhlásiť
 *
 * IBA ADMIN vidí paused stav (bublinku + badge). Obchodníci sami sa nevedia
 * pauznúť — spravuje admin.
 */
export function ProfileMenu({
  user,
  selfPaused,
}: {
  user: AppUser;
  selfPaused: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isAdmin = user.role === "admin";
  const paused = selfPaused;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "hidden sm:inline-flex items-center gap-2.5 rounded-full border bg-muted/60 hover:bg-muted px-4 py-2 transition-colors",
          "text-sm font-medium cursor-pointer",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background relative">
          <UserIcon className="w-4 h-4" aria-hidden />
          {/* Status bublinka — iba admin vidí či je aktívny/pauznutý */}
          {isAdmin && (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                paused ? "bg-rose-500" : "bg-emerald-500",
              )}
              aria-hidden
              title={paused ? "Neaktívny — leady prerušené" : "Aktívny — dostávaš leady"}
            />
          )}
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
        {/* PAUZA badge — iba admin vidí či je user pauznutý (v /admin/agents zozname) */}
        {paused && isAdmin && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
            <Pause className="w-3 h-3" aria-hidden />
            pauza
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border bg-background shadow-2xl p-1.5 z-50"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b mb-1">
            <div className="font-bold text-sm">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>

          {/* Pause / Resume — IBA ADMIN cez /admin/agents/[id]. Obchodník
              nemôže sám seba pauznúť ani vidieť svoj stav. */}
          {isAdmin && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Pauzovanie leadov obchodníkov:{" "}
              <Link
                href="/admin/agents"
                className="text-sky-600 hover:underline font-semibold"
              >
                /admin/agents
              </Link>
            </div>
          )}

          {/* Divider */}
          <div className="border-t my-1.5" />

          {/* Sign out */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-semibold text-red-700 dark:text-red-400 inline-flex items-center gap-2.5"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              Odhlásiť
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
