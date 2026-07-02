"use client";

import * as React from "react";
import {
  ChevronDown,
  Phone,
  Hammer,
  ClipboardList,
  Headphones,
  X,
  Shield,
} from "lucide-react";

import {
  setViewAsRoleAction,
  clearViewAsRoleAction,
} from "@/app/view-as-actions";

/**
 * RoleViewDropdown — admin klikom prepne "Zobraziť ako" na inú rolu.
 *
 * Voľby: Obchod / Realizácie / Obhliadky / Office. Po klikoch:
 *   1. Server action setne cookie 'view_as_role'
 *   2. Redirect na dashboard tej role
 *   3. Všetky stránky vidia usera ako danú rolu (nav, badge, guards)
 *
 * Ak je view-as aktívny, dropdown má "🔒 View as: Obchod" label + "X Zrušiť"
 * tlačítko ktoré vypne view-as a vráti admin.
 */
export function RoleViewDropdown({
  currentViewAs,
}: {
  currentViewAs?: "obchod" | "obhliadky" | "realizacie" | "office" | null;
}) {
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

  const isViewingAs = !!currentViewAs;
  const label = isViewingAs
    ? `Zobrazujem ako: ${ROLE_LABELS[currentViewAs!]}`
    : "Zobraziť ako";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 md:px-4 py-2 text-xs md:text-sm font-semibold transition-colors ${
          isViewingAs
            ? "bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200"
            : "bg-background hover:bg-muted/60 text-foreground"
        }`}
      >
        <span className="hidden md:inline">{label}</span>
        <span className="md:hidden">
          {isViewingAs ? ROLE_LABELS[currentViewAs!] : "View"}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${open ? "rotate-180" : ""}`}
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
              Otvor stránku očami zvolenej role
            </div>
          </div>

          {isViewingAs && (
            <>
              <form
                action={clearViewAsRoleAction}
                className="block"
              >
                <button
                  type="submit"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 border border-amber-200 bg-amber-50/50"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-bold text-sm inline-flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" aria-hidden />
                      Späť na Admin
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Vypnúť View as ({ROLE_LABELS[currentViewAs!]})
                    </div>
                  </div>
                </button>
              </form>
              <div className="my-1 border-t" />
            </>
          )}

          <RoleButton
            role="obchod"
            currentViewAs={currentViewAs}
            icon={<Phone className="w-4 h-4" />}
            iconBg="bg-sky-100 text-sky-700"
            hover="hover:bg-sky-50"
            title="Obchod"
            desc="Leady, callbacky, cenové ponuky"
            onSelect={() => setOpen(false)}
          />
          <RoleButton
            role="realizacie"
            currentViewAs={currentViewAs}
            icon={<Hammer className="w-4 h-4" />}
            iconBg="bg-emerald-100 text-emerald-700"
            hover="hover:bg-emerald-50"
            title="Realizácie"
            desc="Zákazky, foto/video z priebehu"
            onSelect={() => setOpen(false)}
          />
          <RoleButton
            role="obhliadky"
            currentViewAs={currentViewAs}
            icon={<ClipboardList className="w-4 h-4" />}
            iconBg="bg-violet-100 text-violet-700"
            hover="hover:bg-violet-50"
            title="Obhliadky"
            desc="Formulár, rozmery, foto z miesta"
            onSelect={() => setOpen(false)}
          />
          <RoleButton
            role="office"
            currentViewAs={currentViewAs}
            icon={<Headphones className="w-4 h-4" />}
            iconBg="bg-amber-100 text-amber-700"
            hover="hover:bg-amber-50"
            title="Office"
            desc="Voice-to-task, poznámky, todo"
            badge="vo výstavbe"
            onSelect={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  obchod: "Obchod",
  realizacie: "Realizácie",
  obhliadky: "Obhliadky",
  office: "Office",
};

function RoleButton({
  role,
  currentViewAs,
  icon,
  iconBg,
  hover,
  title,
  desc,
  badge,
  onSelect,
}: {
  role: "obchod" | "obhliadky" | "realizacie" | "office";
  currentViewAs?: string | null;
  icon: React.ReactNode;
  iconBg: string;
  hover: string;
  title: string;
  desc: string;
  badge?: string;
  onSelect: () => void;
}) {
  const isCurrent = currentViewAs === role;
  return (
    <form action={setViewAsRoleAction.bind(null, role)} className="block">
      <button
        type="submit"
        onClick={onSelect}
        disabled={isCurrent}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${hover} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div
          className={`w-8 h-8 rounded-full ${iconBg} inline-flex items-center justify-center shrink-0`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="font-bold text-sm inline-flex items-center gap-1.5">
            {title}
            {isCurrent && (
              <span className="text-[9px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded">
                aktívne
              </span>
            )}
            {badge && !isCurrent && (
              <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-200 text-amber-800 px-1 py-0.5 rounded">
                {badge}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
      </button>
    </form>
  );
}
