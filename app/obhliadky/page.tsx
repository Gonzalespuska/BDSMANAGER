import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardList } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

import { ObhliadkaCard } from "./obhliadka-card";
import { JustSubmittedBanner } from "./just-submitted-banner";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /obhliadky — Dashboard pre obhliadkára.
 *
 * MINIMAL: obhliadkar vidí IBA dátum, m², číslo klienta a meno. Nič viac.
 * Prípadne poznámku od obchodníka (dôležité: „prístup zo dvora"...).
 *
 * Zoskupené podľa dňa. Zoradené vzostupne (najbližšia obhliadka hore).
 * Klik na kartu → detail obhliadky (formulár na zápis výsledku).
 */
export default async function ObhliadkyDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    justSubmitted?: string;
    m2?: string;
    moist?: string;
    adh?: string;
    photos?: string;
  }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  // Access guard — len obhliadky + admin
  if (user.role !== "obhliadky" && user.role !== "admin") {
    const { dashboardPathForRole } = await import("@/lib/roles");
    redirect(dashboardPathForRole(user.role));
  }

  const sp = await searchParams;
  const activeTab = sp.tab === "hotove" ? "hotove" : "aktivne";
  const justSubmitted = sp.justSubmitted ?? null;
  // Fetch meno tej práve odoslanej obhliadky pre banner
  let justSubmittedName: string | null = null;
  if (justSubmitted) {
    try {
      const sbTmp = createAdminClient();
      const { data: l } = await sbTmp
        .from("leads")
        .select("name")
        .eq("id", justSubmitted)
        .maybeSingle();
      justSubmittedName = (l?.name as string) ?? null;
    } catch {
      /* ignore */
    }
  }

  const sb = createAdminClient();

  // STRICT scope — iba obhliadky priradené tomuto obhliadkárovi
  // (`inspection_by = user.id`). Admin bez view-as vidí všetky.
  //
  // Aktívne tab: status = needs_inspection (čakajú na obhliadku)
  // Hotové tab: status = inspected (obhliadka HOTOVÁ, obchodák si pozerá)
  const targetStatus =
    activeTab === "hotove" ? "inspected" : "needs_inspection";
  const orderCol =
    activeTab === "hotove" ? "last_activity_at" : "inspection_at";
  const orderAsc = activeTab === "aktivne";

  const baseQuery = sb
    .from("leads")
    .select("*")
    .eq("status", targetStatus)
    .order(orderCol, { ascending: orderAsc })
    .limit(100);
  const scopedQuery =
    user.role === "admin" ? baseQuery : baseQuery.eq("inspection_by", user.id);
  const { data: leadsRaw } = await scopedQuery;
  const leads = (leadsRaw ?? []) as Lead[];

  // Counts pre bedge — koľko je aktívnych vs. hotových
  const countQuery = (status: string) => {
    const q = sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return user.role === "admin" ? q : q.eq("inspection_by", user.id);
  };
  const [{ count: countAktivne }, { count: countHotove }] = await Promise.all([
    countQuery("needs_inspection"),
    countQuery("inspected"),
  ]);

  // Get dátum z lead-u — prefer inspection_at, fallback next_callback_at
  function getDate(l: Lead): Date | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyL = l as any;
    const raw =
      anyL.inspection_at ??
      l.next_callback_at ??
      (l.data as Record<string, unknown>)?.inspection_scheduled_at ??
      null;
    if (!raw) return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  }

  // Zoskupí podľa dátumu (YYYY-MM-DD)
  const grouped = new Map<string, Lead[]>();
  const undated: Lead[] = [];
  for (const l of leads) {
    const d = getDate(l);
    if (!d) {
      undated.push(l);
      continue;
    }
    const key = d.toISOString().slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(l);
  }
  const sortedKeys = Array.from(grouped.keys()).sort();

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {justSubmitted && (
        <JustSubmittedBanner
          leadName={justSubmittedName ?? "Obhliadka"}
          m2={sp.m2 ?? ""}
          moist={sp.moist ?? ""}
          adh={sp.adh ?? ""}
          photos={sp.photos ?? "0"}
        />
      )}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-violet-500" aria-hidden />
            Obhliadky
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === "aktivne"
              ? "Aktívne obhliadky — kliknutím otvoríš detail + wizard po obhliadke."
              : "Obhliadnuté — čo si už obhliadol a odoslal obchodníkovi. Zoradené od najnovšej."}
          </p>
        </div>
      </header>

      {/* Tabs — Aktívne / Hotové */}
      <div className="inline-flex rounded-xl border-2 bg-background p-1 gap-1">
        <Link
          href="/obhliadky"
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
            activeTab === "aktivne"
              ? "bg-violet-500 text-white shadow-sm"
              : "text-muted-foreground hover:bg-violet-50 hover:text-violet-700",
          )}
        >
          <ClipboardList className="w-4 h-4" aria-hidden />
          Aktívne
          <span
            className={cn(
              "text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded",
              activeTab === "aktivne" ? "bg-white/20" : "bg-violet-100 text-violet-700",
            )}
          >
            {countAktivne ?? 0}
          </span>
        </Link>
        <Link
          href="/obhliadky?tab=hotove"
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
            activeTab === "hotove"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700",
          )}
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden />
          Obhliadnuté
          <span
            className={cn(
              "text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded",
              activeTab === "hotove" ? "bg-white/20" : "bg-emerald-100 text-emerald-700",
            )}
          >
            {countHotove ?? 0}
          </span>
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <div className="text-4xl mb-3">🌴</div>
          <h3 className="text-lg font-bold mb-1">
            {activeTab === "hotove"
              ? "Zatiaľ žiadne hotové obhliadky"
              : "Žiadne aktívne obhliadky"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {activeTab === "hotove"
              ? "Až dokončíš prvú obhliadku a odošleš cez wizard, zjaví sa tu."
              : `Obchodník ti zatiaľ nič nepriradil. Až posunie lead cez „Poslať na obhliadku", objaví sa tu.`}
          </p>
        </div>
      ) : activeTab === "hotove" ? (
        // Hotové = flat list zoradený podľa času odoslania obhliadky
        // (last_activity_at DESC). Date grouping tu nedáva zmysel — user
        // len chce vidieť "ktoré som obhliadol nedávno".
        <ul className="space-y-2">
          {leads.map((l) => (
            <ObhliadkaCard key={l.id} lead={l} />
          ))}
        </ul>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map((dateKey) => {
            const dayLeads = grouped.get(dateKey)!;
            const d = new Date(dateKey + "T00:00:00");
            const isToday = dateKey === todayKey;
            const isPast = dateKey < todayKey;
            return (
              <section key={dateKey}>
                <h2
                  className={cn(
                    "text-sm font-extrabold uppercase tracking-widest mb-2 inline-flex items-center gap-2",
                    isToday && "text-rose-600",
                    isPast && "text-muted-foreground",
                    !isToday && !isPast && "text-violet-800",
                  )}
                >
                  <CalendarDays className="w-4 h-4" aria-hidden />
                  {d.toLocaleDateString("sk-SK", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {isToday && (
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                      DNES
                    </span>
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {dayLeads.length}× obhliadka
                  </span>
                </h2>
                <ul className="space-y-2">
                  {dayLeads.map((l) => (
                    <ObhliadkaCard key={l.id} lead={l} />
                  ))}
                </ul>
              </section>
            );
          })}

          {undated.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2 inline-flex items-center gap-2">
                <CalendarDays className="w-4 h-4" aria-hidden />
                Bez presného termínu
                <span className="text-[10px] font-bold uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {undated.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {undated.map((l) => (
                  <ObhliadkaCard key={l.id} lead={l} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ObhliadkaCard je vyextrahovaný do samostatného client-file
// `./obhliadka-card.tsx` — má onClick handler ktorý v RSC nie je dovolený.
