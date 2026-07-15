"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MobileNavMenu — burger tlačidlo + slide-down panel s tab-mi.
 * User 2026-07-12: „hore leady/obhliadnute/kalendar nech je v burger menu
 * pri ucte na pravo".
 *
 * Ukazuje sa iba na < md breakpointe (mobile). Na md+ ostáva pôvodný
 * horizontálny nav bar.
 */

export interface MobileNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  inBuilding?: boolean;
  badge?: number;
  tint?: "sky" | "rose";
}

export function MobileNavMenu({ items }: { items: MobileNavItem[] }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Zavri po klik-nutí položky (aby nav zavrieť ručne netreba).
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC zatvorí
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Zamkni scroll bodyho keď je otvorené
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border-2 border-slate-200 hover:bg-slate-100 active:bg-slate-200"
        aria-label="Otvoriť menu"
      >
        <Menu className="w-5 h-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[80] md:hidden"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Sheet z hora */}
          <div className="absolute top-0 inset-x-0 bg-background rounded-b-3xl shadow-2xl border-b border-slate-200 max-h-[92vh] overflow-y-auto safe-area-top">
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background/95 backdrop-blur">
              <div className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                Menu
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200"
                aria-label="Zavrieť menu"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <ul className="p-3 space-y-1.5">
              {items.map((it) => {
                const active =
                  pathname === it.href ||
                  (it.href !== "/" && pathname.startsWith(it.href));
                if (it.inBuilding) {
                  return (
                    <li key={it.id}>
                      <div className="flex items-center gap-3 rounded-xl px-4 py-3.5 bg-slate-100 text-slate-400 opacity-60">
                        <span className="w-6 h-6 inline-flex items-center justify-center">
                          {it.icon}
                        </span>
                        <span className="flex-1 font-black">{it.label}</span>
                        <span className="text-[10px] uppercase tracking-wider font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded">
                          🚧 in build
                        </span>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3.5 border-2 transition-colors",
                        active
                          ? it.tint === "rose"
                            ? "border-rose-500 bg-rose-50 text-rose-900"
                            : "border-sky-500 bg-sky-50 text-sky-900"
                          : "border-transparent hover:bg-slate-100 active:bg-slate-200 text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "w-6 h-6 inline-flex items-center justify-center",
                          active
                            ? it.tint === "rose"
                              ? "text-rose-600"
                              : "text-sky-600"
                            : "text-muted-foreground",
                        )}
                      >
                        {it.icon}
                      </span>
                      <span className="flex-1 font-black">{it.label}</span>
                      {it.badge !== undefined && it.badge > 0 && (
                        <span
                          className={cn(
                            "min-w-[24px] h-6 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-black tabular-nums",
                            active
                              ? "bg-white/70"
                              : "bg-sky-100 text-sky-800",
                          )}
                        >
                          {it.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
