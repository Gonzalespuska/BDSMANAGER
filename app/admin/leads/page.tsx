import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Share2 as Facebook,
  Globe,
  Phone,
  UserCircle,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneSK } from "@/lib/phone-format";
import {
  STATUS_META,
  SOURCE_TYPE_LABELS,
  type LeadStatus,
} from "@/lib/types/lead";
import { isTestLeadName } from "@/lib/test-account";
import { cn } from "@/lib/utils";

/** "pred 2h 15min" / "pred 3d" — kompaktný SK relative time. */
function relTimeSK(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "práve teraz";
  if (diffMin < 60) return `pred ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffH < 24)
    return remMin > 0 ? `pred ${diffH}h ${remMin}min` : `pred ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `pred ${diffD}d`;
  const diffW = Math.floor(diffD / 7);
  if (diffW < 4) return `pred ${diffW}t`;
  return new Date(iso).toLocaleDateString("sk-SK");
}

/** Mapa source_type → široká kategória (Meta / Web / iné) */
function sourceCategory(src: string): "meta" | "web" | "other" {
  if (["facebook", "instagram", "meta_form", "fb_lead_ads"].includes(src))
    return "meta";
  if (["web_webhook", "website", "web"].includes(src)) return "web";
  return "other";
}

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface AdminLeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  source_type: string;
  source_campaign: string | null;
  assigned_to: string | null;
  assigned_user_name: string | null;
  phone_revealed_at: string | null;
  phone_revealed_by_name: string | null;
  created_at: string;
}

export default async function AdminLeadsPage() {
  const sb = createAdminClient();

  const { data: leadsRaw } = await sb
    .from("leads")
    .select(
      "id, name, email, phone, status, source_type, source_campaign, assigned_to, phone_revealed_at, phone_revealed_by, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const leads = leadsRaw ?? [];

  const userIds = Array.from(
    new Set(
      leads
        .flatMap((l) => [l.assigned_to, l.phone_revealed_by])
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

  const rows: AdminLeadRow[] = leads.map((l) => ({
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
    phone_revealed_at: (l.phone_revealed_at as string) ?? null,
    phone_revealed_by_name: l.phone_revealed_by
      ? (userMap.get(l.phone_revealed_by as string) ?? null)
      : null,
    created_at: (l.created_at as string) ?? "",
  }));

  // Zoskupené podľa priradenia
  const byAgent = new Map<string, AdminLeadRow[]>();
  const unassigned: AdminLeadRow[] = [];
  for (const r of rows) {
    if (!r.assigned_to) {
      unassigned.push(r);
    } else {
      const k = r.assigned_to;
      if (!byAgent.has(k)) byAgent.set(k, []);
      byAgent.get(k)!.push(r);
    }
  }

  const revealedCount = rows.filter((r) => r.phone_revealed_at).length;

  // Posledný Meta lead + posledný Web lead — rows sú už zoradené desc
  // podľa created_at, takže prvý match je najnovší.
  // TEST-named leady vylučujeme (user: "nepocitaj testy do statistik").
  const lastMetaLead = rows.find(
    (r) =>
      sourceCategory(r.source_type) === "meta" && !isTestLeadName(r.name),
  );
  const lastWebLead = rows.find(
    (r) => sourceCategory(r.source_type) === "web" && !isTestLeadName(r.name),
  );

  return (
    <div className="space-y-4">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Phone className="w-6 h-6 text-sky-500" aria-hidden />
          Všetky leady{" "}
          <span className="text-sky-500 tabular-nums">({rows.length})</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Najnovších 500 leadov. Karty zoskupené podľa priradeného agenta.
        </p>
      </header>

      {/* Posledné leady per zdroj — Meta / Web.
          Admin tu vidí či pipeline z Meta/webu tečie realtime. */}
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
        <LastLeadCard
          label="Posledný Meta lead"
          icon={<Facebook className="w-4 h-4" aria-hidden />}
          tint="violet"
          lead={lastMetaLead}
        />
        <LastLeadCard
          label="Posledný Web lead"
          icon={<Globe className="w-4 h-4" aria-hidden />}
          tint="sky"
          lead={lastWebLead}
        />
      </div>

      {/* Stats */}
      <div className="grid gap-2 grid-cols-3">
        <Stat label="Celkovo" value={rows.length} />
        <Stat label="Odhalené" value={revealedCount} accent="emerald" />
        <Stat label="Nepridelené" value={unassigned.length} accent="amber" />
      </div>

      {/* Nepriradené sekcia */}
      {unassigned.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Nepridelené ({unassigned.length})
          </h2>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {unassigned.map((l) => (
              <LeadCardMini key={l.id} lead={l} />
            ))}
          </div>
        </section>
      )}

      {/* Sekcie podľa agenta */}
      {Array.from(byAgent.entries()).map(([agentId, agentLeads]) => (
        <section key={agentId}>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
            <UserCircle className="w-3.5 h-3.5 text-sky-600" aria-hidden />
            <Link
              href={`/admin/agents/${agentId}`}
              className="text-sky-700 hover:underline decoration-dotted"
            >
              {agentLeads[0].assigned_user_name ?? "Bez mena"}
            </Link>
            <span className="text-muted-foreground font-normal">
              ({agentLeads.length})
            </span>
          </h2>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {agentLeads.map((l) => (
              <LeadCardMini key={l.id} lead={l} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function LeadCardMini({ lead }: { lead: AdminLeadRow }) {
  return (
    <Link
      href={`/agent/leads/${lead.id}`}
      className="block rounded-lg border bg-background p-2.5 hover:border-sky-300 hover:bg-sky-50/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
            STATUS_META[lead.status]?.pill ?? "bg-zinc-400 text-white",
          )}
        >
          {STATUS_META[lead.status]?.label ?? lead.status}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {SOURCE_TYPE_LABELS[lead.source_type] ?? lead.source_type}
        </span>
      </div>
      <div className="font-bold text-sm truncate">
        {lead.name || (
          <span className="text-muted-foreground italic">bez mena</span>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground truncate mt-0.5 tabular-nums">
        {lead.phone ? formatPhoneSK(lead.phone) : (lead.email ?? "—")}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        {lead.phone_revealed_at ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
            <Eye className="w-2.5 h-2.5" aria-hidden />
            {formatShort(lead.phone_revealed_at)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <EyeOff className="w-2.5 h-2.5" aria-hidden />
            neodhalené
          </span>
        )}
        <span className="text-muted-foreground tabular-nums">
          {formatShort(lead.created_at)}
        </span>
      </div>
    </Link>
  );
}

function LastLeadCard({
  label,
  icon,
  tint,
  lead,
}: {
  label: string;
  icon: React.ReactNode;
  tint: "violet" | "sky";
  lead: AdminLeadRow | undefined;
}) {
  const tintCls =
    tint === "violet"
      ? "border-violet-200 bg-violet-50/60 text-violet-800"
      : "border-sky-200 bg-sky-50/60 text-sky-800";
  const iconCls = tint === "violet" ? "text-violet-600" : "text-sky-600";
  if (!lead) {
    return (
      <div
        className={cn(
          "rounded-xl border-2 px-4 py-3 flex items-center gap-3",
          tintCls,
          "opacity-60",
        )}
      >
        <div className={cn("shrink-0", iconCls)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider font-bold">
            {label}
          </div>
          <div className="text-sm font-semibold text-muted-foreground italic">
            zatiaľ žiadny
          </div>
        </div>
      </div>
    );
  }
  return (
    <Link
      href={`/agent/leads/${lead.id}`}
      className={cn(
        "rounded-xl border-2 px-4 py-3 flex items-center gap-3 hover:shadow-md hover:border-current transition-all",
        tintCls,
      )}
    >
      <div className={cn("shrink-0", iconCls)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5">
          {label}
          <span className="text-current/70 normal-case tabular-nums">
            · {relTimeSK(lead.created_at)}
          </span>
        </div>
        <div className="text-sm font-extrabold truncate">
          {lead.name || (
            <span className="italic text-muted-foreground">bez mena</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums truncate">
          {SOURCE_TYPE_LABELS[lead.source_type] ?? lead.source_type}
          {lead.source_campaign && ` · ${lead.source_campaign}`}
          {lead.phone && ` · ${formatPhoneSK(lead.phone)}`}
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}) {
  return (
    <div className="rounded-xl border bg-background px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-extrabold tabular-nums",
          accent === "emerald" && "text-emerald-700",
          accent === "amber" && "text-amber-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function formatShort(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
