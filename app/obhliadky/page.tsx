import { redirect } from "next/navigation";
import { CalendarDays, ClipboardList } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

import { ObhliadkaCard } from "./obhliadka-card";

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
export default async function ObhliadkyDashboard() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  // Access guard — len obhliadky + admin
  if (user.role !== "obhliadky" && user.role !== "admin") {
    const { dashboardPathForRole } = await import("@/lib/roles");
    redirect(dashboardPathForRole(user.role));
  }

  const sb = createAdminClient();

  // STRICT scope — iba obhliadky ktoré obchodník EXPLICITNE priradil tomuto
  // obhliadkárovi (`inspection_by = user.id`). Žiadne fallbacky, žiadne
  // proxy — inak by tu nabehli náhodné staré `scheduled` leady z celej DB.
  //
  // Admin bez view-as vidí VŠETKY needs_inspection (dispatcher view).
  // Admin viewing-as-obhliadky sa scopne tiež (user.id je admin ID → 0
  // results — čo je správne, admin nie je reálny obhliadkár).
  const baseQuery = sb
    .from("leads")
    .select("*")
    .eq("status", "needs_inspection")
    .order("inspection_at", { ascending: true })
    .limit(100);
  const scopedQuery =
    user.role === "admin" ? baseQuery : baseQuery.eq("inspection_by", user.id);
  const { data: leadsRaw } = await scopedQuery;
  const leads = (leadsRaw ?? []) as Lead[];

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
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-violet-500" aria-hidden />
            Obhliadky
            <span className="text-violet-500">({leads.length})</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kliknutím na kartu otvoríš detail + formulár po obhliadke.
          </p>
        </div>
      </header>

      {leads.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <div className="text-4xl mb-3">🌴</div>
          <h3 className="text-lg font-bold mb-1">Žiadne obhliadky</h3>
          <p className="text-sm text-muted-foreground">
            Obchodník ti zatiaľ nič nepriradil. Až posunie lead cez „Poslať na
            obhliadku", objaví sa tu.
          </p>
        </div>
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
