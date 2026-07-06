import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Calendar,
  ClipboardList,
  Eye,
  Flame,
  Hammer,
  Phone,
  TrendingUp,
  Users,
} from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentLiveWrapper } from "@/components/agent-live-wrapper";
import { STATUS_META, type LeadStatus } from "@/lib/types/lead";
import { fetchTestUserIds, isTestLead, isTestLeadName } from "@/lib/test-account";
import {
  UNCALLED_ALERT_THRESHOLD,
  STAGNATION_DAYS,
  ROLE_INACTIVE_DAYS,
} from "@/lib/admin-thresholds";
import { cn } from "@/lib/utils";
import { LeadGapAlert } from "./lead-gap-alert";
import { ActivityLogClient, type ActivityRow } from "./activity-log-client";

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

  // ─── TEST ACCOUNT + TEST-NAMED LEADS FILTER ───────────────────────────
  // Vylučujeme z admin štatistík:
  //   1) leady priradené test-userovi (info@epoxidovo / Mário Vitáz)
  //   2) leady s "TEST" prefixom v mene (napr. "TEST · Peter Novák")
  //
  // User confirmed: "nepocitaj testy do ziadnych statistik".
  // Test leady existujú iba preto aby si admin cez info@ účet mohol
  // sledovať ako CRM funguje — nesmú kaziť produkčné čísla.
  const testUserIds = await fetchTestUserIds(sb);
  const isTestAssigned = (assignedTo: string | null | undefined) =>
    !!assignedTo && testUserIds.has(assignedTo);
  /**
   * Filter helper — funguje na oboch dimenziách:
   *   • name != null → filtrujeme aj podľa mena (test-prefix)
   *   • assigned_to → filtrujeme podľa priradenia
   */
  const notTest = <T extends { assigned_to?: string | null; name?: string | null }>(
    l: T,
  ) => !isTestLead(l, testUserIds);

  const now = Date.now();
  const nowDate = new Date(now);
  const since7 = new Date(now - 7 * 86400_000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60_000).toISOString();
  const since3d = new Date(now - 3 * 86400_000).toISOString();
  const monthStart = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    1,
  ).toISOString();
  const monthLabel = nowDate.toLocaleDateString("sk-SK", { month: "long" });
  // Kvartál — Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
  const quarterIdx = Math.floor(nowDate.getMonth() / 3);
  const quarterStart = new Date(
    nowDate.getFullYear(),
    quarterIdx * 3,
    1,
  ).toISOString();
  const quarterLabel = `Q${quarterIdx + 1} ${nowDate.getFullYear()}`;
  const stagnationCutoffMs = now - STAGNATION_DAYS * 86400_000;
  const roleInactiveCutoffMs = now - ROLE_INACTIVE_DAYS * 86400_000;

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
      .select("data, assigned_to, name, realization_at, status")
      .not("realization_at", "is", null)
      .lte("realization_at", nowIso)
      .not("status", "in", "(lost,archived,no_answer,not_interested)");
  const [wonQuarter, wonMonth, won7d] = await Promise.all([
    doneBase().gte("realization_at", quarterStart),
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

  const m2Quarter = sumM2(wonQuarter.data);
  const m2Month = sumM2(wonMonth.data);
  const m27d = sumM2(won7d.data);
  const jobsQuarter = countReal(wonQuarter.data);
  const jobsMonth = countReal(wonMonth.data);
  const jobs7d = countReal(won7d.data);

  // ─── 1) LEADY (CP POSLANÁ) — posledných 10 s cenovou ponukou ─────────
  // Fetch trochu viac (20) aby po filtrovaní test-userov zostalo ~10.
  const { data: recentLeadsRaw } = await sb
    .from("leads")
    .select("id, name, status, source_type, created_at, last_activity_at, assigned_to, phone_revealed_at, value_estimate")
    .eq("status", "quote_sent")
    .order("last_activity_at", { ascending: false })
    .limit(20);
  const recentLeads = (recentLeadsRaw ?? []).filter(notTest).slice(0, 10);

  // ─── Analytika: hodinový trend + zdroje + delta ───────────────────────
  // Načítaj až 500 leadov posledných 30 dní pre grafy + zdroj distribúciu
  const analyticsSinceIso = new Date(now - 30 * 86400_000).toISOString();
  const { data: analyticsLeads } = await sb
    .from("leads")
    .select("id, name, source_type, created_at, assigned_to, status")
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

  // ─── Top VÝKON obchodákov (30d) ──────────────────────────────────────
  // Meriame REÁLNY VÝKON, nie počet pridelených leadov (auto-assign).
  // Výkon = počet handed_over_to_inspection + počet email_sent
  // (odoslaných CP) v posledných 30 dňoch.
  //
  // ⚠ Legacy bug: staré email_sent zápisy nemajú user_id. Fallback:
  // ak user_id chýba, priradíme akciu obchodákovi z lead.assigned_to.
  // Bez toho by Leo Hrisenko mal 0 CP, hoci ich reálne poslal 6.
  const perfSinceIso = new Date(now - 30 * 86400_000).toISOString();
  const { data: perfActions } = await sb
    .from("lead_activities")
    .select("user_id, type, created_at, lead_id")
    .in("type", ["handed_over_to_inspection", "email_sent"])
    .gte("created_at", perfSinceIso);
  // Fetch mien + assigned_to pre všetky leady na ktorých sú činnosti.
  const perfLeadIds = Array.from(
    new Set(
      (perfActions ?? [])
        .map((a) => a.lead_id as string | null)
        .filter((x): x is string => !!x),
    ),
  );
  const perfLeadMeta = new Map<
    string,
    { name: string; assigned_to: string | null }
  >();
  if (perfLeadIds.length > 0) {
    const { data: perfLeads } = await sb
      .from("leads")
      .select("id, name, assigned_to")
      .in("id", perfLeadIds);
    for (const l of perfLeads ?? [])
      perfLeadMeta.set(l.id as string, {
        name: (l.name as string) ?? "",
        assigned_to: (l.assigned_to as string | null) ?? null,
      });
  }
  const obchodTotals = new Map<
    string,
    { cpSent: number; toInspection: number }
  >();
  for (const a of perfActions ?? []) {
    const leadMeta = a.lead_id
      ? perfLeadMeta.get(a.lead_id as string)
      : undefined;
    // TEST-named lead → neráta sa do obchod. výkonu
    if (leadMeta && isTestLeadName(leadMeta.name)) continue;
    // Fallback: ak user_id chýba (staré emaily), priradiť podľa
    // lead.assigned_to (najlepší proxy pre "kto to poslal").
    const uid = (a.user_id as string | null) ?? leadMeta?.assigned_to ?? null;
    if (!uid || testUserIds.has(uid)) continue;
    const s = obchodTotals.get(uid) ?? { cpSent: 0, toInspection: 0 };
    if (a.type === "email_sent") s.cpSent += 1;
    if (a.type === "handed_over_to_inspection") s.toInspection += 1;
    obchodTotals.set(uid, s);
  }

  // ─── Top REALIZÁTORI (30d) ───────────────────────────────────────────
  // Rovnaký zdroj (lead_activities) ako Activity log — user spec.
  //
  // Meriame:
  //   • completed = počet "realization_completed" akcií
  //   • uploaded  = počet "media_uploaded" akcií (foto z realizácie)
  //   • active    = počet leadov v in_realization stave (proxy, nie
  //                 activity — reprezentuje "má rozrobené")
  //
  // Fallback na user_id → lead.assigned_to → lead.realization_by
  // (rôzne endpointy historicky zapisovali rôzne fieldy).
  const { data: realizatorActs } = await sb
    .from("lead_activities")
    .select("user_id, type, created_at, lead_id")
    .in("type", ["realization_completed", "media_uploaded"])
    .gte("created_at", perfSinceIso);
  const realActLeadIds = Array.from(
    new Set(
      (realizatorActs ?? [])
        .map((a) => a.lead_id as string | null)
        .filter((x): x is string => !!x),
    ),
  );
  const realActLeadMeta = new Map<
    string,
    { name: string; realization_by: string | null }
  >();
  if (realActLeadIds.length > 0) {
    const { data: realActLeads } = await sb
      .from("leads")
      .select("id, name, realization_by")
      .in("id", realActLeadIds);
    for (const l of realActLeads ?? [])
      realActLeadMeta.set(l.id as string, {
        name: (l.name as string) ?? "",
        realization_by: (l.realization_by as string | null) ?? null,
      });
  }
  const realizatorTotals = new Map<
    string,
    { active: number; completed: number; uploaded: number }
  >();
  for (const a of realizatorActs ?? []) {
    const leadMeta = a.lead_id
      ? realActLeadMeta.get(a.lead_id as string)
      : undefined;
    if (leadMeta && isTestLeadName(leadMeta.name)) continue;
    const uid =
      (a.user_id as string | null) ?? leadMeta?.realization_by ?? null;
    if (!uid || testUserIds.has(uid)) continue;
    const s = realizatorTotals.get(uid) ?? {
      active: 0,
      completed: 0,
      uploaded: 0,
    };
    if (a.type === "realization_completed") s.completed += 1;
    if (a.type === "media_uploaded") s.uploaded += 1;
    realizatorTotals.set(uid, s);
  }
  // Aktívne (in_realization) leady — proxy pre "má rozrobené"
  const { data: activeRealLeads } = await sb
    .from("leads")
    .select("realization_by, name")
    .eq("status", "in_realization")
    .not("realization_by", "is", null);
  for (const l of activeRealLeads ?? []) {
    const rid = l.realization_by as string | null;
    if (!rid || testUserIds.has(rid)) continue;
    if (isTestLeadName(l.name as string | null)) continue;
    const s = realizatorTotals.get(rid) ?? {
      active: 0,
      completed: 0,
      uploaded: 0,
    };
    s.active += 1;
    realizatorTotals.set(rid, s);
  }

  // ─── ROLE ACTIVITY — dôkaz že pracujú všetky 3 role ──────────────────
  // Pre každú rolu (obchod, obhliadky, realizacie): počet lead_activities
  // za 7 dní + čas poslednej akcie. Ak > ROLE_INACTIVE_DAYS → warning.
  // POZOR: bez .eq("active", true) — active flag nemusí byť u všetkých
  // userov nastavený a strácali sme by tak Lea/Ela zo štatistiky role.
  const { data: roleUsersRaw } = await sb
    .from("users")
    .select("id, role")
    .in("role", ["obchod", "obhliadky", "realizacie"]);
  const roleByUser = new Map<string, string>();
  for (const u of roleUsersRaw ?? []) {
    if (!testUserIds.has(u.id as string))
      roleByUser.set(u.id as string, u.role as string);
  }
  // Role activity — používame ROVNAKÝ zdroj (lead_activities) ako
  // Activity log. Fallback: keď user_id chýba (staré emaily), použij
  // lead.assigned_to.
  //
  // Filtrujeme SYSTÉMOVÉ typy (created / web_webhook / manual / atď.),
  // aby zodpovedali defaultu Activity logu (bez „Zobraziť aj systémové").
  const HUMAN_ACTIVITY_TYPES = [
    "call_answered",
    "call_missed",
    "phone_revealed",
    "note_added",
    "email_sent",
    "email",
    "handed_over_to_inspection",
    "handed_over_to_realization",
    "inspection_completed",
    "realization_completed",
    "media_uploaded",
    "status_changed",
    "manually_archived",
    "claimed",
  ] as const;
  const { data: roleActions } = await sb
    .from("lead_activities")
    .select("user_id, created_at, lead_id, type")
    .gte("created_at", since7)
    .in("type", HUMAN_ACTIVITY_TYPES as unknown as string[]);
  // Fetch lead names + assigned_to pre fallback + test filter
  const roleLeadIds = Array.from(
    new Set(
      (roleActions ?? [])
        .map((a) => a.lead_id as string | null)
        .filter((x): x is string => !!x),
    ),
  );
  const roleLeadMeta = new Map<
    string,
    { name: string; assigned_to: string | null }
  >();
  if (roleLeadIds.length > 0) {
    const { data: roleLeads } = await sb
      .from("leads")
      .select("id, name, assigned_to")
      .in("id", roleLeadIds);
    for (const l of roleLeads ?? [])
      roleLeadMeta.set(l.id as string, {
        name: (l.name as string) ?? "",
        assigned_to: (l.assigned_to as string | null) ?? null,
      });
  }
  const roleStats = new Map<
    string,
    { count7d: number; lastAt: string | null }
  >();
  for (const r of ["obchod", "obhliadky", "realizacie"])
    roleStats.set(r, { count7d: 0, lastAt: null });
  for (const a of roleActions ?? []) {
    const leadMeta = a.lead_id
      ? roleLeadMeta.get(a.lead_id as string)
      : undefined;
    // TEST-named lead → neráta
    if (leadMeta && isTestLeadName(leadMeta.name)) continue;
    // Fallback user_id
    const uid =
      (a.user_id as string | null) ?? leadMeta?.assigned_to ?? null;
    if (!uid) continue;
    const role = roleByUser.get(uid);
    if (!role) continue;
    const s = roleStats.get(role)!;
    s.count7d += 1;
    const t = a.created_at as string;
    if (!s.lastAt || t > s.lastAt) s.lastAt = t;
  }

  // ─── Collect all names potrebné pre top výkon + realizators + role ───
  const perfUserIds = new Set<string>([
    ...Array.from(obchodTotals.keys()),
    ...Array.from(realizatorTotals.keys()),
  ]);
  const analyticsAgentMap = new Map<string, string>();
  if (perfUserIds.size > 0) {
    const { data: pusers } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", Array.from(perfUserIds));
    for (const u of pusers ?? [])
      analyticsAgentMap.set(u.id, u.name || u.email);
  }
  const obchodTopList = Array.from(obchodTotals.entries())
    .map(([id, s]) => ({
      id,
      name: analyticsAgentMap.get(id) ?? "?",
      total: s.cpSent + s.toInspection,
      ...s,
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const realizatorTopList = Array.from(realizatorTotals.entries())
    .map(([id, s]) => ({
      id,
      name: analyticsAgentMap.get(id) ?? "?",
      total: s.completed + s.active + s.uploaded,
      ...s,
    }))
    .filter((x) => x.total > 0)
    .sort(
      (a, b) =>
        b.completed - a.completed ||
        b.uploaded - a.uploaded ||
        b.active - a.active,
    )
    .slice(0, 5);

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
  //
  // "Otvorené leady" = aktívne, čo ešte NIE sú uzavreté (won/lost/archived
  // /not_interested). Toto je práca pred obchodákom, na rozdiel od
  // lifetime totalu (vanity číslo).
  const [leadsOpenRes, leads24hRes, leadsStaleUncalledRes] = await Promise.all([
    sb
      .from("leads")
      .select("assigned_to, name")
      .not("status", "in", "(won,lost,archived,not_interested)"),
    sb.from("leads").select("assigned_to, name").gte("created_at", since24h),
    sb
      .from("leads")
      .select("assigned_to, name")
      .is("phone_revealed_at", null)
      .lt("created_at", since24h)
      .not("status", "in", "(lost,archived,unreachable,not_interested,won)"),
  ]);
  const leadsOpen = (leadsOpenRes.data ?? []).filter(notTest).length;
  const leads24h = (leads24hRes.data ?? []).filter(notTest).length;
  const leadsStaleUncalled = (leadsStaleUncalledRes.data ?? []).filter(notTest)
    .length;
  const uncalledAlarm = leadsStaleUncalled >= UNCALLED_ALERT_THRESHOLD;
  // Pipeline stats — WEEKLY window (posledných 7 dní).
  // Ku každému číslu ešte spočítame count za posledných 24h, aby sme
  // vedeli ukázať delta chip "+X %" oproti predchádzajúcim 6 dňom
  // (denný priemer prior 6d).
  //
  // Prečo:
  //   • Weekly window je pre obchodáka aktuálnejšie ako "od 1. mesiaca"
  //     — vidí čo sa deje TERAZ, nie starú historiu z 1. júla.
  //   • Delta chip za 24h je "tempo dnes" — okamžite vidí či pipeline
  //     zrýchľuje alebo spomaľuje.
  const [
    leadsQuoteSent7dRes,
    leadsQuoteSent24hRes,
    obhliadkyOpen7dRes,
    obhliadkyOpen24hRes,
    realizacieActive7dRes,
    realizacieActive24hRes,
  ] = await Promise.all([
    sb
      .from("leads")
      .select("assigned_to, name")
      .eq("status", "quote_sent")
      .gte("last_activity_at", since7),
    sb
      .from("leads")
      .select("assigned_to, name")
      .eq("status", "quote_sent")
      .gte("last_activity_at", since24h),
    sb
      .from("leads")
      .select("assigned_to, name")
      .in("status", ["scheduled", "interested", "needs_inspection"])
      .gte("last_activity_at", since7),
    sb
      .from("leads")
      .select("assigned_to, name")
      .in("status", ["scheduled", "interested", "needs_inspection"])
      .gte("last_activity_at", since24h),
    sb
      .from("leads")
      .select("assigned_to, name")
      .in("status", ["in_realization", "won"])
      .gte("last_activity_at", since7),
    sb
      .from("leads")
      .select("assigned_to, name")
      .in("status", ["in_realization", "won"])
      .gte("last_activity_at", since24h),
  ]);

  const leadsQuoteSent = (leadsQuoteSent7dRes.data ?? []).filter(notTest).length;
  const leadsQuoteSent24h = (leadsQuoteSent24hRes.data ?? []).filter(notTest).length;
  const obhliadkyOpen = (obhliadkyOpen7dRes.data ?? []).filter(notTest).length;
  const obhliadkyOpen24h = (obhliadkyOpen24hRes.data ?? []).filter(notTest).length;
  const realizacieActive = (realizacieActive7dRes.data ?? []).filter(notTest).length;
  const realizacieActive24h = (realizacieActive24hRes.data ?? []).filter(notTest).length;

  /**
   * Denný delta %: porovná count za posledných 24h vs priemerný denný
   * count za predchádzajúcich 6 dní (weekly - 24h) / 6.
   *
   * +100 % = dnes prišlo 2× viac ako denný priemer prior 6d
   *    0 % = dnes rovnaké ako priemer
   *  -50 % = dnes polovica priemeru
   *  null = nedá sa spočítať (prior 6d bolo 0)
   */
  function dailyDelta(week: number, last24h: number): number | null {
    const prior6d = Math.max(0, week - last24h);
    if (prior6d === 0) return last24h > 0 ? 100 : null;
    const dailyAvg = prior6d / 6;
    if (dailyAvg === 0) return last24h > 0 ? 100 : null;
    return Math.round(((last24h - dailyAvg) / dailyAvg) * 100);
  }

  const leadsQuoteSentDelta = dailyDelta(leadsQuoteSent, leadsQuoteSent24h);
  const obhliadkyOpenDelta = dailyDelta(obhliadkyOpen, obhliadkyOpen24h);
  const realizacieActiveDelta = dailyDelta(realizacieActive, realizacieActive24h);

  // Recent lists — leady/obhliadky/realizacie pre 3 sekcie nižšie
  const { data: recentObhliadkyRaw } = await sb
    .from("leads")
    .select("id, name, status, next_callback_at, last_activity_at, assigned_to, data")
    .in("status", ["scheduled", "interested", "needs_inspection"])
    .order("last_activity_at", { ascending: false })
    .limit(20);
  const recentObhliadky = (recentObhliadkyRaw ?? []).filter(notTest).slice(0, 10);

  // POZOR: Realizácie musia byť skutočné realizácie, NIE CP.
  // Preto NE-zahrnujeme "quote_sent" (to je CP → patrí do CP stĺpca).
  // Zahrnujeme: in_realization (obchodák posunul na realizáciu) +
  // won (zákazka je uzavretá).
  const { data: recentRealizacieRaw } = await sb
    .from("leads")
    .select("id, name, status, last_activity_at, value_estimate, assigned_to, data, realization_at")
    .in("status", ["in_realization", "won"])
    .order("last_activity_at", { ascending: false })
    .limit(20);
  const recentRealizacie = (recentRealizacieRaw ?? [])
    .filter(notTest)
    .slice(0, 10);

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
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
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
        </div>
        {/* Lead-source gap indicator + sticky alarm banners */}
        <LeadGapAlert />
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          1) ALARMY — najvyššia priorita, farebne
          ═══════════════════════════════════════════════════════════════
          Poradie: Neobvolané > 24h (najväčšie, red keď prah prekročený),
          Otvorené leady (aktívne, nie lifetime total), Nové za 24h. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Neobvolané > 24h — biggest, spans 2 cols */}
        <Link
          href="/admin/leads?filter=stale"
          className={cn(
            "md:col-span-2 rounded-2xl border-2 p-5 flex items-center gap-4 hover:shadow-md transition-all",
            uncalledAlarm
              ? "border-rose-400 bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
              : "border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/40",
          )}
        >
          <div
            className={cn(
              "p-3 rounded-xl shrink-0",
              uncalledAlarm ? "bg-rose-200/60" : "bg-emerald-200/60",
            )}
          >
            {uncalledAlarm ? (
              <Flame className="w-8 h-8 text-rose-700" aria-hidden />
            ) : (
              <Activity className="w-8 h-8 text-emerald-700" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "text-[10px] uppercase tracking-wider font-black",
                uncalledAlarm ? "text-rose-800" : "text-emerald-800",
              )}
            >
              🚨 Neobvolané &gt; 24h
            </div>
            <div
              className={cn(
                "text-5xl md:text-6xl font-black tabular-nums leading-none mt-1",
                uncalledAlarm ? "text-rose-900" : "text-emerald-900",
              )}
            >
              {leadsStaleUncalled}
            </div>
            <div
              className={cn(
                "text-[11px] font-semibold mt-1.5",
                uncalledAlarm ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {uncalledAlarm
                ? `⚠️ Prekročený prah (${UNCALLED_ALERT_THRESHOLD}) — treba obvolať`
                : `OK · pod prahom ${UNCALLED_ALERT_THRESHOLD}`}
            </div>
          </div>
        </Link>

        <StatCard
          icon={<Phone className="w-4 h-4 text-sky-600" />}
          label="Otvorené leady"
          value={leadsOpen ?? 0}
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
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          2) PIPELINE zjednotený — počet v headere každého stĺpca +
             stagnation flag (>STAGNATION_DAYS bez pohybu).
             Zrušené: samostatné číslo-tiles (CP=7 / Obhliadky=3 /
             Realizácie=1) sú teraz priamo v headeri.
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ── CP POSLANÉ ── (7d weekly window, kliknuteľné) */}
        <PipelineColumn
          icon={<ClipboardList className="w-5 h-5 text-violet-500" />}
          title="CP poslané"
          count={leadsQuoteSent}
          countLast24h={leadsQuoteSent24h}
          tint="violet"
          href="/admin/leads?filter=cp"
        >
          {(recentLeads?.length ?? 0) > 0 ? (
            <ul className="divide-y">
              {recentLeads!.map((l) => (
                <PipelineItem
                  key={l.id}
                  leadId={l.id as string}
                  name={l.name as string}
                  status={l.status as LeadStatus}
                  source={l.source_type as string}
                  assignedName={
                    l.assigned_to ? (userMap.get(l.assigned_to as string) ?? null) : null
                  }
                  lastActivityAt={(l.last_activity_at as string) ?? (l.created_at as string)}
                  stagnationCutoffMs={stagnationCutoffMs}
                />
              ))}
            </ul>
          ) : (
            <EmptyState message="Žiadne CP poslané" />
          )}
        </PipelineColumn>

        {/* ── OBHLIADKY ── */}
        <PipelineColumn
          icon={<ClipboardList className="w-5 h-5 text-violet-500" />}
          title="Obhliadky"
          count={obhliadkyOpen}
          countLast24h={obhliadkyOpen24h}
          tint="violet"
          href="/obhliadky"
        >
          {(recentObhliadky?.length ?? 0) > 0 ? (
            <ul className="divide-y">
              {recentObhliadky!.map((l) => (
                <PipelineItem
                  key={l.id}
                  leadId={l.id as string}
                  name={l.name as string}
                  status={l.status as LeadStatus}
                  city={(l.data as Record<string, string>)?.lokalita ?? null}
                  assignedName={
                    l.assigned_to ? (userMap.get(l.assigned_to as string) ?? null) : null
                  }
                  lastActivityAt={l.last_activity_at as string}
                  stagnationCutoffMs={stagnationCutoffMs}
                  extra={
                    l.next_callback_at ? (
                      <span className="font-bold text-violet-700">
                        📅{" "}
                        {new Date(l.next_callback_at as string).toLocaleDateString(
                          "sk-SK",
                          { day: "2-digit", month: "2-digit" },
                        )}
                      </span>
                    ) : null
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyState message="Žiadne otvorené obhliadky" />
          )}
        </PipelineColumn>

        {/* ── REALIZÁCIE ── */}
        <PipelineColumn
          icon={<Hammer className="w-5 h-5 text-emerald-500" />}
          title="Realizácie"
          count={realizacieActive}
          countLast24h={realizacieActive24h}
          tint="emerald"
          href="/realizacie"
        >
          {(recentRealizacie?.length ?? 0) > 0 ? (
            <ul className="divide-y">
              {recentRealizacie!.map((l) => (
                <PipelineItem
                  key={l.id}
                  leadId={l.id as string}
                  name={l.name as string}
                  status={l.status as LeadStatus}
                  city={(l.data as Record<string, string>)?.lokalita ?? null}
                  assignedName={
                    l.assigned_to ? (userMap.get(l.assigned_to as string) ?? null) : null
                  }
                  lastActivityAt={l.last_activity_at as string}
                  stagnationCutoffMs={stagnationCutoffMs}
                  extra={
                    l.value_estimate != null ? (
                      <span className="font-bold text-emerald-700 tabular-nums">
                        {(l.value_estimate as number).toLocaleString("sk-SK")} €
                      </span>
                    ) : null
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyState message="Žiadne otvorené realizácie" />
          )}
        </PipelineColumn>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          3) AKTIVITA PODĽA ROLÍ — dôkaz že pracujú všetky 3 role
          ═══════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border-2 border-slate-200 bg-background overflow-hidden">
        <header className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-slate-900">
            <Users className="w-4 h-4 text-slate-700" aria-hidden />
            Aktivita podľa rolí · 7d
          </h2>
          <span className="text-[10px] text-slate-500 italic">
            Ak posledná akcia rola staršia než {ROLE_INACTIVE_DAYS} dní →
            zvýraznené
          </span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
          {(["obchod", "obhliadky", "realizacie"] as const).map((role) => {
            const stat = roleStats.get(role)!;
            const isInactive =
              !stat.lastAt ||
              new Date(stat.lastAt).getTime() < roleInactiveCutoffMs;
            return (
              <div
                key={role}
                className={cn(
                  "p-4 flex items-center gap-3",
                  isInactive && "bg-rose-50/40",
                )}
              >
                <div
                  className={cn(
                    "w-2 h-16 rounded-full",
                    isInactive ? "bg-rose-500" : "bg-emerald-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-[10px] uppercase tracking-wider font-black",
                      isInactive ? "text-rose-800" : "text-slate-700",
                    )}
                  >
                    {roleLabel(role)}
                    {isInactive && " ⚠️"}
                  </div>
                  <div className="text-2xl font-black tabular-nums mt-0.5">
                    {stat.count7d}
                    <span className="text-xs font-semibold text-muted-foreground ml-1">
                      akcií
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-1",
                      isInactive
                        ? "text-rose-700 font-bold"
                        : "text-muted-foreground",
                    )}
                  >
                    {stat.lastAt
                      ? `Posledná: ${relTime(stat.lastAt)}`
                      : "Za 7 dní žiadna akcia"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

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

      {/* ═══════════════════════════════════════════════════════════════
          4) TOP VÝKON — dve rebríčky vedľa seba (obchodáci + realizátori)
             Obchodáci: podľa REÁLNEHO výkonu (CP + na obhliadku),
             NIE podľa počtu pridelených leadov (to robí auto-assign).
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Top obchodáci — výkon 30d */}
        <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/50 to-white p-4">
          <header className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-sm text-violet-900 inline-flex items-center gap-1.5">
              🥇 Top obchodáci · 30d
            </h3>
            <span className="text-[10px] text-violet-700/70">
              CP + posun na obhliadku
            </span>
          </header>
          {obchodTopList.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">
              Zatiaľ žiadne obchodné akcie za 30d.
            </div>
          ) : (
            <div className="space-y-1.5">
              {obchodTopList.map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "font-black tabular-nums w-5",
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
                    <span className="truncate font-bold text-slate-800">
                      {a.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold">
                    <span
                      className="tabular-nums bg-violet-100 text-violet-800 border border-violet-200 px-1.5 py-0.5 rounded"
                      title="Odoslané CP"
                    >
                      CP {a.cpSent}
                    </span>
                    <span
                      className="tabular-nums bg-sky-100 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded"
                      title="Posunuté na obhliadku"
                    >
                      OB {a.toInspection}
                    </span>
                    <span className="tabular-nums font-black text-slate-900 ml-1">
                      Σ {a.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top realizátori — 30d */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white p-4">
          <header className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-sm text-emerald-900 inline-flex items-center gap-1.5">
              🏗️ Top realizátori · 30d
            </h3>
            <span className="text-[10px] text-emerald-700/70">
              Dokončené + aktívne
            </span>
          </header>
          {realizatorTopList.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">
              Zatiaľ žiadne realizácie priradené.
            </div>
          ) : (
            <div className="space-y-1.5">
              {realizatorTopList.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "font-black tabular-nums w-5",
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
                    <span className="truncate font-bold text-slate-800">
                      {r.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold">
                    <span
                      className="tabular-nums bg-sky-100 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded"
                      title="Aktívne realizácie (in_realization stav)"
                    >
                      AKT {r.active}
                    </span>
                    <span
                      className="tabular-nums bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded"
                      title="Dokončené realizácie (30d)"
                    >
                      DOK {r.completed}
                    </span>
                    {r.uploaded > 0 && (
                      <span
                        className="tabular-nums bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded"
                        title="Nahraté fotky z realizácie (30d)"
                      >
                        FOTO {r.uploaded}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          5) DOKONČENÉ m² — presunuté nižšie (výstup, nie alarm).
             Ponechané: 7d, tento mesiac.
             Zrušené: CELKOVO (vanity metrika).
             Pridané: tento kvartál.
             Vrátený "IN CONSTRUCTION" disclaimer — feature zatiaľ
             počíta z realization_at (obchodák dal termín + termín
             prešiel), nie z fyzicky označeného dokončenia realizátorom.
          ═══════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50/60 to-transparent p-4 relative">
        <span className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full border border-amber-400">
          🚧 In construction
        </span>
        <header className="mb-3">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-emerald-900">
            📐 Dokončené m² (realizácie)
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Aktuálne to počíta z leadov s <code className="font-mono">realization_at ≤ dnes</code>{" "}
            (obchodák dal termín + termín prešiel), nezrušené. Až realizátori
            začnú v UI označovať fyzické dokončenie, prejdeme na presnejšie
            zdrojové dáta.
          </p>
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
            label={`Tento kvartál (${quarterLabel})`}
            value={m2Quarter}
            count={jobsQuarter}
            tint="emerald"
            highlighted
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          6) ANALYTIKA — zdroje + hodinový trend.
             Zrušené: Zmeny (tempo) delta tile — pri malých číslach
             neakčná/zavádzajúca.
          ═══════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-slate-50/60 to-transparent p-4 space-y-4">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-slate-900">
            📊 Analytika (posledných 30 dní)
          </h2>
          <span className="text-[10px] text-slate-500 italic">
            Tento mesiac {(thisMonthCount ?? 0)} · minulý{" "}
            {(lastMonthCount ?? 0)}
          </span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

          {/* Placeholder pre budúce metriky (napr. konverzný pomer CP→won) */}
          <div className="rounded-xl border border-dashed bg-white/50 p-4 flex items-center justify-center text-[11px] text-muted-foreground italic min-h-[140px]">
            Pipeline konverzia (CP → won) — dorobíme keď bude reprezentatívna
            vzorka dát.
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

      {/* ═══════════════════════════════════════════════════════════════
          7) ACTIVITY LOG — client wrapper s toggle "aj systémové".
             Default: iba ľudské akcie (zaplavené webhook eventmi
             po starom stratili sme reálnu prácu z pohľadu).
          ═══════════════════════════════════════════════════════════════ */}
      <ActivityLogClient
        activities={activities.map<ActivityRow>((a) => {
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
          return {
            id: a.id as string,
            lead_id: (a.lead_id as string) ?? null,
            user_id: (a.user_id as string) ?? null,
            type: a.type as string,
            data: (a.data as Record<string, unknown> | null) ?? null,
            created_at: a.created_at as string,
            user_name: uName ?? null,
            lead_name: a.lead_id
              ? (activityLeadMap.get(a.lead_id as string) ?? null)
              : null,
            is_fallback_user: !explicitUser && !!fallbackName,
          };
        })}
      />
    </AgentLiveWrapper>
  );
}

/** SK label pre rolu (používame v Role Activity block) */
function roleLabel(role: "obchod" | "obhliadky" | "realizacie"): string {
  switch (role) {
    case "obchod":
      return "Obchod";
    case "obhliadky":
      return "Obhliadky";
    case "realizacie":
      return "Realizácie";
  }
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
  delta,
  deltaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "sky" | "violet" | "emerald" | "rose";
  /** Ak zadané, kartička je klikateľná (Link) a otvorí detail. */
  href?: string;
  /** Percento zmeny (napr. +50, -20). null = žiadny delta chip. */
  delta?: number | null;
  /** Tooltip pre delta chip (napr. "24h vs. prior 6d avg"). */
  deltaLabel?: string;
}) {
  const tintBg = {
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
    rose: "bg-rose-50 border-rose-200",
  }[tint];
  // Delta chip color: > 0 = green, < 0 = red, = 0 = zinc
  const deltaCls =
    delta == null
      ? "bg-zinc-100 text-zinc-500 border-zinc-200"
      : delta > 0
        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
        : delta < 0
          ? "bg-rose-100 text-rose-800 border-rose-300"
          : "bg-zinc-100 text-zinc-600 border-zinc-200";
  const deltaText =
    delta == null
      ? "· 0 · 24h"
      : delta > 0
        ? `+${delta} %`
        : `${delta} %`;
  const inner = (
    <>
      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold tabular-nums mt-1 flex items-center gap-1.5 flex-wrap">
        <span>{value}</span>
        {delta !== undefined && (
          <span
            title={deltaLabel ?? "Δ za posledných 24h"}
            className={cn(
              "text-[10px] font-black px-1.5 py-0.5 rounded-md border tabular-nums",
              deltaCls,
            )}
          >
            {deltaText}
          </span>
        )}
        {href && (
          <span className="text-[11px] font-bold text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
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

/**
 * PipelineColumn — stĺpec pre pipeline sekciu s COUNT priamo v headeri.
 * Nahrádza samostatné StatCard tiles + Section (zjednotenie).
 */
function PipelineColumn({
  icon,
  title,
  count,
  countLast24h,
  tint,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  /** Počet za posledných 24h — zobrazí sa ako "(24h: N)" vedľa hlavného čísla. */
  countLast24h?: number;
  tint: "sky" | "violet" | "emerald";
  href?: string;
  children: React.ReactNode;
}) {
  const headerBg = {
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
  }[tint];
  const countCls = {
    sky: "text-sky-800",
    violet: "text-violet-800",
    emerald: "text-emerald-800",
  }[tint];
  return (
    <section className="rounded-2xl border bg-background overflow-hidden flex flex-col">
      <header
        className={cn(
          "px-3 py-2.5 border-b flex items-center justify-between gap-2",
          headerBg,
        )}
      >
        <div className="inline-flex items-center gap-2 min-w-0">
          {icon}
          <span className="font-bold truncate">{title}</span>
          <span
            className={cn(
              "text-2xl font-black tabular-nums leading-none ml-1",
              countCls,
            )}
          >
            · {count}
          </span>
          {countLast24h !== undefined && (
            <span
              className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0"
              title="Nových za posledných 24h"
            >
              (24h: {countLast24h})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {href && (
            <Link
              href={href}
              className="text-[10px] font-bold text-slate-600 hover:text-slate-900"
              title="Otvoriť plný zoznam"
            >
              →
            </Link>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto max-h-[520px]">
        {children}
      </div>
    </section>
  );
}

/**
 * PipelineItem — jednotný riadok v pipeline zozname.
 * Ukazuje: názov, status pill, meta info (source/city/user), extra
 * (kalendár dátum alebo cena), rel-time posledná aktivita, a
 * STAGNATION indikátor (červená bodka + text) ak last_activity_at
 * je staršie ako STAGNATION_DAYS.
 */
function PipelineItem({
  leadId,
  name,
  status,
  source,
  city,
  assignedName,
  lastActivityAt,
  stagnationCutoffMs,
  extra,
}: {
  leadId: string;
  name: string;
  status: LeadStatus;
  source?: string;
  city?: string | null;
  assignedName: string | null;
  lastActivityAt: string;
  stagnationCutoffMs: number;
  extra?: React.ReactNode;
}) {
  const activityMs = new Date(lastActivityAt).getTime();
  const isStagnant = activityMs < stagnationCutoffMs;
  const daysSince = Math.floor((Date.now() - activityMs) / 86400_000);
  return (
    <Link
      href={`/agent/leads/${leadId}`}
      className={cn(
        "px-3 py-2 hover:bg-muted/30 transition-colors block border-l-2",
        isStagnant ? "border-rose-400 bg-rose-50/30" : "border-transparent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate flex items-center gap-1.5">
            {isStagnant && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                title={`Stagnuje ${daysSince}d`}
                aria-label="Stagnuje"
              />
            )}
            {name || <span className="italic text-muted-foreground">bez mena</span>}
          </div>
          <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5 flex-wrap mt-0.5">
            <StatusPill status={status} />
            {source && <span>{source}</span>}
            {city && <span>📍 {city}</span>}
            {assignedName && <span>· {assignedName}</span>}
            {isStagnant && (
              <span className="text-rose-700 font-bold uppercase tracking-wider text-[9px]">
                🔴 stagnuje {daysSince}d
              </span>
            )}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground shrink-0 text-right space-y-0.5">
          {extra}
          <div>{relTime(lastActivityAt)}</div>
        </div>
      </div>
    </Link>
  );
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
