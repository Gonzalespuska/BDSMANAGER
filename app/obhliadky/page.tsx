import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  MapPin,
  Phone,
  Ruler,
  StickyNote,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneSK } from "@/lib/phone-format";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

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

  // Primary query — needs_inspection status (po SQL migrácii 10)
  const baseQuery = sb
    .from("leads")
    .select("*")
    .eq("status", "needs_inspection")
    .order("inspection_at", { ascending: true })
    .limit(100);
  const scopedQuery =
    user.role === "admin" ? baseQuery : baseQuery.eq("inspection_by", user.id);
  const { data: leadsRaw, error: needsErr } = await scopedQuery;

  // Fallback pre pre-migration DB
  let fallbackLeads: Lead[] = [];
  if (needsErr || (leadsRaw?.length ?? 0) === 0) {
    const { data } = await sb
      .from("leads")
      .select("*")
      .in("status", ["scheduled", "needs_inspection"])
      .order("next_callback_at", { ascending: true })
      .limit(100);
    fallbackLeads = (data ?? []) as Lead[];
  }

  const leads = ((leadsRaw ?? []) as Lead[]).length > 0
    ? (leadsRaw as Lead[])
    : fallbackLeads;
  const showLegacyProxy = fallbackLeads.length > 0 && (leadsRaw?.length ?? 0) === 0;

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

      {/* Pre-migration proxy warning — malý, nevoluje */}
      {showLegacyProxy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-900">
          🚧 Zobrazujem legacy (scheduled). Po spustení{" "}
          <code>10_role_handoff.sql</code> sa zobrazí iba to čo ti obchodák
          explicitne priradí.
        </div>
      )}

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

// ────────────────────────────────────────────────────────────────────────

function ObhliadkaCard({ lead }: { lead: Lead }) {
  const data = (lead.data ?? {}) as Record<string, string>;
  const date = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyL = lead as any;
    const raw =
      anyL.inspection_at ??
      lead.next_callback_at ??
      data.inspection_scheduled_at ??
      null;
    if (!raw) return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  })();
  const time = date
    ? date.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
    : null;

  const note =
    data.inspection_note ||
    data.agent_note ||
    (lead.data as Record<string, unknown>).inspection_note as string | undefined ||
    "";

  return (
    <li>
      <Link
        href={`/obhliadky/${lead.id}`}
        className="block rounded-xl border-2 border-violet-200 bg-background p-4 hover:border-violet-400 hover:bg-violet-50/30 transition-all shadow-sm hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* LEFT — meno + telefón */}
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-lg leading-tight">
              {lead.name}
            </div>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 mt-1 text-sm font-bold text-emerald-700 hover:text-emerald-800 tabular-nums"
              >
                <Phone className="w-3.5 h-3.5" aria-hidden />
                {formatPhoneSK(lead.phone)}
              </a>
            )}
          </div>

          {/* RIGHT — čas */}
          {time && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Čas
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-violet-700">
                {time}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM — m², lokalita, typ podlahy */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          {data.plocha && (
            <span className="inline-flex items-center gap-1 font-bold text-foreground">
              <Ruler className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              {data.plocha} m²
            </span>
          )}
          {data.lokalita && (
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              {data.lokalita}
            </span>
          )}
          {data.typ_podlahy && (
            <span className="text-xs text-muted-foreground">
              🎨 {data.typ_podlahy}
            </span>
          )}
          {data.priestor && (
            <span className="text-xs text-muted-foreground">
              🏠 {data.priestor}
            </span>
          )}
        </div>

        {/* Poznámka od obchodníka (ak existuje) */}
        {note && (
          <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
            <StickyNote className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden />
            <div className="text-[12px] text-amber-900 leading-snug">
              <strong className="font-bold">Od obchodníka:</strong> {note}
            </div>
          </div>
        )}
      </Link>
    </li>
  );
}
