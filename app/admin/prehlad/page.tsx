import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Calendar,
  ClipboardList,
  Eye,
  Hammer,
  Phone,
  TrendingUp,
} from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentLiveWrapper } from "@/components/agent-live-wrapper";
import { STATUS_META, type LeadStatus } from "@/lib/types/lead";
import { fetchTestUserIds } from "@/lib/test-account";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/prehlad — admin supervision dashboard.
 *
 * Read-only audit view: admin si raz za čas otvorí túto stránku a vidí
 * v jednom screene čo sa deje vo všetkých 3 rolách:
 *   • LEADY (obchod) — posledné prijaté leady + ich status
 *   • OBHLIADKY — posledné naplánované + odobehnuté
 *   • REALIZÁCIE — aktívne zákazky + posledné dokončené
 *
 * Cieľ: admin overí že tím tečie, neexistuje strangle point, a ak vidí
 * problém (napr. 0 odobehnutých obhliadok za 7 dní), môže si zavolať
 * obhliadkára.
 */
export default async function PrehladPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sb = createAdminClient();

  // ─── TEST ACCOUNT FILTER ──────────────────────────────────────────────
  // info@epoxidovo.sk (Mário Vitáz) je tester — NESMIE sa objaviť
  // v žiadnych admin štatistikách. Filter aplikujeme na všetkých
  // úrovniach (recentLeads, obhliadky, realizácie, top obchodáci,
  // activity log, hourly chart).
  const testUserIds = await fetchTestUserIds(sb);
  const isTestAssigned = (assignedTo: string | null | undefined) =>
    !!assignedTo && testUserIds.has(assignedTo);
  const notTest = <T extends { assigned_to?: string | null }>(l: T) =>
    !isTestAssigned(l.assigned_to);

  const now = Date.now();
  const nowDate = new Date(now);
  const since7 = new Date(now - 7 * 86400_000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60_000).toISOString();
  const monthStart = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    1,
  ).toISOString();
  const monthLabel = nowDate.toLocaleDateString("sk-SK", { month: "long" });

  // ─── m² štatistika — DOKONČENÉ zákazky ─────────────────────────────
  // Nová definícia "dokončené" (per user spec):
  //   1) Obchodák posunul lead na obhliadku (inspection_at set alebo
  //      status prešiel needs_inspection)
  //   2) Z obhliadky posunul na realizáciu s dátumom (realization_at set)
  //   3) realization_at už uplynul (date <= now)
  //   4) NEBOL zrušený manuálne (status ≠ lost/archived)
  //
  // Tento rule odpovedá reálnemu behu: obchodák dal termín realizácie,
  // termín prešiel, ergo zákazka je považovaná za urobenú, aj bez toho
  // aby realizátor manuálne označil dokončenie.
  const nowIso = nowDate.toISOString();
  const doneBase = () =>
    sb
      .from("leads")
      .select("data, assigned_to, realization_at, status")
      .not("realization_at", "is", null)
      .lte("realization_at", nowIso)
      .not("status", "in", "(lost,archived,no_answer,not_interested)");
  const [wonAll, wonMonth, won7d] = await Promise.all([
    doneBase(),
    doneBase().gte("realization_at", monthStart),
    doneBase().gte("realization_at", since7),
  ]);

  function sumM2(
    rows: Array<{ data: unknown; assigned_to?: string | null }> | null,
  ): number {
    if (!rows) return 0;
    return rows
      .filter((r) => !isTestAssigned(r.assigned_to))
      .reduce((sum, r) => {
        const d = (r.data as Record<string, unknown>) ?? {};
        const p = d.plocha;
        const n =
          typeof p === "number"
            ? p
            : typeof p === "string"
              ? parseFloat(p.replace(",", "."))
              : 0;
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
  }
  function countReal(
    rows: Array<{ assigned_to?: string | null }> | null,
  ): number {
    return (rows ?? []).filter((r) => !isTestAssigned(r.assigned_to)).length;
  }

  const m2Total = sumM2(wonAll.data);
  const m2Month = sumM2(wonMonth.data);
  const m27d = sumM2(won7d.data);
  const jobsTotal = countReal(wonAll.data);
  const jobsMonth = countReal(wonMonth.data);
  const jobs7d = countReal(won7d.data);

  // ─── 1) LEADY (CP POSLANÁ) — posledných 10 s cenovou ponukou ─────────
  // Fetch trochu viac (20) aby po filtrovaní test-userov zostalo ~10.
  const { data: recentLeadsRaw } = await sb
    .from("leads")
    .select("id, name, status, source_type, created_at, assigned_to, phone_revealed_at, value_estimate")
    .eq("status", "quote_sent")
    .order("last_activity_at", { ascending: false })
    .limit(20);
  const recentLeads = (recentLeadsRaw ?? []).filter(notTest).slice(0, 10);

  // ─── Analytika: hodinový trend + zdroje + delta ───────────────────────
  // Načítaj až 500 leadov posledných 30 dní pre grafy + zdroj distribúciu
  const analyticsSinceIso = new Date(now - 30 * 86400_000).toISOString();
  const { data: analyticsLeads } = await sb
    .from("leads")
    .select("id, source_type, created_at, assigned_to, status")
    .gte("created_at", analyticsSinceIso)
    .order("created_at", { ascending: false })
    .limit(500);
  // Filter test-account (Mário Vitáz) z analytiky — jeho leady sú
  // demo/testovacie a skreslujú štatistiky.
  const leadsForAnalytics = (analyticsLeads ?? []).filter(notTest);

  // Zdroje distribúcia (počet + %)
  const srcCounts: Record<string, number> = {};
  for (const l of leadsForAnalytics)
    srcCounts[(l.source_type as string) ?? "other"] =
      (srcCounts[(l.source_type as string) ?? "other"] ?? 0) + 1;
  const totalForSrc = Math.max(1, leadsForAnalytics.length);
  const sourceGroups = [
    { key: "web", label: "🌐 Web", tint: "sky", count: srcCounts.web_webhook ?? 0 },
    {
      key: "meta",
      label: "📘 FB + IG",
      tint: "violet",
      count: (srcCounts.facebook ?? 0) + (srcCounts.instagram ?? 0),
    },
    {
      key: "google",
      label: "🔍 Google",
      tint: "amber",
      count: srcCounts.google ?? 0,
    },
    { key: "manual", label: "✍️ Manuál", tint: "zinc", count: srcCounts.manual ?? 0 },
  ];

  // Hodinový trend pre DNES
  const todayStr = nowDate.toISOString().slice(0, 10);
  const hourlyBuckets = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourlyBuckets.set(h, 0);
  for (const l of leadsForAnalytics) {
    const iso = l.created_at as string;
    if (!iso?.startsWith(todayStr)) continue;
    const hour = new Date(iso).getHours();
    hourlyBuckets.set(hour, (hourlyBuckets.get(hour) ?? 0) + 1);
  }
  const hourlyData = Array.from(hourlyBuckets.entries()).map(([hour, count]) => ({
    hour,
    count,
  }));
  const maxHourlyCount = Math.max(1, ...hourlyData.map((d) => d.count));
  const todayTotal = hourlyData.reduce((s, d) => s + d.count, 0);
  const currentHour = nowDate.getHours();

  // Delta — tempo tento mesiac vs minulý mesiac (fair pace, nie total)
  const lastMonthStart = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth() - 1,
    1,
  );
  const lastMonthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const [
    { count: thisMonthCount },
    { count: lastMonthCount },
  ] = await Promise.all([
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStart),
    sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", lastMonthStart.toISOString())
      .lt("created_at", lastMonthEnd.toISOString()),
  ]);
  const dayOfMonth = nowDate.getDate();
  const daysInLastMonth = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    0,
  ).getDate();
  const thisPace = (thisMonthCount ?? 0) / Math.max(1, dayOfMonth);
  const lastPace = (lastMonthCount ?? 0) / Math.max(1, daysInLastMonth);
  const momDelta = lastPace > 0 ? ((thisPace - lastPace) / lastPace) * 100 : null;

  // Agents top 4 — počet leadov za 30d
  const agentTotals = new Map<string, number>();
  for (const l of leadsForAnalytics) {
    const aid = l.assigned_to as string | null;
    if (!aid) continue;
    agentTotals.set(aid, (agentTotals.get(aid) ?? 0) + 1);
  }
  const analyticsAgentIds = Array.from(agentTotals.keys());
  const analyticsAgentMap = new Map<string, string>();
  if (analyticsAgentIds.length > 0) {
    const { data: ausers } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", analyticsAgentIds);
    for (const u of ausers ?? [])
      analyticsAgentMap.set(u.id, u.name || u.email);
  }
  const agentTopList = Array.from(agentTotals.entries())
    .map(([id, total]) => ({ id, name: analyticsAgentMap.get(id) ?? "?", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  // ─── Activity log — posledných 150 akcií naprieč tímom ────────────────
  // Načítame trochu viac (300) aby po filtrovaní test-usera zostalo
  // reálne 150 akcií z živých obchodáckych účtov.
  const { data: rawActivities } = await sb
    .from("lead_activities")
    .select("id, lead_id, user_id, type, data, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  // Filter: akcie testera (Mário Vitáz) skryjeme.
  const activities = (rawActivities ?? []).filter(
    (a) => !a.user_id || !testUserIds.has(a.user_id as string),
  );

  // Enrich activities: user name + lead name
  const activityUserIds = new Set<string>();
  const activityLeadIds = new Set<string>();
  for (const a of activities) {
    if (a.user_id) activityUserIds.add(a.user_id as string);
    if (a.lead_id) activityLeadIds.add(a.lead_id as string);
  }
  const [activityUsersRes, activityLeadsRes] = await Promise.all([
    activityUserIds.size > 0
      ? sb.from("users").select("id, name, email").in("id", Array.from(activityUserIds))
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; email: string }> }),
    activityLeadIds.size > 0
      ? sb.from("leads").select("id, name, assigned_to").in("id", Array.from(activityLeadIds))
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; assigned_to: string | null }> }),
  ]);
  const activityUserMap = new Map<string, string>();
  for (const u of activityUsersRes.data ?? [])
    activityUserMap.set(u.id, u.name || u.email);
  const activityLeadMap = new Map<string, string>();
  const activityLeadAssignedMap = new Map<string, string | null>();
  for (const l of activityLeadsRes.data ?? []) {
    activityLeadMap.set(l.id, l.name);
    activityLeadAssignedMap.set(l.id, l.assigned_to ?? null);
  }

  // Fetch assigned obchodák names ktorí nie sú v activityUserMap
  const missingAssignedIds = new Set<string>();
  Array.from(activityLeadAssignedMap.values()).forEach((aid) => {
    if (aid && !activityUserMap.has(aid)) missingAssignedIds.add(aid);
  });
  if (missingAssignedIds.size > 0) {
    const { data: extraUsers } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", Array.from(missingAssignedIds));
    for (const u of extraUsers ?? [])
      activityUserMap.set(u.id, u.name || u.email);
  }

  // Lead counts — filter test-usera (Mário Vitáz) v JS. Nefiltrujeme
  // priamo v query, lebo Supabase .or() s .not.in nie je 100% spoľahlivé
  // pri head:true count.
  const [leadsTotalRes, leads24hRes, leadsStaleUncalledRes] = await Promise.all([
    sb.from("leads").select("assigned_to"),
    sb.from("leads").select("assigned_to").gte("created_at", since24h),
    sb
      .from("leads")
      .select("assigned_to")
      .is("phone_revealed_at", null)
      .lt("created_at", since24h)
      .not("status", "in", "(lost,archived,unreachable,not_interested)"),
  ]);
  const leadsTotal = (leadsTotalRes.data ?? []).filter(notTest).length;
  const leads24h = (leads24hRes.data ?? []).filter(notTest).length;
  const leadsStaleUncalled = (leadsStaleUncalledRes.data ?? []).filter(notTest)
    .length;
  // Pipeline stats — TENTO MESIAC (reset na 1.). Filter test-user.
  const { data: leadsQuoteSentAll } = await sb
    .from("leads")
    .select("assigned_to")
    .eq("status", "quote_sent")
    .gte("last_activity_at", monthStart);
  const leadsQuoteSent = (leadsQuoteSentAll ?? []).filter(notTest).length;

  // ─── 2) OBHLIADKY — leady so status "scheduled"/"interested" ─────────
  // Fetchujeme viac (20) a filter tester → zostane realistický zoznam.
  const { data: recentObhliadkyRaw } = await sb
    .from("leads")
    .select("id, name, status, next_callback_at, last_activity_at, assigned_to, data")
    .in("status", ["scheduled", "interested", "needs_inspection"])
    .order("last_activity_at", { ascending: false })
    .limit(20);
  const recentObhliadky = (recentObhliadkyRaw ?? []).filter(notTest).slice(0, 10);

  // Count "otvorených" obhliadok — vylúčime test-usera z celkovej sumy
  const { data: obhliadkyOpenAll } = await sb
    .from("leads")
    .select("assigned_to")
    .in("status", ["scheduled", "interested", "needs_inspection"])
    .gte("last_activity_at", monthStart);
  const obhliadkyOpen = (obhliadkyOpenAll ?? []).filter(notTest).length;

  // ─── 3) REALIZÁCIE — leady v realizácii (in_realization) alebo
  //     už dokončené za tento mesiac (realization_at <= now). ─────────
  const { data: recentRealizacieRaw } = await sb
    .from("leads")
    .select("id, name, status, last_activity_at, value_estimate, assigned_to, data, realization_at")
    .in("status", ["in_realization", "won", "quote_sent"])
    .order("last_activity_at", { ascending: false })
    .limit(20);
  const recentRealizacie = (recentRealizacieRaw ?? [])
    .filter(notTest)
    .slice(0, 10);

  const { data: realizacieActiveAll } = await sb
    .from("leads")
    .select("assigned_to")
    .in("status", ["in_realization", "won"])
    .gte("last_activity_at", monthStart);
  const realizacieActive = (realizacieActiveAll ?? []).filter(notTest).length;

  // ─── Resolve assigned user names ──────────────────────────────────────
  const allAssigned = new Set<string>();
  for (const arr of [recentLeads, recentObhliadky, recentRealizacie] as const) {
    for (const l of arr ?? []) {
      if (l.assigned_to) allAssigned.add(l.assigned_to);
    }
  }
  const userMap = new Map<string, string>();
  if (allAssigned.size > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", Array.from(allAssigned));
    for (const u of users ?? []) {
      userMap.set(u.id, u.name || u.email);
    }
  }

  return (
    <AgentLiveWrapper>
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Eye className="w-6 h-6 text-sky-500" aria-hidden />
          Prehľad — supervision
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only audit view. Admin tu nič nemení — len overuje že tím
          tečie, nedochádza k stagnácii a všetky 3 role pracujú.
        </p>
      </header>

      {/* ─── m² štatistika — dokončené realizácie ─── */}
      <section className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-50/70 to-transparent p-4">
        <header className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-emerald-900">
            📐 Dokončené m² (realizácie)
          </h2>
          <span className="text-[10px] text-emerald-700 font-semibold">
            realization_at ≤ dnes · nezrušené
          </span>
        </header>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <M2Tile label="Za 7 dní" value={m27d} count={jobs7d} tint="emerald" />
          <M2Tile
            label={`Tento mesiac (${monthLabel})`}
            value={m2Month}
            count={jobsMonth}
            tint="emerald"
          />
          <M2Tile
            label="Celkovo"
            value={m2Total}
            count={jobsTotal}
            tint="emerald"
            highlighted
          />
        </div>
      </section>

      {/* Top stats — leady všeobecne. „Leady spolu" je klikateľné →
          /admin/leads (activity log: kedy, odkiaľ, kto má pridelené). */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<Phone className="w-4 h-4 text-sky-600" />}
          label="Leady spolu"
          value={leadsTotal ?? 0}
          tint="sky"
          href="/admin/leads"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-sky-600" />}
          label="Nové za 24h"
          value={leads24h ?? 0}
          tint="sky"
          href="/admin/leads?range=24h"
        />
        <StatCard
          icon={<Activity className="w-4 h-4 text-rose-600" />}
          label="Neobvolané > 24h"
          value={leadsStaleUncalled ?? 0}
          tint="rose"
          href="/admin/leads?filter=stale"
        />
      </div>

      {/* Pipeline — CP → Obhliadky → Realizácie, v jednom veľkom okne */}
      <section className="rounded-2xl border-2 border-sky-200 bg-gradient-to-b from-sky-50/60 to-transparent p-4">
        <header className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-sky-900">
            🚀 Pipeline — CP → Obhliadky → Realizácie
          </h2>
          <span className="text-[10px] text-sky-800/70 italic">
            Postup zákazky cez proces
          </span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            icon={<ClipboardList className="w-4 h-4 text-violet-600" />}
            label="CP poslané"
            value={leadsQuoteSent ?? 0}
            tint="violet"
          />
          <StatCard
            icon={<ClipboardList className="w-4 h-4 text-violet-600" />}
            label="Otvorené obhliadky"
            value={obhliadkyOpen ?? 0}
            tint="violet"
          />
          <StatCard
            icon={<Hammer className="w-4 h-4 text-emerald-600" />}
            label="Naplánované realizácie"
            value={realizacieActive ?? 0}
            tint="emerald"
          />
        </div>
      </section>

      {/* 3 sekcie — vedľa seba na xl, pod seba na menších */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ────── CENOVÉ PONUKY ────── */}
        <Section
          icon={<Phone className="w-5 h-5 text-sky-500" />}
          title="Cenové ponuky"
          subtitle={`${recentLeads?.length ?? 0} posledných`}
          tint="sky"
        >
          {(recentLeads?.length ?? 0) > 0 ? (
            <ul className="divide-y">
              {recentLeads!.map((l) => (
                <li key={l.id} className="px-3 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                        <StatusPill status={l.status as LeadStatus} />
                        <span>{l.source_type}</span>
                        {l.assigned_to && (
                          <span>· {userMap.get(l.assigned_to) ?? "?"}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0">
                      {relTime(l.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Žiadne leady" />
          )}
        </Section>

        {/* ────── OBHLIADKY ────── */}
        <Section
          icon={<ClipboardList className="w-5 h-5 text-violet-500" />}
          title="Obhliadky"
          subtitle={`${recentObhliadky?.length ?? 0} otvorených`}
          tint="violet"
        >
          {(recentObhliadky?.length ?? 0) > 0 ? (
            <ul className="divide-y">
              {recentObhliadky!.map((l) => (
                <li key={l.id} className="px-3 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                        <StatusPill status={l.status as LeadStatus} />
                        {(l.data as Record<string, string>)?.lokalita && (
                          <span>📍 {(l.data as Record<string, string>).lokalita}</span>
                        )}
                        {l.assigned_to && (
                          <span>· {userMap.get(l.assigned_to) ?? "?"}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                      {l.next_callback_at && (
                        <div className="font-bold text-violet-700">
                          📅 {new Date(l.next_callback_at).toLocaleDateString("sk-SK", { day: "2-digit", month: "2-digit" })}
                        </div>
                      )}
                      <div>{relTime(l.last_activity_at)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Žiadne otvorené obhliadky" />
          )}
        </Section>

        {/* ────── REALIZÁCIE ────── */}
        <Section
          icon={<Hammer className="w-5 h-5 text-emerald-500" />}
          title="Realizácie"
          subtitle={`${recentRealizacie?.length ?? 0} otvorených`}
          tint="emerald"
        >
          {(recentRealizacie?.length ?? 0) > 0 ? (
            <ul className="divide-y">
              {recentRealizacie!.map((l) => (
                <li key={l.id} className="px-3 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
                        <StatusPill status={l.status as LeadStatus} />
                        {(l.data as Record<string, string>)?.lokalita && (
                          <span>📍 {(l.data as Record<string, string>).lokalita}</span>
                        )}
                        {l.assigned_to && (
                          <span>· {userMap.get(l.assigned_to) ?? "?"}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                      {l.value_estimate != null && (
                        <div className="font-bold text-emerald-700 tabular-nums">
                          {l.value_estimate.toLocaleString("sk-SK")} €
                        </div>
                      )}
                      <div>{relTime(l.last_activity_at)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Žiadne otvorené realizácie" />
          )}
        </Section>
      </div>

      {/* Footer info */}
      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 inline-block">
        💡 Tip — full history každej sekcie nájdeš na{" "}
        <Link href="/agent" className="underline font-bold hover:text-sky-700">
          /agent
        </Link>{" "}
        (leady),{" "}
        <Link href="/obhliadky" className="underline font-bold hover:text-violet-700">
          /obhliadky
        </Link>{" "}
        a{" "}
        <Link href="/realizacie" className="underline font-bold hover:text-emerald-700">
          /realizacie
        </Link>
        . Ako admin tam vidíš všetky záznamy (nielen svoje).
      </div>

      {/* ────── ANALYTIKA — zdroje, delta, agents, hodinový trend ────── */}
      <section className="rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-slate-50/60 to-transparent p-4 space-y-4">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-slate-900">
            📊 Analytika (posledných 30 dní)
          </h2>
          <span className="text-[10px] text-slate-500 italic">
            Zdroje leadov, trend, obchodáci, momentové zmeny
          </span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* ZMENY delta */}
          <div
            className={cn(
              "rounded-xl border-2 p-4",
              momDelta === null
                ? "bg-zinc-50 border-zinc-200"
                : momDelta >= 0
                  ? "bg-emerald-50 border-emerald-300"
                  : "bg-rose-50 border-rose-300",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-700 inline-flex items-center gap-1">
              {momDelta === null
                ? "📊 Zmeny"
                : momDelta >= 0
                  ? "📈 Zmeny (tempo)"
                  : "📉 Zmeny (tempo)"}
            </div>
            <div
              className={cn(
                "text-3xl font-black tabular-nums mt-1 inline-flex items-center gap-2",
                momDelta === null
                  ? "text-muted-foreground"
                  : momDelta >= 0
                    ? "text-emerald-800"
                    : "text-rose-800",
              )}
            >
              {momDelta === null ? "—" : `${momDelta >= 0 ? "+" : ""}${momDelta.toFixed(1)}%`}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Tempo {(thisMonthCount ?? 0)}/tento vs {(lastMonthCount ?? 0)}/minulý mesiac
            </div>
          </div>

          {/* Zdroje distribúcia */}
          <div className="rounded-xl border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-700 mb-2">
              🥧 Zdroje leadov
            </div>
            <div className="space-y-1.5">
              {sourceGroups.map((s) => {
                const pct = Math.round((s.count / totalForSrc) * 100);
                const bar = {
                  sky: "bg-sky-400",
                  violet: "bg-violet-400",
                  amber: "bg-amber-400",
                  zinc: "bg-zinc-400",
                }[s.tint as "sky" | "violet" | "amber" | "zinc"];
                return (
                  <div key={s.key} className="text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold">{s.label}</span>
                      <span className="tabular-nums font-bold text-slate-800">
                        {s.count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", bar)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top obchodáci */}
          <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/40 to-white p-4">
            <div className="text-[10px] uppercase tracking-wider font-extrabold text-violet-900 mb-2">
              👥 Top obchodáci · 30d
            </div>
            {agentTopList.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">
                Zatiaľ nikto neriešil lead.
              </div>
            ) : (
              <div className="space-y-1">
                {agentTopList.map((a, i) => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "font-black tabular-nums w-4",
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
                      <span className="truncate font-semibold text-slate-800">
                        {a.name}
                      </span>
                    </div>
                    <span className="tabular-nums font-bold text-violet-900">
                      {a.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hodinový trend DNES */}
        <div className="rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm inline-flex items-center gap-2">
              🕐 Dnes — priebeh podľa hodiny
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {nowDate.toLocaleDateString("sk-SK", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              · <strong>{todayTotal}</strong>{" "}
              {todayTotal === 1
                ? "lead"
                : todayTotal < 5 && todayTotal > 0
                  ? "leady"
                  : "leadov"}
            </span>
          </div>
          <div className="flex items-end gap-0.5 h-24">
            {hourlyData.map((d) => {
              const heightPct = (d.count / maxHourlyCount) * 100;
              const isCurrent = d.hour === currentHour;
              const isFuture = d.hour > currentHour;
              return (
                <div
                  key={d.hour}
                  className="flex-1 flex flex-col items-center gap-0.5 group"
                  title={`${String(d.hour).padStart(2, "0")}:00 — ${d.count}`}
                >
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={cn(
                        "w-full rounded-t",
                        isFuture
                          ? "bg-zinc-50 border border-dashed border-zinc-200"
                          : d.count === 0
                            ? "bg-zinc-100"
                            : isCurrent
                              ? "bg-emerald-500"
                              : "bg-sky-400",
                      )}
                      style={{
                        height: `${Math.max(heightPct, d.count > 0 ? 5 : 2)}%`,
                      }}
                    />
                  </div>
                  <div
                    className={cn(
                      "text-[9px] tabular-nums",
                      isCurrent
                        ? "font-black text-emerald-700"
                        : d.hour % 3 === 0
                          ? "font-bold text-slate-700"
                          : "text-muted-foreground",
                    )}
                  >
                    {String(d.hour).padStart(2, "0")}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 text-center">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1 align-middle" />
            Aktuálna hodina ({String(currentHour).padStart(2, "0")}:00) · Max/h:{" "}
            {maxHourlyCount}
          </div>
        </div>
      </section>

      {/* ────── ACTIVITY LOG — live feed akcií naprieč tímom ────── */}
      <section className="rounded-2xl border-2 border-sky-200 bg-background overflow-hidden">
        <header className="px-4 py-3 border-b bg-sky-50/50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-extrabold text-base inline-flex items-center gap-2 text-sky-900">
              📋 Activity log — akcie tímu
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Kto čo urobil kedy · Realtime · Posledných {activities.length}{" "}
              akcií.
            </p>
          </div>
          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider bg-sky-100 px-2 py-0.5 rounded">
            🔴 live
          </span>
        </header>
        {activities.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground italic">
            Zatiaľ žiadne akcie. Ako obchodáci začnú pracovať s leadmi, každá
            akcia sa objaví tu.
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px] relative">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b">
                <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                  <th className="text-left px-3 py-2 w-24">Čas</th>
                  <th className="text-left px-3 py-2 w-40">Obchodák</th>
                  <th className="text-left px-3 py-2">Akcia</th>
                  <th className="text-left px-3 py-2">Lead</th>
                  <th className="text-right px-3 py-2 w-28">Kedy</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activities.map((a) => {
                  // Meno obchodáka: 1) user_id (kto akciu vykonal),
                  //                 2) fallback → lead.assigned_to (komu lead patrí)
                  const explicitUser = a.user_id
                    ? activityUserMap.get(a.user_id as string)
                    : null;
                  const assignedFallback = a.lead_id
                    ? (activityLeadAssignedMap.get(a.lead_id as string) ?? null)
                    : null;
                  const fallbackName = assignedFallback
                    ? activityUserMap.get(assignedFallback)
                    : null;
                  const uName = explicitUser ?? fallbackName ?? null;
                  const isFallback = !explicitUser && !!fallbackName;

                  const lName = a.lead_id
                    ? activityLeadMap.get(a.lead_id as string)
                    : null;
                  const localized = localizeActivity(
                    a.type as string,
                    a.data as Record<string, unknown> | null,
                  );
                  const created = new Date(a.created_at as string);
                  const time = created.toLocaleTimeString("sk-SK", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const dateKey = created.toLocaleDateString("sk-SK", {
                    day: "2-digit",
                    month: "2-digit",
                  });
                  const rel = formatRelativeSec(created, nowDate);
                  return (
                    <tr
                      key={a.id as string}
                      className="hover:bg-sky-50/60 transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        <div className="text-sm font-black text-slate-900">
                          {time}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {dateKey}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {uName ? (
                          <span
                            className={cn(
                              "font-semibold",
                              isFallback
                                ? "text-slate-600 italic"
                                : "text-slate-900",
                            )}
                            title={
                              isFallback
                                ? "Priradený obchodák (akcia bola cez server/webhook)"
                                : "Vykonal akciu"
                            }
                          >
                            {uName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold",
                            localized.className,
                          )}
                        >
                          {localized.emoji} {localized.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {lName ? (
                          <Link
                            href={`/agent/leads/${a.lead_id}`}
                            className="font-semibold text-sky-700 hover:underline decoration-dotted"
                          >
                            {lName}
                          </Link>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            (lead zmazaný)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="text-xs tabular-nums font-semibold text-muted-foreground">
                          {rel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AgentLiveWrapper>
  );
}

/**
 * Preloží raw activity type na SK label + emoji + farbu.
 */
function localizeActivity(
  type: string,
  data: Record<string, unknown> | null,
): { emoji: string; label: string; className: string } {
  switch (type) {
    case "created": {
      const src = (data?.source_type as string) ?? "?";
      const srcLabel =
        src === "web_webhook"
          ? "web"
          : src === "facebook"
            ? "FB"
            : src === "instagram"
              ? "IG"
              : src === "google"
                ? "Google"
                : src === "manual"
                  ? "manuál"
                  : src;
      return {
        emoji: "🆕",
        label: `Nový lead prišiel (${srcLabel})`,
        className: "bg-sky-100 text-sky-800",
      };
    }
    case "phone_revealed":
      return {
        emoji: "📞",
        label: "Odhalil telefón",
        className: "bg-amber-100 text-amber-800",
      };
    case "status_changed": {
      const newStatus = (data?.new_status ?? data?.to) as string | undefined;
      const label = newStatus
        ? `Zmenil status → ${statusLabelShort(newStatus)}`
        : "Zmenil status";
      return {
        emoji: "🔄",
        label,
        className: "bg-violet-100 text-violet-800",
      };
    }
    case "email_sent": {
      const kind = (data?.kind as string) ?? "e-mail";
      return {
        emoji: "✉️",
        label:
          kind === "quote" ? "Poslal cenovú ponuku (e-mail)" : `Poslal e-mail (${kind})`,
        className: "bg-emerald-100 text-emerald-800",
      };
    }
    case "note_added":
      return {
        emoji: "📝",
        label: "Pridal poznámku",
        className: "bg-slate-100 text-slate-700",
      };
    case "call_missed":
      return {
        emoji: "☎️",
        label: "Nedovolal sa",
        className: "bg-rose-100 text-rose-800",
      };
    default:
      return {
        emoji: "•",
        label: type,
        className: "bg-slate-100 text-slate-700",
      };
  }
}

function statusLabelShort(status: string): string {
  const map: Record<string, string> = {
    new: "Nové",
    contacted: "Kontakt",
    quote_sent: "CP poslaná",
    interested: "Záujem",
    scheduled: "Naplánované",
    won: "Ukončené",
    lost: "Prehrané",
    no_answer: "Nedvíha",
    unreachable: "Nedosiahnuteľný",
    needs_inspection: "Na obhliadku",
    inspected: "Obhliadnuté",
  };
  return map[status] ?? status;
}

/** Relatívny čas — "pred 12s", "pred 3min", "pred 2h", "pred 4d". */
function formatRelativeSec(then: Date, ref: Date): string {
  const diff = Math.max(0, Math.round((ref.getTime() - then.getTime()) / 1000));
  if (diff < 60) return `pred ${diff}s`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `pred ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `pred ${hr}h`;
  const days = Math.floor(hr / 24);
  return `pred ${days}d`;
}

// ───────────────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  tint,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "sky" | "violet" | "emerald" | "rose";
  /** Ak zadané, kartička je klikateľná (Link) a otvorí detail. */
  href?: string;
}) {
  const tintBg = {
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
    rose: "bg-rose-50 border-rose-200",
  }[tint];
  const inner = (
    <>
      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold tabular-nums mt-1 flex items-center gap-1.5">
        {value}
        {href && (
          <span className="text-[11px] font-bold text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
            →
          </span>
        )}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "group rounded-xl border p-3 hover:shadow-md hover:border-sky-400 transition-all block",
          tintBg,
        )}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cn("rounded-xl border p-3", tintBg)}>{inner}</div>;
}

function Section({
  icon,
  title,
  subtitle,
  tint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tint: "sky" | "violet" | "emerald";
  children: React.ReactNode;
}) {
  const headerBg = {
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
  }[tint];
  return (
    <section className="rounded-2xl border bg-background overflow-hidden flex flex-col">
      <header
        className={cn(
          "px-3 py-2.5 border-b flex items-center justify-between gap-2",
          headerBg,
        )}
      >
        <div className="inline-flex items-center gap-2 font-bold">
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {subtitle}
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto max-h-[480px]">
        {children}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "px-1 py-0.5 rounded text-[9px] font-bold uppercase",
        meta.pill,
      )}
    >
      {meta.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-3 py-8 text-center text-xs text-muted-foreground italic">
      {message}
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "teraz";
  if (min < 60) return `pred ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `pred ${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `pred ${days}d`;
  return new Date(iso).toLocaleDateString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
  });
}

function M2Tile({
  label,
  value,
  count,
  tint,
  highlighted,
}: {
  label: string;
  value: number;
  count: number;
  tint: "emerald" | "sky" | "violet" | "amber";
  highlighted?: boolean;
}) {
  const bg = {
    emerald: "bg-emerald-50 border-emerald-200",
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    amber: "bg-amber-50 border-amber-300",
  }[tint];
  const text = {
    emerald: "text-emerald-800",
    sky: "text-sky-800",
    violet: "text-violet-800",
    amber: "text-amber-800",
  }[tint];
  const subText = {
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    violet: "text-violet-700",
    amber: "text-amber-700",
  }[tint];
  const formatted = value.toLocaleString("sk-SK", {
    maximumFractionDigits: 0,
  });
  const jobsLabel =
    count === 1 ? "zákazka" : count >= 2 && count <= 4 ? "zákazky" : "zákaziek";
  return (
    <div
      className={`rounded-xl border-2 p-3.5 ${bg} ${
        highlighted
          ? {
              emerald: "ring-2 ring-emerald-300 shadow",
              sky: "ring-2 ring-sky-300 shadow",
              violet: "ring-2 ring-violet-300 shadow",
              amber: "ring-2 ring-amber-300 shadow",
            }[tint]
          : ""
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
        <div>
          <span className={`text-3xl font-extrabold tabular-nums ${text}`}>
            {formatted}
          </span>
          <span className="text-[11px] ml-1 text-muted-foreground font-semibold">
            m²
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-extrabold tabular-nums ${subText}`}>
            {count}
          </span>
          <span className="text-[10px] text-muted-foreground font-semibold">
            {jobsLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
