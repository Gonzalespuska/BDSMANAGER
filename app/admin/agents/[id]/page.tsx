import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  ArrowRightLeft,
  Bell,
  Clock,
  Eye,
  FilePlus,
  Mail,
  MessageSquare,
  Phone,
  PhoneOff,
  Send,
  ShieldCheck,
  Timer,
  UserCircle,
  UserPlus,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneSK } from "@/lib/phone-format";
import type { AppUserRole } from "@/lib/auth";
import {
  STATUS_META,
  SOURCE_TYPE_LABELS,
  type LeadStatus,
} from "@/lib/types/lead";
import { cn } from "@/lib/utils";

import { HomeCityEditor } from "./home-city-editor";
import { PayoutEditor } from "./payout-editor";
import { AgentNameEditor } from "./name-editor";
import { ImpersonateButton } from "./impersonate-button";
import { PermissionsCard } from "./permissions-card";
import { PhoneEditor } from "./phone-editor";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAgentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const sb = createAdminClient();

  // 1) Načítaj agenta
  // Try with payout_percent (SQL 22); fallback bez neho ak migrácia ešte nebola
  const withPayout = await sb
    .from("users")
    .select(
      "id, email, name, phone, home_city, role, active, capacity, auth_id, last_active_at, created_at, last_login_at, payout_percent",
    )
    .eq("id", id)
    .maybeSingle();

  let agentData = withPayout.data as Record<string, unknown> | null;
  if (!agentData && withPayout.error?.message?.includes("payout_percent")) {
    const fallback = await sb
      .from("users")
      .select(
        "id, email, name, phone, home_city, role, active, capacity, auth_id, last_active_at, created_at, last_login_at",
      )
      .eq("id", id)
      .maybeSingle();
    agentData = fallback.data as Record<string, unknown> | null;
  }

  if (!agentData) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = agentData as any;

  // 2) Jeho leady (priradené) — potrebujeme pre stats
  const { data: assignedLeads } = await sb
    .from("leads")
    .select("id, status, phone_revealed_at, value_estimate, last_activity_at")
    .eq("assigned_to", id);

  // 2b) CENOVÉ PONUKY — všetky leady kde poslal CP (email_sent activity
  //     s kind='quote' ALEBO status=quote_sent na priradenom leade)
  const { data: cpActivitiesRaw } = await sb
    .from("lead_activities")
    .select("lead_id, data, created_at")
    .eq("type", "email_sent")
    .order("created_at", { ascending: false })
    .limit(300);
  // Filter iba tie ktoré sa týkajú jeho priradených leadov + kind=quote
  const assignedLeadIds = new Set(
    (assignedLeads ?? []).map((l) => l.id as string),
  );
  const quoteActivities = (cpActivitiesRaw ?? []).filter((a) => {
    const kind = (a.data as { kind?: string })?.kind;
    return kind === "quote" && assignedLeadIds.has(a.lead_id as string);
  });
  // Uniqueizuj podľa lead_id (najnovšia CP na lead)
  const cpMap = new Map<
    string,
    { lead_id: string; sent_at: string; data: Record<string, unknown> }
  >();
  for (const a of quoteActivities) {
    const lid = a.lead_id as string;
    if (!cpMap.has(lid)) {
      cpMap.set(lid, {
        lead_id: lid,
        sent_at: a.created_at as string,
        data: (a.data as Record<string, unknown>) ?? {},
      });
    }
  }
  // Enrich meta na lead (name + status + value_estimate)
  const cpLeadIds = Array.from(cpMap.keys());
  const { data: cpLeadsRaw } =
    cpLeadIds.length > 0
      ? await sb
          .from("leads")
          .select("id, name, phone, status, value_estimate, data")
          .in("id", cpLeadIds)
      : { data: [] as Array<Record<string, unknown>> };
  const cpLeadsMap = new Map<string, Record<string, unknown>>();
  for (const l of cpLeadsRaw ?? []) {
    cpLeadsMap.set(l.id as string, l);
  }
  const cpList = Array.from(cpMap.values())
    .map((cp) => {
      const l = cpLeadsMap.get(cp.lead_id);
      return {
        lead_id: cp.lead_id,
        sent_at: cp.sent_at,
        subject: (cp.data.subject as string | null) ?? null,
        to: (cp.data.to as string | null) ?? null,
        lead_name: (l?.name as string) ?? "?",
        lead_phone: (l?.phone as string | null) ?? null,
        lead_status: (l?.status as string) ?? "?",
        value_estimate: Number(l?.value_estimate ?? 0),
        plocha:
          ((l?.data as Record<string, unknown>)?.plocha as string | number) ??
          null,
      };
    })
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

  // Payout kalkulácie — hodnota won leadov (celkovo + tento mesiac)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let wonAllValue = 0;
  let wonMonthValue = 0;
  for (const l of assignedLeads ?? []) {
    if (l.status !== "won") continue;
    const val = Number(l.value_estimate ?? 0) || 0;
    wonAllValue += val;
    const activityAt = l.last_activity_at
      ? new Date(l.last_activity_at as string)
      : null;
    if (activityAt && activityAt >= monthStart) {
      wonMonthValue += val;
    }
  }

  // 3) Odhalenia čísla — počítame kvôli inaktivita badge (24h+)
  const { data: revealsList } = await sb
    .from("leads")
    .select("phone_revealed_at")
    .eq("phone_revealed_by", id)
    .order("phone_revealed_at", { ascending: false })
    .limit(1);

  // 4) Activity feed — každá aktivita = 1 riadok. Aj status change, odhalenie
  //    čísla, poznámka, email, hovor.
  //    LOGIC: user_id môže byť null (email_sent zo server actions atď).
  //    Preto berieme buď user_id=id ALEBO aktivity na priradených leadoch.
  const assignedLeadIdsForActivity = (assignedLeads ?? []).map(
    (l) => l.id as string,
  );
  const [ownActRes, leadActRes] = await Promise.all([
    sb
      .from("lead_activities")
      .select("id, lead_id, user_id, type, data, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    assignedLeadIdsForActivity.length > 0
      ? sb
          .from("lead_activities")
          .select("id, lead_id, user_id, type, data, created_at")
          .in("lead_id", assignedLeadIdsForActivity)
          .is("user_id", null)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const combined = [
    ...(ownActRes.data ?? []),
    ...(leadActRes.data ?? []),
  ];
  // Dedupe by id, sort by created_at desc, limit 200
  const seen = new Set<string>();
  const activities: typeof combined = [];
  for (const a of combined.sort((x, y) =>
    String(y.created_at).localeCompare(String(x.created_at)),
  )) {
    const aid = a.id as string;
    if (seen.has(aid)) continue;
    seen.add(aid);
    activities.push(a);
    if (activities.length >= 200) break;
  }

  // Enrichnutie: pre každú aktivitu potrebujeme lead name + created_at
  const leadIds = Array.from(new Set(activities.map((a) => a.lead_id as string)));
  const leadMap = new Map<
    string,
    { name: string; created_at: string; status: string }
  >();
  if (leadIds.length > 0) {
    const { data: leadRows } = await sb
      .from("leads")
      .select("id, name, created_at, status")
      .in("id", leadIds);
    for (const l of leadRows ?? []) {
      leadMap.set(l.id as string, {
        name: (l.name as string) ?? "",
        created_at: (l.created_at as string) ?? "",
        status: (l.status as string) ?? "",
      });
    }
  }

  const leads = assignedLeads ?? [];
  const reveals = revealsList ?? [];

  // Inaktivita = hodiny od posledného odhalenia čísla ALEBO od posledného
  // last_active_at (heartbeat z shell-u). Bereme čokoľvek novšie.
  const lastRevealTs = reveals[0]?.phone_revealed_at as string | undefined;
  const lastActiveTs = agent.last_active_at as string | null;
  const baseTs =
    [lastRevealTs, lastActiveTs].filter(Boolean).sort().reverse()[0] ??
    (agent.created_at as string);
  const inactiveHours = baseTs
    ? (Date.now() - new Date(baseTs).getTime()) / (1000 * 60 * 60)
    : 999;
  const inactive24h = agent.role !== "admin" && inactiveHours >= 24;

  // Stats
  const activeLeadCount = leads.filter(
    (l) => !["won", "lost", "archived"].includes(l.status as string),
  ).length;
  const totalReveals = leads.filter((l) => l.phone_revealed_at).length;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/agents"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
        Späť na obchodníkov
      </Link>

      {/* Header — info o agentovi */}
      <div className="rounded-xl border bg-background p-4 flex items-start gap-4 flex-wrap">
        <div
          className={cn(
            "w-14 h-14 rounded-full inline-flex items-center justify-center text-base font-bold shrink-0",
            agent.role === "admin"
              ? "bg-amber-100 text-amber-800"
              : "bg-sky-100 text-sky-800",
          )}
        >
          {initials(agent.name || agent.email)}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {/* Riadok 1: meno (editovateľné) + 24h badge + impersonate button */}
          <div className="flex items-center gap-2 flex-wrap">
            <AgentNameEditor
              agentId={agent.id as string}
              initialName={(agent.name as string | null) ?? null}
              fallbackEmail={agent.email as string}
            />
            {inactive24h && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-wider"
                title="Žiadne odhalené číslo za posledných 24h"
              >
                24h+ neaktívny
              </span>
            )}
            <div className="ml-auto">
              <ImpersonateButton
                userId={agent.id as string}
                userName={(agent.name as string) || (agent.email as string) || "obchodník"}
              />
            </div>
          </div>

          {/* Riadok 2: email */}
          <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span className="font-mono">{agent.email}</span>
          </div>

          {/* Riadok 3: status pills */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                agent.role === "admin"
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-sky-50 border-sky-200 text-sky-800",
              )}
            >
              {agent.role === "admin" ? (
                <>
                  <ShieldCheck className="w-3 h-3" aria-hidden />
                  Admin
                </>
              ) : (
                <>
                  <UserCircle className="w-3 h-3" aria-hidden />
                  Obchodník
                </>
              )}
            </span>

            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                (agent.capacity ?? 0) > 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-zinc-100 border-zinc-200 text-zinc-700",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  (agent.capacity ?? 0) > 0 ? "bg-emerald-500" : "bg-zinc-400",
                )}
              />
              {(agent.capacity ?? 0) > 0 ? "Dostáva leady" : "Nedostáva leady"}
            </span>

            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                agent.active
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  agent.active ? "bg-emerald-500" : "bg-rose-500",
                )}
              />
              {agent.active ? "Má prístup" : "Prístup zablokovaný"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Aktívne leady" value={activeLeadCount} accent="sky" />
        <Stat label="Leady celkom" value={leads.length} />
        <Stat label="Odhalených čísel" value={totalReveals} accent="emerald" />
        <div className="rounded-xl border bg-background px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground inline-flex items-center gap-1">
            <Activity className="w-3 h-3" aria-hidden />
            Posledná aktivita
          </div>
          <div className="text-sm font-bold mt-1">
            {lastActiveTs ? (
              <>
                {formatDateTime(lastActiveTs)}
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  ({relTime(lastActiveTs)})
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Posledný klik / prechod v aplikácii
          </div>
        </div>
      </div>

      {/* Phone editor — telefón obchodníka pre email signature + PDF footer */}
      <PhoneEditor
        agentId={agent.id as string}
        initialPhone={(agent.phone as string | null) ?? null}
        agentName={(agent.name as string) || "obchodník"}
      />

      {/* Payout editor — % z hodnoty won leadu ide obchodákovi */}
      <PayoutEditor
        agentId={agent.id as string}
        initialPercent={Number((agent as { payout_percent?: number }).payout_percent ?? 0)}
        agentName={(agent.name as string) || "obchodník"}
        wonMonthValue={wonMonthValue}
        wonAllValue={wonAllValue}
      />

      {/* Home city editor — IBA pre realizátorov (auto-preselect podľa lokality zákazníka).
          Ostatné role (obchod / obhliadky / admin) toto pole nepotrebujú. */}
      {agent.role === "realizacie" && (
        <HomeCityEditor
          agentId={agent.id as string}
          initialCity={(agent.home_city as string | null) ?? null}
          agentRole={(agent.role as string) ?? "realizacie"}
        />
      )}

      {/* Permissions — collapsed by default, klik na "Permissions" summary. */}
      <details className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 overflow-hidden group">
        <summary className="px-4 py-2.5 cursor-pointer font-bold text-xs uppercase tracking-wider text-amber-900 hover:bg-amber-50/60 inline-flex items-center gap-2 select-none list-none">
          <span className="text-amber-700">🛡️ Permissions</span>
          <span className="text-[10px] font-normal text-amber-800/60 italic">
            (povýšiť / odobrať access — klik pre expand)
          </span>
        </summary>
        <div className="p-4 pt-0">
          <PermissionsCard
            agentId={agent.id as string}
            role={(agent.role as AppUserRole) ?? "obchod"}
            secondaryRoles={
              (Array.isArray(agent.secondary_roles)
                ? (agent.secondary_roles as AppUserRole[])
                : []) ?? []
            }
            active={!!agent.active}
            name={(agent.name as string) || (agent.email as string) || "obchodník"}
          />
        </div>
      </details>

      {/* CENOVÉ PONUKY — všetky CP ktoré agent poslal, kliknutím pozrie detail */}
      <section className="rounded-2xl border-2 border-violet-200 bg-gradient-to-b from-violet-50/40 to-transparent overflow-hidden">
        <header className="px-4 py-3 border-b bg-violet-50/60 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-extrabold text-sm inline-flex items-center gap-2 text-violet-900">
            🎯 Cenové ponuky ({cpList.length})
          </h2>
          <span className="text-[10px] text-violet-800/70 italic">
            Klik na riadok → detail leadu + celá CP
          </span>
        </header>
        {cpList.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground italic">
            Zatiaľ neposlal žiadnu cenovú ponuku.
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-violet-50/80 sticky top-0 z-10 border-b">
                <tr className="text-[10px] uppercase tracking-wider font-bold text-violet-900">
                  <th className="text-left px-3 py-2 w-28">Kedy</th>
                  <th className="text-left px-3 py-2">Zákazník</th>
                  <th className="text-right px-3 py-2 w-24">Plocha</th>
                  <th className="text-right px-3 py-2 w-28">Suma CP</th>
                  <th className="text-left px-3 py-2 w-32">Status</th>
                  <th className="text-left px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cpList.map((cp) => {
                  const sent = new Date(cp.sent_at);
                  const daysAgo = Math.floor(
                    (Date.now() - sent.getTime()) / 86400000,
                  );
                  const rel =
                    daysAgo === 0
                      ? "dnes"
                      : daysAgo === 1
                        ? "včera"
                        : `pred ${daysAgo}d`;
                  return (
                    <tr
                      key={cp.lead_id + cp.sent_at}
                      className="hover:bg-violet-50/40"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-xs font-bold">{rel}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {sent.toLocaleDateString("sk-SK", {
                            day: "2-digit",
                            month: "2-digit",
                          })}{" "}
                          {sent.toLocaleTimeString("sk-SK", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{cp.lead_name}</div>
                        {cp.lead_phone && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {formatPhoneSK(cp.lead_phone)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {cp.plocha ? `${cp.plocha} m²` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-black text-violet-900">
                        {cp.value_estimate > 0
                          ? cp.value_estimate.toLocaleString("sk-SK", {
                              maximumFractionDigits: 0,
                            }) + " €"
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {cp.lead_status === "won"
                          ? "🏆 Won"
                          : cp.lead_status === "lost"
                            ? "❌ Prehratý"
                            : cp.lead_status === "quote_sent"
                              ? "✅ CP poslaná"
                              : cp.lead_status === "not_interested"
                                ? "🚫 Nezáujem"
                                : cp.lead_status === "scheduled"
                                  ? "📅 Naplánovaná"
                                  : cp.lead_status}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/agent/leads/${cp.lead_id}?from=${encodeURIComponent(`/admin/agents/${id}`)}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:text-violet-900 hover:underline"
                        >
                          Pozrieť →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Aktivita — každá akcia = 1 riadok. Ukazuje sa všetko čo agent
          urobil na leadoch: odhalenie čísla (+ čas ktorý mu trvalo od
          príchodu leadu), zmena statusu, poslanie CP, poznámka, hovor. */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-500" aria-hidden />
          Aktivita ({activities.length})
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
            posledných {activities.length}
          </span>
        </h2>
        <div className="rounded-xl border bg-background overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40">
              <tr className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <th className="text-left px-3 py-2 w-[130px]">Kedy</th>
                <th className="text-left px-3 py-2">Akcia</th>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2 w-[180px]">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activities.map((a) => {
                const leadInfo = leadMap.get(a.lead_id as string);
                const type = a.type as string;
                const data = (a.data as Record<string, unknown>) ?? {};
                const meta = ACTIVITY_META[type] ?? {
                  icon: <Activity className="w-3.5 h-3.5" aria-hidden />,
                  label: type,
                  tint: "bg-zinc-100 text-zinc-800 border-zinc-200",
                };
                // Pre phone_revealed: koľko mu trvalo od príchodu leadu
                const timeToRevealMs =
                  type === "phone_revealed" && leadInfo?.created_at
                    ? new Date(a.created_at as string).getTime() -
                      new Date(leadInfo.created_at).getTime()
                    : null;
                return (
                  <tr key={a.id as string} className="hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 text-[11px] tabular-nums whitespace-nowrap">
                      <div className="font-semibold">
                        {formatDateTime(a.created_at as string)}
                      </div>
                      <div className="text-muted-foreground">
                        {relTime(a.created_at as string)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider",
                          meta.tint,
                        )}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/agent/leads/${a.lead_id}?from=${encodeURIComponent(`/admin/agents/${id}`)}`}
                        className="font-bold text-sm hover:underline decoration-dotted"
                      >
                        {leadInfo?.name || (
                          <span className="text-muted-foreground italic">
                            odstránený lead
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      {renderActivityDetail(type, data, timeToRevealMs)}
                    </td>
                  </tr>
                );
              })}
              {activities.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center text-muted-foreground py-8 text-sm"
                  >
                    Žiadna zaznamenaná aktivita. Ako obchodník začne
                    pracovať v CRM, jeho akcie sa objavia tu (odhalenia
                    čísel, zmeny statusov, poznámky, hovory, emaily).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Activity type meta — ikona + label + farba per typ
// ────────────────────────────────────────────────────────────────────────
const ACTIVITY_META: Record<
  string,
  { icon: React.ReactNode; label: string; tint: string }
> = {
  phone_revealed: {
    icon: <Eye className="w-3 h-3" aria-hidden />,
    label: "Odhalil číslo",
    tint: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  call_missed: {
    icon: <PhoneOff className="w-3 h-3" aria-hidden />,
    label: "Nedvíha",
    tint: "bg-amber-50 text-amber-800 border-amber-200",
  },
  call_attempted: {
    icon: <Phone className="w-3 h-3" aria-hidden />,
    label: "Skúsil zavolať",
    tint: "bg-sky-50 text-sky-800 border-sky-200",
  },
  call_answered: {
    icon: <Phone className="w-3 h-3" aria-hidden />,
    label: "Zdvihol",
    tint: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  status_changed: {
    icon: <ArrowRightLeft className="w-3 h-3" aria-hidden />,
    label: "Zmenil status",
    tint: "bg-violet-50 text-violet-800 border-violet-200",
  },
  note_added: {
    icon: <MessageSquare className="w-3 h-3" aria-hidden />,
    label: "Poznámka",
    tint: "bg-sky-50 text-sky-800 border-sky-200",
  },
  email_sent: {
    icon: <Send className="w-3 h-3" aria-hidden />,
    label: "Poslal email",
    tint: "bg-blue-50 text-blue-800 border-blue-200",
  },
  scheduled_callback: {
    icon: <Bell className="w-3 h-3" aria-hidden />,
    label: "Naplánoval callback",
    tint: "bg-purple-50 text-purple-800 border-purple-200",
  },
  assigned: {
    icon: <UserPlus className="w-3 h-3" aria-hidden />,
    label: "Priradený",
    tint: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  created: {
    icon: <FilePlus className="w-3 h-3" aria-hidden />,
    label: "Vytvoril lead",
    tint: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  sla_breached: {
    icon: <Clock className="w-3 h-3" aria-hidden />,
    label: "SLA porušené",
    tint: "bg-rose-50 text-rose-800 border-rose-200",
  },
};

function renderActivityDetail(
  type: string,
  data: Record<string, unknown>,
  timeToRevealMs: number | null,
): React.ReactNode {
  if (type === "phone_revealed") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
        <Timer className="w-3 h-3" aria-hidden />
        {timeToRevealMs != null && timeToRevealMs > 0
          ? `za ${formatDuration(timeToRevealMs)} od príchodu`
          : "—"}
      </span>
    );
  }
  if (type === "status_changed") {
    const next = data.new_status as string | undefined;
    const meta = next ? STATUS_META[next as LeadStatus] : null;
    return (
      <span className="inline-flex items-center gap-1">
        →
        {meta ? (
          <span
            className={cn(
              "inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold uppercase",
              meta.pill,
            )}
          >
            {meta.label}
          </span>
        ) : (
          <span className="font-mono">{String(next ?? "—")}</span>
        )}
        {data.source === "inline_picker" && (
          <span className="text-[10px] text-muted-foreground">(picker)</span>
        )}
      </span>
    );
  }
  if (type === "note_added") {
    const note = String(data.note ?? "").slice(0, 80);
    return note ? `„${note}${note.length >= 80 ? "…" : ""}"` : "—";
  }
  if (type === "email_sent") {
    const to = data.to as string | undefined;
    const subject = data.subject as string | undefined;
    const kind = data.kind as string | undefined;
    return (
      <div className="text-[11px]">
        {kind === "quote" && (
          <span className="inline-block mr-1 px-1 py-0.5 rounded bg-violet-100 text-violet-800 text-[9px] font-bold uppercase">
            CP
          </span>
        )}
        {to && <span className="font-mono">{to}</span>}
        {subject && <div className="truncate max-w-[180px]">{subject}</div>}
      </div>
    );
  }
  if (type === "call_missed") {
    const attempts = data.attempts as number | undefined;
    return attempts != null ? `pokus #${attempts}` : "—";
  }
  if (type === "scheduled_callback") {
    const when = data.callback_at as string | undefined;
    return when ? formatDateTime(when) : "—";
  }
  return "";
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  const restMin = min % 60;
  if (hr < 24) return restMin > 0 ? `${hr}h ${restMin}min` : `${hr}h`;
  const days = Math.floor(hr / 24);
  const restHr = hr % 24;
  return restHr > 0 ? `${days}d ${restHr}h` : `${days}d`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "teraz";
  if (min < 60) return `pred ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `pred ${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `pred ${days}d`;
  return new Date(iso).toLocaleDateString("sk-SK");
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "sky" | "emerald";
}) {
  return (
    <div className="rounded-xl border bg-background px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-extrabold tabular-nums mt-0.5",
          accent === "sky" && "text-sky-700",
          accent === "emerald" && "text-emerald-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function initials(s: string): string {
  if (!s) return "?";
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
