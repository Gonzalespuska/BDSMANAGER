import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  SOURCE_TYPE_LABELS,
  STATUS_META,
  type LeadStatus,
} from "@/lib/types/lead";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/leads-analytika — analytická sekcia leadov.
 *
 * Cieľ: admin vidí odkiaľ prichádzajú leady, kedy prišli, aký je trend
 * mesiac vs mesiac. Nie je to CRUD, iba read-only prehľad + charty.
 *
 * Sekcie:
 *   1) Top stats — celkom, tento mesiac vs minulý mesiac (delta %)
 *   2) Chart: % podľa zdroja (web / FB / IG / Google — Google zatiaľ 0)
 *   3) Chart: denný trend za posledných 30 dní (bar chart)
 *   4) Tabuľka — 1 riadok = 1 lead (posledných 500)
 */

interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  source_type: string;
  source_campaign: string | null;
  assigned_to: string | null;
  assigned_user_name: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

/** Skupiny zdrojov pre chart. Google zatiaľ nemáme integrované → 0. */
const SOURCE_GROUPS: {
  key: string;
  label: string;
  match: (t: string) => boolean;
  color: string; // Tailwind class fragment
  future?: boolean;
}[] = [
  {
    key: "web",
    label: "🌐 Web (epoxidovo.sk)",
    match: (t) => t === "web_webhook",
    color: "sky",
  },
  {
    key: "meta",
    label: "📘 Facebook + Instagram",
    match: (t) => t === "facebook" || t === "instagram",
    color: "violet",
  },
  {
    key: "google",
    label: "🔍 Google (plánované)",
    match: (t) => t === "google",
    color: "amber",
    future: true,
  },
  {
    key: "manual",
    label: "✍️ Manuálne / iné",
    match: (t) =>
      !["web_webhook", "facebook", "instagram", "google"].includes(t),
    color: "zinc",
  },
];

export default async function AdminLeadsAnalytika() {
  const sb = createAdminClient();

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const since30 = new Date(now.getTime() - 30 * 86400_000);

  // ─── Načítaj posledných 500 leadov + count-agregácie ────────────────
  const [
    leadsRes,
    { count: totalLeads },
    { count: thisMonthCount },
    { count: lastMonthCount },
    { count: since30Count },
  ] = await Promise.all([
    sb
      .from("leads")
      .select(
        "id, name, phone, email, status, source_type, source_campaign, assigned_to, created_at, data",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("leads").select("*", { count: "exact", head: true }),
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thisMonthStart.toISOString()),
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", lastMonthStart.toISOString())
      .lt("created_at", lastMonthEnd.toISOString()),
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since30.toISOString()),
  ]);

  const leadsRaw = leadsRes.data ?? [];

  // Enrich assigned_user_name
  const userIds = Array.from(
    new Set(
      leadsRaw
        .map((l) => l.assigned_to as string | null)
        .filter((x): x is string => !!x),
    ),
  );
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", userIds);
    for (const u of users ?? []) {
      userMap.set(
        u.id as string,
        ((u.name as string) || (u.email as string)) ?? "",
      );
    }
  }

  const leads: LeadRow[] = leadsRaw.map((l) => ({
    id: l.id as string,
    name: (l.name as string) ?? "",
    phone: (l.phone as string) ?? null,
    email: (l.email as string) ?? null,
    status: (l.status as LeadStatus) ?? "new",
    source_type: (l.source_type as string) ?? "other",
    source_campaign: (l.source_campaign as string) ?? null,
    assigned_to: (l.assigned_to as string) ?? null,
    assigned_user_name: l.assigned_to
      ? (userMap.get(l.assigned_to as string) ?? null)
      : null,
    created_at: (l.created_at as string) ?? "",
    data: (l.data as Record<string, unknown>) ?? {},
  }));

  // ─── Source distribution (na základe VŠETKÝCH leadov — spočítame v DB) ──
  // Kvôli edge runtime a bez groupBy použijeme jednoduché heads-count queries.
  const sourceCounts: Record<string, number> = {};
  await Promise.all(
    SOURCE_GROUPS.map(async (g) => {
      // Group by "match" logic — jednoducho spočítame per canonical type,
      // manual/iné = total - (ostatné 3).
      if (g.key === "web") {
        const { count } = await sb
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("source_type", "web_webhook");
        sourceCounts[g.key] = count ?? 0;
      } else if (g.key === "meta") {
        const { count } = await sb
          .from("leads")
          .select("*", { count: "exact", head: true })
          .in("source_type", ["facebook", "instagram"]);
        sourceCounts[g.key] = count ?? 0;
      } else if (g.key === "google") {
        const { count } = await sb
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("source_type", "google");
        sourceCounts[g.key] = count ?? 0;
      }
      // manual počítame na konci ako zvyšok
    }),
  );
  sourceCounts.manual =
    (totalLeads ?? 0) -
    (sourceCounts.web ?? 0) -
    (sourceCounts.meta ?? 0) -
    (sourceCounts.google ?? 0);

  // ─── 30-day daily trend — počty za posledných 30 dní z leads listu ───
  // Použijeme leadsRaw (500 records) — pri < 500 leadov za 30 dní je to presné.
  // Pri viac by sme šli cez samostatné agregáty; pre náš scale to je OK.
  const dayBuckets = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    dayBuckets.set(key, 0);
  }
  for (const l of leadsRaw) {
    const key = (l.created_at as string).slice(0, 10);
    if (dayBuckets.has(key)) {
      dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
    }
  }
  const dailyData = Array.from(dayBuckets.entries()).map(([date, count]) => ({
    date,
    count,
  }));
  const maxDailyCount = Math.max(1, ...dailyData.map((d) => d.count));

  // ─── Month-over-month delta ─────────────────────────────────────────
  const thisM = thisMonthCount ?? 0;
  const lastM = lastMonthCount ?? 0;
  const momDelta = lastM > 0 ? ((thisM - lastM) / lastM) * 100 : null;

  // Total pre percent kalkulácie (source chart)
  const totalForSource = Math.max(1, totalLeads ?? 0);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-sky-500" aria-hidden />
          Analytika leadov
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Odkiaľ chodia leady, mesiac vs mesiac, tabuľka posledných 500.
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
            🚧 Google integrácia plánovaná
          </span>
        </p>
      </header>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat
          label="Leady spolu"
          value={totalLeads ?? 0}
          hint="celá história"
          tint="sky"
        />
        <BigStat
          label="Tento mesiac"
          value={thisM}
          hint={now.toLocaleDateString("sk-SK", { month: "long" })}
          tint="emerald"
        />
        <BigStat
          label="Minulý mesiac"
          value={lastM}
          hint={lastMonthStart.toLocaleDateString("sk-SK", { month: "long" })}
          tint="violet"
        />
        <DeltaStat delta={momDelta} thisM={thisM} lastM={lastM} />
      </div>

      {/* Source chart + daily trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SOURCE % chart */}
        <section className="rounded-2xl border bg-background overflow-hidden">
          <header className="px-4 py-3 border-b bg-muted/30">
            <h2 className="font-bold inline-flex items-center gap-2">
              🥧 Zdroje leadov
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Distribúcia celkovej histórie leadov podľa zdroja.
            </p>
          </header>
          <div className="p-4 space-y-3">
            {SOURCE_GROUPS.map((g) => {
              const count = sourceCounts[g.key] ?? 0;
              const pct = (count / totalForSource) * 100;
              return (
                <div key={g.key} className={cn(g.future && "opacity-70")}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold inline-flex items-center gap-1.5">
                      {g.label}
                      {g.future && (
                        <span className="text-[9px] uppercase font-bold bg-amber-200 text-amber-900 px-1 py-0.5 rounded">
                          plánované
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums font-bold">
                      {count}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({pct.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        g.color === "sky" && "bg-sky-500",
                        g.color === "violet" && "bg-violet-500",
                        g.color === "amber" && "bg-amber-400",
                        g.color === "zinc" && "bg-zinc-400",
                      )}
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* DAILY 30-day trend */}
        <section className="rounded-2xl border bg-background overflow-hidden">
          <header className="px-4 py-3 border-b bg-muted/30">
            <h2 className="font-bold inline-flex items-center gap-2">
              📈 Denný trend (30 dní)
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Počet leadov za posledných 30 dní. Total ={" "}
              <strong>{since30Count ?? 0}</strong>.
            </p>
          </header>
          <div className="p-4">
            <div className="flex items-end gap-0.5 h-32">
              {dailyData.map((d) => {
                const heightPct = (d.count / maxDailyCount) * 100;
                const dayNum = new Date(d.date).getDate();
                const isFirst = dayNum === 1;
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center gap-0.5 group relative"
                    title={`${d.date}: ${d.count} lead(ov)`}
                  >
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={cn(
                          "w-full rounded-t transition-colors",
                          d.count === 0
                            ? "bg-zinc-100"
                            : "bg-sky-400 group-hover:bg-sky-600",
                        )}
                        style={{
                          height: `${Math.max(heightPct, d.count > 0 ? 5 : 2)}%`,
                        }}
                      />
                    </div>
                    <div
                      className={cn(
                        "text-[9px] tabular-nums",
                        isFirst
                          ? "font-bold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {dayNum}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 text-center">
              Deň v mesiaci (1. je zvýraznená) · Max/deň: {maxDailyCount}
            </div>
          </div>
        </section>
      </div>

      {/* Leads table */}
      <section className="rounded-2xl border bg-background overflow-hidden">
        <header className="px-4 py-3 border-b bg-muted/30">
          <h2 className="font-bold inline-flex items-center gap-2">
            📋 Všetky leady{" "}
            <span className="text-muted-foreground font-normal text-sm">
              ({leads.length})
            </span>
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            1 riadok = 1 lead. Posledných 500 zoradených od najnovšieho.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <th className="text-left px-3 py-2">Kedy</th>
                <th className="text-left px-3 py-2">Meno</th>
                <th className="text-left px-3 py-2">Zdroj</th>
                <th className="text-left px-3 py-2">Kampaň</th>
                <th className="text-left px-3 py-2">Kontakt</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Obchodník</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDateShort(l.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/agent/leads/${l.id}`}
                      className="font-bold text-sm hover:underline decoration-dotted"
                    >
                      {l.name || (
                        <span className="text-muted-foreground italic">
                          bez mena
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {SOURCE_TYPE_LABELS[l.source_type] ?? l.source_type}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground truncate max-w-[180px]">
                    {l.source_campaign ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    <div className="truncate max-w-[160px]">
                      {l.phone ?? l.email ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap",
                        STATUS_META[l.status]?.pill ??
                          "bg-zinc-400 text-white",
                      )}
                    >
                      {STATUS_META[l.status]?.label ?? l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {l.assigned_user_name ? (
                      <Link
                        href={`/admin/agents/${l.assigned_to}`}
                        className="text-sky-700 hover:underline decoration-dotted"
                      >
                        {l.assigned_user_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground italic">
                        nepridelený
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-muted-foreground italic text-sm"
                  >
                    Zatiaľ žiadne leady.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer note */}
      <div className="text-[11px] text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <strong>🚧 Google leads (plánované):</strong> Google integrácia zatiaľ
        nie je zapnutá — leady chodia iba z webu (epoxidovo.sk) a Meta
        (Facebook + Instagram cez Zapier). Google Ads leadgen sa pridá keď bude
        aktívna kampaň.
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function BigStat({
  label,
  value,
  hint,
  tint,
}: {
  label: string;
  value: number;
  hint?: string;
  tint: "sky" | "emerald" | "violet";
}) {
  const bg = {
    sky: "bg-sky-50 border-sky-200",
    emerald: "bg-emerald-50 border-emerald-200",
    violet: "bg-violet-50 border-violet-200",
  }[tint];
  return (
    <div className={cn("rounded-xl border p-4", bg)}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div className="text-3xl font-extrabold tabular-nums mt-1">{value}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">
          {hint}
        </div>
      )}
    </div>
  );
}

function DeltaStat({
  delta,
  thisM,
  lastM,
}: {
  delta: number | null;
  thisM: number;
  lastM: number;
}) {
  if (delta === null) {
    return (
      <div className="rounded-xl border p-4 bg-zinc-50 border-zinc-200">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          Zmena m-o-m
        </div>
        <div className="text-2xl font-extrabold tabular-nums mt-1 text-muted-foreground">
          —
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Minulý mesiac 0 leadov (nedá sa porovnať)
        </div>
      </div>
    );
  }
  const positive = delta >= 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        positive
          ? "bg-emerald-50 border-emerald-200"
          : "bg-rose-50 border-rose-200",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        Zmena m-o-m
      </div>
      <div
        className={cn(
          "text-3xl font-extrabold tabular-nums mt-1 inline-flex items-center gap-1.5",
          positive ? "text-emerald-800" : "text-rose-800",
        )}
      >
        {positive ? (
          <TrendingUp className="w-6 h-6" aria-hidden />
        ) : (
          <TrendingDown className="w-6 h-6" aria-hidden />
        )}
        {positive ? "+" : ""}
        {delta.toFixed(1)}%
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {thisM} vs {lastM} minulý mesiac
      </div>
    </div>
  );
}

function formatDateShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
