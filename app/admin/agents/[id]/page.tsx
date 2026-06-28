import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  Phone,
  ShieldCheck,
  UserCircle,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUserRole } from "@/lib/auth";
import {
  STATUS_META,
  SOURCE_TYPE_LABELS,
  type LeadStatus,
} from "@/lib/types/lead";
import { cn } from "@/lib/utils";

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
  const { data: agent } = await sb
    .from("users")
    .select(
      "id, email, name, phone, role, active, capacity, auth_id, last_active_at, created_at, last_login_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!agent) notFound();

  // 2) Jeho leady (priradené)
  const { data: assignedLeads } = await sb
    .from("leads")
    .select(
      "id, name, phone, email, status, source_type, phone_revealed_at, created_at, last_activity_at",
    )
    .eq("assigned_to", id)
    .order("created_at", { ascending: false });

  // 3) Leady ktoré on odhalil (phone_revealed_by) — môžu sa prelínať
  const { data: revealedLeads } = await sb
    .from("leads")
    .select(
      "id, name, phone, status, source_type, phone_revealed_at, assigned_to, created_at",
    )
    .eq("phone_revealed_by", id)
    .order("phone_revealed_at", { ascending: false });

  const leads = assignedLeads ?? [];
  const reveals = revealedLeads ?? [];

  // Inaktivita = hodiny od posledného odhalenia čísla.
  // Ak nikdy neodhalil → ber created_at ako baseline.
  const lastRevealTs = reveals[0]?.phone_revealed_at as string | undefined;
  const baseTs = lastRevealTs ?? (agent.created_at as string);
  const inactiveHours = baseTs
    ? (Date.now() - new Date(baseTs).getTime()) / (1000 * 60 * 60)
    : 999;
  const inactive24h = agent.role !== "admin" && inactiveHours >= 24;

  // 4) Stats
  const activeLeadCount = leads.filter(
    (l) => !["won", "lost", "archived"].includes(l.status as string),
  ).length;
  const revealedFromAssigned = leads.filter((l) => l.phone_revealed_at).length;
  const lastReveal = reveals[0]?.phone_revealed_at ?? null;

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
          {/* Riadok 1: meno + 24h badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight leading-none">
              {agent.name || (
                <span className="text-muted-foreground italic">bez mena</span>
              )}
            </h1>
            {inactive24h && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-wider"
                title="Žiadne odhalené číslo za posledných 24h"
              >
                24h+ neaktívny
              </span>
            )}
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
        <Stat label="Odhalených čísel" value={reveals.length} accent="emerald" />
        <div className="rounded-xl border bg-background px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Posledné odhalenie
          </div>
          <div className="text-sm font-bold mt-1">
            {lastReveal ? formatDateTime(lastReveal) : "—"}
          </div>
        </div>
      </div>

      {/* Phone editor — telefón obchodníka pre email signature + PDF footer */}
      <PhoneEditor
        agentId={agent.id as string}
        initialPhone={(agent.phone as string | null) ?? null}
        agentName={(agent.name as string) || "obchodník"}
      />

      {/* Permissions */}
      <PermissionsCard
        agentId={agent.id as string}
        role={(agent.role as AppUserRole) ?? "obchod"}
        active={!!agent.active}
        name={(agent.name as string) || (agent.email as string) || "obchodník"}
      />

      {/* Leady priradené tomuto agentovi */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-2">
          <Phone className="w-4 h-4 text-sky-500" aria-hidden />
          Priradené leady ({leads.length})
        </h2>
        <div className="rounded-xl border bg-background overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40">
              <tr className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Odhalené číslo</th>
                <th className="text-right px-3 py-2">Vytvorený</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((l) => (
                <tr key={l.id as string} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link
                      href={`/agent/leads/${l.id}`}
                      className="font-bold hover:underline decoration-dotted"
                    >
                      {(l.name as string) || (
                        <span className="text-muted-foreground italic">bez mena</span>
                      )}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      {(l.phone as string | null) ?? (l.email as string | null) ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                        STATUS_META[l.status as LeadStatus]?.pill ??
                          "bg-zinc-400 text-white",
                      )}
                    >
                      {STATUS_META[l.status as LeadStatus]?.label ?? l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.phone_revealed_at ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold tabular-nums">
                        <Eye className="w-3 h-3" aria-hidden />
                        {formatDateTime(l.phone_revealed_at as string)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <EyeOff className="w-3 h-3" aria-hidden />
                        ešte nie
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted-foreground tabular-nums">
                    {formatDateTime(l.created_at as string)}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                    Žiadne leady priradené.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Časová os odhalených čísel */}
      {reveals.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-600" aria-hidden />
            História klikov na „Odhaliť číslo" ({reveals.length})
          </h2>
          <ul className="rounded-xl border bg-background divide-y">
            {reveals.map((r) => (
              <li key={r.id as string} className="px-3 py-2 flex items-center justify-between gap-3">
                <Link
                  href={`/agent/leads/${r.id}`}
                  className="font-semibold text-sm hover:underline decoration-dotted truncate"
                >
                  {(r.name as string) || (
                    <span className="text-muted-foreground italic">bez mena</span>
                  )}
                </Link>
                <span className="text-xs text-emerald-700 font-bold tabular-nums shrink-0">
                  {formatDateTime(r.phone_revealed_at as string)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
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
