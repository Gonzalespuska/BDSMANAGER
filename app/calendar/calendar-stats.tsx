import Link from "next/link";
import {
  BarChart3,
  Calendar as CalendarIcon,
  ClipboardList,
  Eye,
  Hammer,
  TrendingUp,
  Users,
} from "lucide-react";

import type { AppUserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

import { PrehladSmartSuggest } from "./prehlad-smart-suggest";

/**
 * Kalendárový prehľad — kto kedy a kde robí. Obchodák tu vidí obsadenosť
 * obhliadkarov + realizátorov, aby vedel dať zákazníkovi realistický termín.
 * Callbacky patria do /notifikacie (nie sem).
 */
export interface CalendarStatsData {
  // Placeholder — real hodnoty po SQL migrácii 10_role_handoff.
  // Neskôr: total_inspections_next_7d, total_realizations_next_30d, atď.
}

/**
 * Panel štatistík pod kalendárom. Zobrazuje sa každej role — obsah sa
 * mierne líši podľa role.
 *
 * Zoznam sa bude priebežne dopĺňať:
 *   • [TODO] Obhliadky per deň — po `10_role_handoff.sql` (needs_inspection)
 *   • [TODO] Aktívne realizácie per deň
 *   • [TODO] Priemerný response time obchodníka
 *   • [TODO] Konverzný pomer CP → won
 */
export async function CalendarStats({
  role,
  activeFilterUserId,
}: {
  role: AppUserRole;
  stats?: CalendarStatsData;
  /** Ak je set, riadok toho člena je zvýraznený (obchodák filtruje). */
  activeFilterUserId?: string | null;
}) {
  const isObchod = role === "obchod" || role === "admin";

  // ─── Realizatori + Obhliadkári — koľko má kto (firemný breakdown) ────
  const sb = createAdminClient();
  const [{ data: realizators }, { data: inspectors }] = await Promise.all([
    sb.from("users").select("id, name, email").eq("role", "realizacie").eq("active", true),
    sb.from("users").select("id, name, email").eq("role", "obhliadky").eq("active", true),
  ]);
  const realizatorIds = (realizators ?? []).map((r) => r.id as string);
  const inspectorIds = (inspectors ?? []).map((r) => r.id as string);
  const realizatorStats: Array<{
    id: string;
    name: string;
    active: number;
    scheduled: number;
    completed: number;
  }> = [];
  const inspectorStats: Array<{
    id: string;
    name: string;
    active: number;
    scheduled: number;
    completed: number;
  }> = [];
  if (realizatorIds.length > 0) {
    // Načítame všetky leady kde je realization_by set do fetch reťazca.
    // Tabuľka môže byť veľká — limit posledné 500 zákaziek na realizatora.
    const { data: leads } = await sb
      .from("leads")
      .select("realization_by, status, realization_completed_at")
      .in("realization_by", realizatorIds);
    const map = new Map<
      string,
      { active: number; scheduled: number; completed: number }
    >();
    for (const id of realizatorIds)
      map.set(id, { active: 0, scheduled: 0, completed: 0 });
    for (const l of leads ?? []) {
      const rid = l.realization_by as string;
      const s = map.get(rid);
      if (!s) continue;
      const status = l.status as string;
      const completed = !!(l.realization_completed_at as string | null);
      if (completed) s.completed++;
      else if (status === "in_realization" || status === "won") s.active++;
      else if (status === "quote_sent" || status === "scheduled")
        s.scheduled++;
    }
    for (const r of realizators ?? []) {
      const s = map.get(r.id as string)!;
      realizatorStats.push({
        id: r.id as string,
        name: (r.name as string) || (r.email as string) || "?",
        ...s,
      });
    }
    realizatorStats.sort(
      (a, b) => b.active + b.scheduled - (a.active + a.scheduled),
    );
  }

  // ─── Obhliadkári — počty needs_inspection + inspected ───────────────
  if (inspectorIds.length > 0) {
    const { data: leads } = await sb
      .from("leads")
      .select("inspection_by, status")
      .in("inspection_by", inspectorIds);
    const map = new Map<
      string,
      { active: number; scheduled: number; completed: number }
    >();
    for (const id of inspectorIds)
      map.set(id, { active: 0, scheduled: 0, completed: 0 });
    for (const l of leads ?? []) {
      const iid = l.inspection_by as string;
      const s = map.get(iid);
      if (!s) continue;
      const status = l.status as string;
      if (status === "needs_inspection") s.scheduled++;
      else if (status === "inspected") s.active++;
      else if (status === "quote_sent" || status === "won" || status === "in_realization")
        s.completed++;
    }
    for (const r of inspectors ?? []) {
      const s = map.get(r.id as string)!;
      inspectorStats.push({
        id: r.id as string,
        name: (r.name as string) || (r.email as string) || "?",
        ...s,
      });
    }
    inspectorStats.sort(
      (a, b) => b.active + b.scheduled - (a.active + a.scheduled),
    );
  }

  const showFilter = role === "obchod" || role === "admin";

  return (
    <section className="rounded-2xl border-2 bg-background overflow-hidden shadow-sm">
      <header className="px-5 py-3.5 border-b-2 bg-gradient-to-b from-amber-50/50 to-transparent flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-amber-600" aria-hidden />
        <h2 className="text-lg font-extrabold tracking-tight">Prehľad</h2>
        <span className="text-[10px] uppercase tracking-widest font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {roleLabelForStats(role)}
        </span>
      </header>

      <div className="p-4 space-y-3">
        {isObchod && (
          <>
            {/* Smart-suggest bars — obchodák zadá mesto a systém navrhne
                najlepší deň (kombinácia s inými obhliadkami / realizáciami
                v tom smere = úspora dopravných nákladov). */}
            <PrehladSmartSuggest />

            {/* TOTAL tiles — počty za AKTÍVNY MESIAC (ten čo vidíš
                v kalendári hore). Nie fixných 7/30 dní. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PlaceholderTile
                icon={<ClipboardList className="w-5 h-5 text-violet-600" />}
                label="Obhliadky TOTAL"
                tint="violet"
                note="Za aktívny mesiac v kalendári vyššie"
              />
              <PlaceholderTile
                icon={<Hammer className="w-5 h-5 text-emerald-600" />}
                label="Realizácie TOTAL"
                tint="emerald"
                note="Za aktívny mesiac v kalendári vyššie"
              />
            </div>
          </>
        )}

        {/* Obhliadky rola — všetko za aktívny mesiac v kalendári vyššie */}
        {role === "obhliadky" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <PlaceholderTile
              icon={<ClipboardList className="w-5 h-5 text-violet-600" />}
              label="Moje obhliadky"
              tint="violet"
              note="Za aktívny mesiac"
            />
            <PlaceholderTile
              icon={<CalendarIcon className="w-5 h-5 text-amber-600" />}
              label="Naplánované"
              tint="amber"
              note="Za aktívny mesiac"
            />
            <PlaceholderTile
              icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
              label="Dokončené"
              tint="emerald"
              note="Za aktívny mesiac"
            />
          </div>
        )}

        {/* Realizacie rola — všetko za aktívny mesiac */}
        {role === "realizacie" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <PlaceholderTile
              icon={<Hammer className="w-5 h-5 text-emerald-600" />}
              label="Aktívne realizácie"
              tint="emerald"
              note="Za aktívny mesiac"
            />
            <PlaceholderTile
              icon={<CalendarIcon className="w-5 h-5 text-amber-600" />}
              label="Naplánované"
              tint="amber"
              note="Za aktívny mesiac"
            />
            <PlaceholderTile
              icon={<TrendingUp className="w-5 h-5 text-sky-600" />}
              label="Dokončené"
              tint="sky"
              note="Za aktívny mesiac"
            />
          </div>
        )}

        {/* Namiesto listov "kto má koľko" (odstránené — user "picovina")
            je filter dropdown "Zobraz kalendár" priamo v hlavičke.
            Žiadny text tu netreba. */}
      </div>

    </section>
  );
}

/**
 * MemberList — spoločný komponent pre Realizatori aj Obhliadkári sekcie.
 * Ak user má obchod/admin rolu (showFilter=true), každý riadok je Link
 * na /calendar?filter_user=<id> — filtruje kalendár na jeho eventy.
 */
function MemberList({
  title,
  icon,
  members,
  activeFilterUserId,
  showFilter,
  emptyTint: _emptyTint,
}: {
  title: string;
  icon: React.ReactNode;
  members: Array<{
    id: string;
    name: string;
    active: number;
    scheduled: number;
    completed: number;
  }>;
  activeFilterUserId: string | null;
  showFilter: boolean;
  emptyTint: "emerald" | "violet";
}) {
  return (
    <div className="mt-2 rounded-xl border-2 border-slate-200 bg-slate-50/60 overflow-hidden">
      <header className="px-3 py-2 border-b bg-white/60 flex items-center gap-2">
        {icon}
        <h3 className="font-extrabold text-sm">
          {title} — koľko má kto
        </h3>
        {showFilter ? (
          <span className="text-[10px] text-sky-700 font-bold ml-auto inline-flex items-center gap-1">
            <Eye className="w-3 h-3" />
            klik = filter kalendára
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic ml-auto">
            aktívny + naplánované = súčasná záťaž
          </span>
        )}
      </header>
      <div className="divide-y">
        {members.map((r, i) => {
          const total = r.active + r.scheduled;
          const isActive = activeFilterUserId === r.id;
          const content = (
            <div
              className={cn(
                "px-3 py-2 flex items-center justify-between gap-3 transition-colors",
                showFilter
                  ? "cursor-pointer hover:bg-sky-50"
                  : "hover:bg-white/50",
                isActive && "bg-sky-100 ring-2 ring-sky-400 ring-inset",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "font-black tabular-nums w-6 text-center text-sm",
                    i === 0
                      ? "text-amber-600"
                      : i === 1
                        ? "text-slate-500"
                        : i === 2
                          ? "text-orange-700"
                          : "text-muted-foreground",
                  )}
                >
                  {i + 1}.
                </span>
                <div
                  className={cn(
                    "font-bold text-sm truncate",
                    isActive && "text-sky-900 font-black",
                  )}
                >
                  {r.name}
                </div>
                {isActive && (
                  <span className="text-[9px] font-black uppercase tracking-wider bg-sky-500 text-white px-1.5 py-0.5 rounded">
                    Filtrujem
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs shrink-0">
                <StatChip label="Aktívne" value={r.active} tint="emerald" />
                <StatChip
                  label="Naplánované"
                  value={r.scheduled}
                  tint="amber"
                />
                <StatChip label="Dokončené" value={r.completed} tint="sky" />
                <span className="ml-1 text-xs font-black tabular-nums text-slate-800 min-w-[24px] text-right">
                  Σ {total}
                </span>
              </div>
            </div>
          );
          if (showFilter) {
            return (
              <Link
                key={r.id}
                href={`/calendar?filter_user=${r.id}`}
                title={`Zobraz iba kalendár: ${r.name}`}
                className="block"
              >
                {content}
              </Link>
            );
          }
          return <div key={r.id}>{content}</div>;
        })}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: "emerald" | "amber" | "sky";
}) {
  const cls =
    tint === "emerald"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : tint === "amber"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-sky-100 text-sky-800 border-sky-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold",
        cls,
      )}
      title={label}
    >
      <span className="text-[9px] uppercase tracking-wider opacity-80">
        {label.slice(0, 3)}
      </span>
      <span className="tabular-nums font-black">{value}</span>
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────

type Tint = "sky" | "violet" | "emerald" | "amber" | "rose";

function PlaceholderTile({
  icon,
  label,
  tint,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  tint: Tint;
  note?: string;
}) {
  const bg = TINT_BG[tint];
  return (
    <div className={cn("rounded-xl border p-3.5 opacity-60", bg)}>
      <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-extrabold tabular-nums mt-1 text-muted-foreground">
        —
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {note ?? "postupne dopĺňame"}
      </div>
    </div>
  );
}

const TINT_BG: Record<Tint, string> = {
  sky: "bg-sky-50 border-sky-200",
  violet: "bg-violet-50 border-violet-200",
  emerald: "bg-emerald-50 border-emerald-200",
  amber: "bg-amber-50 border-amber-200",
  rose: "bg-rose-50 border-rose-200",
};

function roleLabelForStats(role: AppUserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "obchod":
      return "Obchod";
    case "obhliadky":
      return "Obhliadky";
    case "realizacie":
      return "Realizácie";
    case "office":
      return "Office";
    case "skolenie":
      return "Školenie";
  }
}
