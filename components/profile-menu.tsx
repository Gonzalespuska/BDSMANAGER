"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  Pause,
  Play,
  ShieldCheck,
  User as UserIcon,
  Users as UsersIcon,
} from "lucide-react";

import type { AppUser } from "@/lib/auth";
import { signOutAction } from "@/app/login/actions";
import { setMyPauseAction } from "@/app/agent/profile-actions";
import { cn } from "@/lib/utils";

/**
 * Klikateľný profil pill v headeri.
 *
 * Obsah dropdown menu:
 *   - Pauznúť / Obnoviť príjem leadov (sebe) — s inline confirmom
 *   - Workload tímu (len admin / dev)
 *   - Odhlásiť
 */
export function ProfileMenu({
  user,
  selfPaused,
}: {
  user: AppUser;
  selfPaused: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [confirmPause, setConfirmPause] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [paused, setPaused] = React.useState(selfPaused);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmPause(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isAdmin = user.role === "admin";
  const showTeamWorkload =
    isAdmin || process.env.NODE_ENV !== "production";

  async function doPauseToggle() {
    if (busy) return;
    setBusy(true);
    const next = !paused;
    const res = await setMyPauseAction(next);
    setBusy(false);
    if (!res.ok) {
      alert(`Chyba: ${res.error}`);
      return;
    }
    setPaused(next);
    setConfirmPause(false);
    setOpen(false);
  }

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
        {paused && (
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

          {/* Pause / Resume */}
          {user.role === "user" && (
            <div className="px-1">
              {!confirmPause ? (
                <button
                  type="button"
                  onClick={() => setConfirmPause(true)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted text-sm font-semibold inline-flex items-center gap-2.5"
                  role="menuitem"
                >
                  {paused ? (
                    <>
                      <Play
                        className="w-4 h-4 text-emerald-600"
                        aria-hidden
                      />
                      Obnoviť príjem leadov
                    </>
                  ) : (
                    <>
                      <Pause
                        className="w-4 h-4 text-amber-600"
                        aria-hidden
                      />
                      Pauznúť príjem leadov
                    </>
                  )}
                </button>
              ) : (
                <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                    {paused
                      ? "Obnoviť automatické prideľovanie leadov?"
                      : "Pauznúť automatické prideľovanie leadov?"}
                  </p>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mb-3">
                    {paused
                      ? "Budeš znovu dostávať nové leady z webu, FB, atď."
                      : "Existujúce leady ti zostanú. Nové ti nebudú prideľované."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={doPauseToggle}
                      disabled={busy}
                      className={cn(
                        "flex-1 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider text-white",
                        paused
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-amber-600 hover:bg-amber-700",
                        busy && "opacity-50",
                      )}
                    >
                      {busy ? "ukladám…" : "Potvrdiť"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPause(false)}
                      className="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider bg-muted hover:bg-muted/70"
                    >
                      Zrušiť
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Workload tímu (admin / dev only) */}
          {showTeamWorkload && (
            <Link
              href="/workload"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted text-sm font-semibold inline-flex items-center gap-2.5"
              role="menuitem"
            >
              <UsersIcon className="w-4 h-4 text-sky-600" aria-hidden />
              Workload tímu
              {isAdmin && (
                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">
                  admin
                </span>
              )}
            </Link>
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
