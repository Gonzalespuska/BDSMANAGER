"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Phone,
  Hammer,
  ClipboardList,
  Eye,
  X,
  Shield,
  Loader2,
} from "lucide-react";

/**
 * RoleViewDropdown — admin klikom prepne "Zobraziť ako" na inú rolu.
 *
 * Client-side flow (spoľahlivejšie ako server actions v CF Pages edge):
 *   1. Klik → POST /api/view-as { role }
 *   2. Server setne cookie
 *   3. window.location.href = response.redirect (hard navigation → server
 *      RSC re-render s novou rolou)
 */
type ViewAsRole =
  | "obchod"
  | "obhliadky"
  | "realizacie"
  | "office";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
};

export function RoleViewDropdown({
  currentViewAs,
}: {
  currentViewAs?: ViewAsRole | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Zoznam tímu — načíta sa raz keď admin otvorí dropdown; použité pre
  // hover-submenu (Obchod → konkrétni obchodáci).
  const [team, setTeam] = React.useState<TeamMember[] | null>(null);
  React.useEffect(() => {
    if (!open || team !== null) return;
    fetch("/api/admin/team")
      .then((r) => r.json())
      .then((j: { ok?: boolean; users?: TeamMember[] }) => {
        if (j.ok && j.users) setTeam(j.users);
      })
      .catch(() => {
        /* silent — submenu proste neukáže users */
      });
  }, [open, team]);

  // User 2026-07-12: „tu zobrazit ako by bolo tiez fajn ked som na leo
  // hrisko" — ak sme na `/admin/agents/<uuid>`, ponúkni „Zobraziť ako
  // tohto usera" ako first option.
  const agentDetailMatch = React.useMemo(() => {
    if (!pathname) return null;
    const m = pathname.match(
      /^\/admin\/agents\/([a-f0-9-]{16,})(?:\/|$)/i,
    );
    return m ? m[1] : null;
  }, [pathname]);
  const [agentName, setAgentName] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!agentDetailMatch) {
      setAgentName(null);
      return;
    }
    // Fetch meno bez zbytočnej záťaže — jednoduchý cache-first via meta title
    const heading = document.querySelector("h1")?.textContent?.trim();
    if (heading && heading.length > 0 && heading.length < 80) {
      setAgentName(heading.replace(/[⚙️👤📊•·]+/g, "").trim());
    }
  }, [agentDetailMatch]);

  async function impersonateUser(userId: string) {
    setBusy("impersonate");
    try {
      const res = await fetch("/api/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };
      if (!json.ok || !json.redirect) {
        alert(`Chyba: ${json.error ?? "unknown"}`);
        setBusy(null);
        return;
      }
      window.location.href = json.redirect;
    } catch (e) {
      alert(`Chyba pripojenia: ${e instanceof Error ? e.message : "unknown"}`);
      setBusy(null);
    }
  }

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

  async function switchTo(role: ViewAsRole | "clear") {
    setBusy(role);
    try {
      const res = await fetch("/api/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };
      if (!json.ok || !json.redirect) {
        alert(`Chyba: ${json.error ?? "unknown"}`);
        setBusy(null);
        return;
      }
      // Hard navigation aby server RSC dostal nový cookie a re-renderol shell
      window.location.href = json.redirect;
    } catch (e) {
      alert(`Chyba pripojenia: ${e instanceof Error ? e.message : "unknown"}`);
      setBusy(null);
    }
  }

  const isViewingAs = !!currentViewAs;

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
        <span className="hidden md:inline">
          {isViewingAs ? `Ako: ${ROLE_LABELS[currentViewAs!]}` : "Zobraziť ako"}
        </span>
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
              <button
                type="button"
                onClick={() => switchTo("clear")}
                disabled={!!busy}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 border border-amber-200 bg-amber-50/50 disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
                  {busy === "clear" ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="w-4 h-4" aria-hidden />
                  )}
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
              <div className="my-1 border-t" />
            </>
          )}

          {/* View as špecifický user — iba keď admin pozerá profil obchodáka */}
          {agentDetailMatch && !isViewingAs && (
            <>
              <button
                type="button"
                onClick={() => impersonateUser(agentDetailMatch)}
                disabled={!!busy}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sky-50 border border-sky-200 bg-sky-50/40 disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 inline-flex items-center justify-center shrink-0">
                  {busy === "impersonate" ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-bold text-sm text-sky-900">
                    Zobraziť ako {agentName ?? "tohto usera"}
                  </div>
                  <div className="text-[11px] text-sky-800">
                    Otvor CRM očami konkrétneho člena tímu
                  </div>
                </div>
              </button>
              <div className="my-1 border-t" />
            </>
          )}

          <RoleButton
            role="obchod"
            current={currentViewAs}
            busy={busy}
            onClick={switchTo}
            onImpersonate={impersonateUser}
            team={team}
            icon={<Phone className="w-4 h-4" />}
            iconBg="bg-sky-100 text-sky-700"
            hover="hover:bg-sky-50"
            title="Obchod"
            desc="Leady, callbacky, cenové ponuky"
          />
          <RoleButton
            role="realizacie"
            current={currentViewAs}
            busy={busy}
            onClick={switchTo}
            onImpersonate={impersonateUser}
            team={team}
            icon={<Hammer className="w-4 h-4" />}
            iconBg="bg-emerald-100 text-emerald-700"
            hover="hover:bg-emerald-50"
            title="Realizácie"
            desc="Zákazky, foto/video z priebehu"
          />
          <RoleButton
            role="obhliadky"
            current={currentViewAs}
            busy={busy}
            onClick={switchTo}
            onImpersonate={impersonateUser}
            team={team}
            icon={<ClipboardList className="w-4 h-4" />}
            iconBg="bg-violet-100 text-violet-700"
            hover="hover:bg-violet-50"
            title="Obhliadky"
            desc="Formulár, rozmery, foto z miesta"
          />
          {/* User 2026-07-12: „tato rola prec" — Školenie tlačidlo skryté. */}
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
  skolenie: "Školenie",
};

function RoleButton({
  role,
  current,
  busy,
  onClick,
  onImpersonate,
  team,
  icon,
  iconBg,
  hover,
  title,
  desc,
  badge,
}: {
  role: ViewAsRole;
  current?: string | null;
  busy: string | null;
  onClick: (role: ViewAsRole) => void;
  onImpersonate: (userId: string) => void;
  team: TeamMember[] | null;
  icon: React.ReactNode;
  iconBg: string;
  hover: string;
  title: string;
  desc: string;
  badge?: string;
}) {
  const isCurrent = current === role;
  const isBusy = busy === role;
  // Hover-timer pre submenu (800 ms držanie → otvorí konkrétnych userov).
  // User 2026-07-16: „ked podrzim na obchod neviem sekundu a pol tak mi
  // ukaze konkretnych obchodakov".
  const [subOpen, setSubOpen] = React.useState(false);
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  function scheduleOpen() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setSubOpen(true), 800);
  }
  function cancelOpen() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function scheduleClose() {
    cancelOpen();
    hoverTimer.current = setTimeout(() => setSubOpen(false), 200);
  }

  const usersInRole = (team ?? []).filter(
    (u) => u.role === role && u.active,
  );

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => !isCurrent && !isBusy && onClick(role)}
        disabled={isCurrent || !!busy}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${hover} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div
          className={`w-8 h-8 rounded-full ${iconBg} inline-flex items-center justify-center shrink-0`}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            icon
          )}
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
        {usersInRole.length > 0 && (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {usersInRole.length}
          </span>
        )}
      </button>

      {/* Submenu — konkrétni ľudia tejto role. */}
      {subOpen && usersInRole.length > 0 && (
        <div
          onMouseEnter={cancelOpen}
          onMouseLeave={scheduleClose}
          className="absolute right-full top-0 mr-1 w-56 rounded-xl border bg-background shadow-2xl p-1.5 z-50"
        >
          <div className="px-2 py-1 border-b mb-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {title} — konkrétny človek
            </div>
          </div>
          {usersInRole.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onImpersonate(u.id)}
              disabled={!!busy}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted disabled:opacity-40 flex items-center gap-2"
            >
              <div
                className={`w-6 h-6 rounded-full ${iconBg} inline-flex items-center justify-center shrink-0 text-[10px] font-black`}
              >
                {((u.name || u.email)[0] || "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {u.name || u.email}
                </div>
                {u.name && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    {u.email}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
