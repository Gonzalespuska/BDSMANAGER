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
}

interface Activity {
  id: string;
  lead_id: string;
  user_id: string | null;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  created: "📝 Lead vytvorený",
  phone_revealed: "👁️ Zobrazil číslo",
  call_attempted: "📞 Hovor pokus",
  call_answered: "✅ Zdvihla",
  call_missed: "📵 Nedvíha",
  status_changed: "🔄 Zmena statusu",
  note_added: "💬 Poznámka",
  assigned: "👤 Pridelené",
  scheduled_callback: "📅 Naplánovaný callback",
  sla_breached: "🔴 SLA breach",
  email_sent: "📧 Email odoslaný",
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

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [leadRes, activitiesRes] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (leadRes.error || !leadRes.data) notFound();

  const lead = leadRes.data as Lead;
  const activities = (activitiesRes.data ?? []) as Activity[];
  const dataFields = lead.data as Record<string, string | number>;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/agent">
            <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden />
            Späť na leady
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
            {activities.map((act) => (
              <li
                key={act.id}
                className="rounded-lg border bg-background p-3 text-sm"
              >
                <div className="font-semibold">
                  {ACTIVITY_LABELS[act.type] ?? act.type}
                </div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5 tabular-nums">
                  <Clock className="w-3 h-3" aria-hidden />
                  <span>{timeAgo(act.created_at)}</span>
                  <span className="text-muted-foreground/70">
                    · {formatAbsolute(act.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
