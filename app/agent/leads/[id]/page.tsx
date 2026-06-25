import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calculator, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
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
              {timeAgo(lead.created_at)}
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
                      className="text-lg font-bold text-emerald-700 hover:underline"
                    >
                      {lead.phone}
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
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" aria-hidden />
                  {timeAgo(act.created_at)}
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
