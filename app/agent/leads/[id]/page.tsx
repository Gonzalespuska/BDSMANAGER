import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calculator, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneSK } from "@/lib/phone-format";
import { SOURCE_TYPE_LABELS, STATUS_META, timeAgo } from "@/lib/types/lead";
import type { Lead } from "@/lib/types/lead";

export const runtime = "edge";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

/**
 * Bezpečnostne validovaný back-link. Prijmeme len INTERNÉ paths
 * (začínajúce "/" nie "//"). User 2026-07-12: „chcem aby ma to vratilo
 * tam kade som siel — vsade cez stranku".
 */
function safeBackHref(from: string | undefined): string | null {
  if (!from) return null;
  if (!from.startsWith("/") || from.startsWith("//")) return null;
  if (from.length > 500) return null;
  return from;
}

function backLabelForPath(path: string): string {
  if (path.startsWith("/admin/agents/")) return "Späť na profil obchodáka";
  if (path.startsWith("/admin/prehlad")) return "Späť na Prehľad";
  if (path.startsWith("/admin")) return "Späť do Adminu";
  if (path.startsWith("/agent")) return "Späť na Leady";
  if (path.startsWith("/dm/")) return "💬 Späť do chatu";
  if (path.startsWith("/realizacie")) return "Späť na Realizácie";
  if (path.startsWith("/obhliadky")) return "Späť na Obhliadky";
  return "Späť";
}

interface Activity {
  id: string;
  lead_id: string;
  user_id: string | null;
  user_name?: string | null;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  created: "📝 Lead vytvorený",
  phone_revealed: "👁️ Odhalil číslo",
  call_attempted: "📞 Hovor pokus",
  call_answered: "✅ Zdvihla",
  call_missed: "📵 Nedvíha",
  status_changed: "🔄 Zmena statusu",
  note_added: "💬 Poznámka obchodáka",
  assigned: "👤 Pridelené",
  lead_stolen: "🔄 Prevzatý od kolegu",
  pool_pull_more: "➕ Pull-more z poolu",
  field_updated: "✏️ Doplnené pole",
  status_changed_manual: "🔄 Zmena statusu (manuálne)",
  scheduled_callback: "📅 Naplánovaný callback",
  sla_breached: "🔴 SLA breach",
  email_sent: "📧 Email odoslaný",
  call_missed_sms_sent: "📱 SMS po nezdvíhaní",
};

/** "27.06.2026 o 14:23:05" — explicitné DD.MM.YYYY o HH:MM:SS */
function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} o ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Trvanie medzi dvomi ISO timestampmi v ľudskej forme:
 *   "za 17 min 35 s od príchodu leadu"
 *   "za 2 h 15 min od príchodu leadu"
 *   "za 5 s od príchodu leadu"
 */
function formatDurationFromLead(
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  if (!from || !to) return null;
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  if (diffMs < 0) return null;
  const sec = Math.floor(diffMs / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  // Sekundy iba ak je celý čas pod 1h (inak je to šum)
  if (days === 0 && hours === 0) {
    parts.push(`${seconds} s`);
  }
  if (parts.length === 0) parts.push("0 s");
  return `za ${parts.join(" ")} od príchodu leadu`;
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const backHref = safeBackHref(sp.from);
  const supabase = await createClient();

  const [leadRes, activitiesRes] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (leadRes.error || !leadRes.data) notFound();

  const lead = leadRes.data as Lead;
  const rawActivities = (activitiesRes.data ?? []) as Activity[];

  // Batch fetch mien users pre všetky user_id v activities + synthetic
  // events (phone_revealed_by, stolen_from, assigned_to).
  const dataFields = lead.data as Record<string, string | number>;
  const leadAny = lead as unknown as {
    phone_revealed_at?: string | null;
    phone_revealed_by?: string | null;
    stolen_at?: string | null;
    stolen_from?: string | null;
    assigned_to?: string | null;
    data?: Record<string, unknown> | null;
  };
  const userIds = Array.from(
    new Set(
      [
        ...rawActivities.map((a) => a.user_id).filter(Boolean),
        leadAny.phone_revealed_by,
        leadAny.stolen_from,
        leadAny.assigned_to,
      ].filter(Boolean) as string[],
    ),
  );
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, email")
      .in("id", userIds);
    for (const u of usersData ?? []) {
      const uid = (u as { id: string }).id;
      const name = (u as { name: string | null; email: string }).name;
      const email = (u as { email: string }).email;
      userMap.set(uid, name || email);
    }
  }

  // Synthetic events z lead columns (historické záznamy pred aktivity logom).
  // User 2026-07-16: „andrej kolar ho mal v cp poslana a poznamku v nom
  // takze toto vsetko tam musi byt". Timeline musí ukázať aj:
  //   - odhalenie čísla (phone_revealed_at)
  //   - stolen (stolen_at + stolen_from)
  //   - poznámku obchodáka (data.agent_note)
  // Ak už tie eventy máme v lead_activities (pre novšie leady), synthetic
  // sa vynechá (deduplikácia podľa typu).
  const existingTypes = new Set(rawActivities.map((a) => a.type));
  const synthetic: Activity[] = [];

  if (leadAny.phone_revealed_at && !existingTypes.has("phone_revealed")) {
    synthetic.push({
      id: `synth-phone-${lead.id}`,
      lead_id: lead.id,
      user_id: leadAny.phone_revealed_by ?? null,
      user_name: leadAny.phone_revealed_by
        ? userMap.get(leadAny.phone_revealed_by) ?? null
        : null,
      type: "phone_revealed",
      data: { synthetic: true },
      created_at: leadAny.phone_revealed_at,
    });
  }

  if (
    leadAny.stolen_at &&
    leadAny.stolen_from &&
    !existingTypes.has("lead_stolen")
  ) {
    synthetic.push({
      id: `synth-steal-${lead.id}`,
      lead_id: lead.id,
      user_id: leadAny.assigned_to ?? null,
      user_name: leadAny.assigned_to
        ? userMap.get(leadAny.assigned_to) ?? null
        : null,
      type: "lead_stolen",
      data: {
        synthetic: true,
        from_name: leadAny.stolen_from
          ? userMap.get(leadAny.stolen_from) ?? "?"
          : "?",
      },
      created_at: leadAny.stolen_at,
    });
  }

  // Agent note — časovo nemáme timestamp, použijeme last_activity_at ako
  // best-guess. Ukazuje sa ako info riadok "poznámka obchodáka: …".
  const agentNote = (leadAny.data as Record<string, unknown> | null | undefined)
    ?.agent_note;
  if (typeof agentNote === "string" && agentNote.trim().length > 0) {
    synthetic.push({
      id: `synth-note-${lead.id}`,
      lead_id: lead.id,
      user_id: leadAny.assigned_to ?? null,
      user_name: leadAny.assigned_to
        ? userMap.get(leadAny.assigned_to) ?? null
        : null,
      type: "note_added",
      data: { note: agentNote.trim(), synthetic: true },
      created_at:
        (lead as unknown as { last_activity_at?: string })
          .last_activity_at ?? lead.created_at,
    });
  }

  // Aktuálne priradenie ako info (pre historický kontext).
  if (leadAny.assigned_to && !existingTypes.has("assigned")) {
    synthetic.push({
      id: `synth-assign-${lead.id}`,
      lead_id: lead.id,
      user_id: leadAny.assigned_to,
      user_name: userMap.get(leadAny.assigned_to) ?? null,
      type: "assigned",
      data: { synthetic: true },
      created_at: lead.created_at,
    });
  }

  const activities: Activity[] = [
    ...rawActivities.map((a) => ({
      ...a,
      user_name: a.user_id ? userMap.get(a.user_id) ?? null : null,
    })),
    ...synthetic,
  ].sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref ?? "/agent"}>
            <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden />
            {backHref ? backLabelForPath(backHref) : "Späť na leady"}
          </Link>
        </Button>
      </div>

      <header className="flex items-start gap-4 flex-wrap justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className={`inline-flex items-center text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${STATUS_META[lead.status].pill}`}
            >
              {STATUS_META[lead.status].label}
            </span>
            <span className="text-xs text-muted-foreground">
              {SOURCE_TYPE_LABELS[lead.source_type]} ·{" "}
              <span title={formatAbsolute(lead.created_at)} className="font-semibold">
                {timeAgo(lead.created_at)}
              </span>
              <span className="ml-1 text-muted-foreground/80 tabular-nums">
                ({formatAbsolute(lead.created_at)})
              </span>
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {lead.name}
          </h1>
          {lead.source_campaign && (
            <p className="text-sm text-muted-foreground">
              {lead.source_campaign}
            </p>
          )}
        </div>

        {/* Primary CTA — vytvor ponuku */}
        <Button asChild size="lg" className="bg-sky-600 hover:bg-sky-700">
          <Link href={`/generator?lead=${lead.id}`}>
            <Calculator className="w-5 h-5 mr-2" aria-hidden />
            Vygenerovať ponuku
          </Link>
        </Button>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: contact + data */}
        <div className="md:col-span-2 space-y-4">
          <section className="rounded-lg border bg-background p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Kontakt
            </h2>
            <div className="space-y-2">
              {lead.phone && (
                <div>
                  <span className="text-xs text-muted-foreground">Telefón</span>
                  <div>
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-lg font-bold text-emerald-700 hover:underline tabular-nums"
                    >
                      {formatPhoneSK(lead.phone)}
                    </a>
                  </div>
                </div>
              )}
              {lead.email && (
                <div>
                  <span className="text-xs text-muted-foreground">Email</span>
                  <div>
                    <a
                      href={`mailto:${lead.email}`}
                      className="text-sm hover:underline"
                    >
                      {lead.email}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </section>

          {Object.keys(dataFields).length > 0 && (
            <section className="rounded-lg border bg-background p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Detaily dopytu
              </h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(dataFields).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground capitalize">
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd className="font-semibold">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="rounded-lg border bg-background p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Časová os
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Lead vytvorený
                </dt>
                <dd className="font-bold tabular-nums">
                  {formatAbsolute(lead.created_at)}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {timeAgo(lead.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Číslo odhalené obchodákom
                </dt>
                <dd className="font-bold tabular-nums">
                  {lead.phone_revealed_at
                    ? formatAbsolute(lead.phone_revealed_at)
                    : "—"}
                </dd>
                <dd className="text-xs font-bold text-emerald-700">
                  {lead.phone_revealed_at
                    ? (formatDurationFromLead(
                        lead.created_at,
                        lead.phone_revealed_at,
                      ) ?? timeAgo(lead.phone_revealed_at))
                    : "ešte neodhalené"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Prvý kontakt
                </dt>
                <dd className="font-bold tabular-nums">
                  {lead.first_contact_at
                    ? formatAbsolute(lead.first_contact_at)
                    : "—"}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {lead.first_contact_at
                    ? timeAgo(lead.first_contact_at)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Posledná aktivita
                </dt>
                <dd className="font-bold tabular-nums">
                  {formatAbsolute(lead.last_activity_at)}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {timeAgo(lead.last_activity_at)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border bg-background p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Stav
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="font-semibold">{lead.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Priorita</dt>
                <dd className="font-semibold">{lead.priority}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pokusy</dt>
                <dd className="font-semibold">{lead.call_attempts}×</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">SLA</dt>
                <dd className="font-semibold">{lead.sla_status}</dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Right: activity timeline */}
        <aside className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Timeline
          </h2>
          <ol className="space-y-3">
            {activities.length === 0 && (
              <li className="text-sm text-muted-foreground italic">
                Žiadne aktivity zatiaľ.
              </li>
            )}
            {activities.map((act) => {
              // Rozšírené detaily podľa typu — status_changed vidieť from→to,
              // field_updated vidieť aký field sa menil, atď.
              const d = act.data ?? {};
              let extra: React.ReactNode = null;
              // User 2026-07-16: „lead vytvoreny to je co ty kokot to co
              // znamena ako vytvoreny manual meta google co". Rozšírime
              // created event o source label + campaign.
              if (act.type === "created") {
                const sourceMap: Record<string, { label: string; color: string }> = {
                  facebook: { label: "📘 Meta / Facebook", color: "bg-indigo-100 text-indigo-800" },
                  instagram: { label: "📷 Meta / Instagram", color: "bg-fuchsia-100 text-fuchsia-800" },
                  meta_form: { label: "📘 Meta form", color: "bg-indigo-100 text-indigo-800" },
                  fb_lead_ads: { label: "📘 Meta / Facebook Ads", color: "bg-indigo-100 text-indigo-800" },
                  web_webhook: { label: "🌐 Web (epoxidovo.sk)", color: "bg-sky-100 text-sky-800" },
                  website: { label: "🌐 Web", color: "bg-sky-100 text-sky-800" },
                  google: { label: "🔍 Google Ads", color: "bg-rose-100 text-rose-800" },
                  manual: { label: "✍️ Manuálne (admin)", color: "bg-amber-100 text-amber-800" },
                };
                const meta = sourceMap[lead.source_type] ?? {
                  label: `📥 ${lead.source_type}`,
                  color: "bg-slate-100 text-slate-800",
                };
                extra = (
                  <div className="mt-1 space-y-1">
                    <span
                      className={
                        "inline-flex items-center text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded " +
                        meta.color
                      }
                    >
                      {meta.label}
                    </span>
                    {lead.source_campaign && (
                      <div className="text-xs text-slate-600">
                        Kampaň: <span className="font-semibold">{lead.source_campaign}</span>
                        {(() => {
                          const adName =
                            (leadAny.data as Record<string, unknown> | null | undefined)
                              ?.meta_ad_name;
                          return typeof adName === "string" && adName ? (
                            <>
                              {" · "}
                              <span className="font-semibold">{adName}</span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                );
              } else if (act.type === "status_changed") {
                const from = d.from as string | undefined;
                const to = d.to as string | undefined;
                extra = (
                  <div className="text-xs text-slate-600 mt-1">
                    <span className="font-mono bg-slate-100 px-1 rounded">
                      {from ?? "—"}
                    </span>{" "}
                    →{" "}
                    <span className="font-mono bg-emerald-100 px-1 rounded font-bold">
                      {to ?? "—"}
                    </span>
                  </div>
                );
              } else if (act.type === "field_updated") {
                extra = (
                  <div className="text-xs text-slate-600 mt-1">
                    <span className="font-mono bg-slate-100 px-1 rounded">
                      {String(d.field ?? "")}
                    </span>{" "}
                    ={" "}
                    <span className="font-semibold">
                      {String(d.value ?? "").slice(0, 80)}
                    </span>
                  </div>
                );
              } else if (act.type === "call_missed") {
                extra = (
                  <div className="text-xs text-slate-600 mt-1">
                    Pokus <strong>#{String(d.attempts ?? "?")}</strong>
                    {d.reminder_in_hours != null && (
                      <>
                        {" "}
                        · pripomienka o{" "}
                        <strong>{String(d.reminder_in_hours)}h</strong>
                      </>
                    )}
                  </div>
                );
              } else if (act.type === "note_added") {
                const note = String(d.note ?? "").trim();
                if (note) {
                  extra = (
                    <div className="text-xs text-slate-700 mt-1 italic bg-amber-50 border border-amber-200 rounded p-2">
                      „{note}"
                    </div>
                  );
                }
              } else if (act.type === "lead_stolen") {
                const from = String(d.from_name ?? "?");
                extra = (
                  <div className="text-xs text-slate-600 mt-1">
                    Prevzatý od <strong>{from}</strong>
                  </div>
                );
              }
              return (
                <li
                  key={act.id}
                  className="rounded-lg border bg-background p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold flex-1 min-w-0">
                      {ACTIVITY_LABELS[act.type] ?? act.type}
                    </div>
                    {act.user_name && (
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                        {act.user_name}
                      </span>
                    )}
                  </div>
                  {extra}
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1 tabular-nums">
                    <Clock className="w-3 h-3" aria-hidden />
                    <span>{timeAgo(act.created_at)}</span>
                    <span className="text-muted-foreground/70">
                      · {formatAbsolute(act.created_at)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
