"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  Phone,
  Hammer,
  ClipboardList,
  Headphones,
} from "lucide-react";

/**
 * RoleViewDropdown — admin klikom prepne "view as" na inú rolu.
 *
 * Zobrazí sa iba pre admin userov (parent kontroluje). Klikom sa otvorí menu
 * so 4 rolami:
 *   • Obchod → /agent
 *   • Realizácie → /realizacie
 *   • Obhliadky → /obhliadky
 *   • Office → /office (zatiaľ vo výstavbe)
 *
 * Cieľ: admin vidí presne to čo obchodník/realizator/obhliadkar/office manager
 * bez logout-loginu do iného účtu.
 */
export function RoleViewDropdown() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border bg-background hover:bg-muted/60 px-4 py-2 text-sm font-semibold text-foreground transition-colors"
      >
        Zobraziť ako
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border bg-background shadow-2xl p-1.5 z-50"
        >
          <div className="px-3 py-2 border-b mb-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              View as role
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Zobrazí ti stránku očami zvolenej role
            </div>
          </div>

          <Link
            href="/agent"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sky-50 group"
          >
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 inline-flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Obchod</div>
              <div className="text-[11px] text-muted-foreground">
                Leady, callbacky, cenové ponuky
              </div>
            </div>
          </Link>

          <Link
            href="/realizacie"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-emerald-50 group"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center shrink-0">
              <Hammer className="w-4 h-4" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Realizácie</div>
              <div className="text-[11px] text-muted-foreground">
                Zákazky, foto/video z priebehu
              </div>
            </div>
          </Link>

          <Link
            href="/obhliadky"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50 group"
          >
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 inline-flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Obhliadky</div>
              <div className="text-[11px] text-muted-foreground">
                Formulár, rozmery, foto z miesta
              </div>
            </div>
          </Link>

          <Link
            href="/office"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 group opacity-60"
          >
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
              <Headphones className="w-4 h-4" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm inline-flex items-center gap-1.5">
                Office
                <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-200 text-amber-800 px-1 py-0.5 rounded">
                  vo výstavbe
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Voice-to-task, poznámky, todo
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
