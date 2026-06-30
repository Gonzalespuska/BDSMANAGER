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

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_META, type LeadStatus } from "@/lib/types/lead";
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
  if (user.role !== "admin") redirect("/agent");

  const sb = createAdminClient();
  const now = Date.now();
  const since7 = new Date(now - 7 * 86400_000).toISOString();
  const since30 = new Date(now - 30 * 86400_000).toISOString();

  // ─── 1) LEADY (obchod) — posledných 10 ────────────────────────────────
  const { data: recentLeads } = await sb
    .from("leads")
    .select("id, name, status, source_type, created_at, assigned_to, phone_revealed_at, value_estimate")
    .order("created_at", { ascending: false })
    .limit(10);

  // Lead counts
  const { count: leadsTotal } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true });
  const { count: leads7d } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since7);
  const { count: leadsNew } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");

  // ─── 2) OBHLIADKY — leady so status "scheduled" (zatiaľ proxy) ────────
  const { data: recentObhliadky } = await sb
    .from("leads")
    .select("id, name, status, next_callback_at, last_activity_at, assigned_to, data")
    .in("status", ["scheduled", "interested"])
    .order("last_activity_at", { ascending: false })
    .limit(10);

  const { count: obhliadkyOpen } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .in("status", ["scheduled", "interested"]);

  // ─── 3) REALIZÁCIE — leady so status "won" alebo "quote_sent" ─────────
  const { data: recentRealizacie } = await sb
    .from("leads")
    .select("id, name, status, last_activity_at, value_estimate, assigned_to, data")
    .in("status", ["won", "quote_sent"])
    .order("last_activity_at", { ascending: false })
    .limit(10);

  const { count: realizacieActive } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "won");
  const { count: realizacie30d } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "won")
    .gte("last_activity_at", since30);

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
          <Eye className="w-6 h-6 text-sky-500" aria-hidden />
          Prehľad — supervision
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only audit view. Admin tu nič nemení — len overuje že tím
          tečie, nedochádza k stagnácii a všetky 3 role pracujú.
        </p>
      </header>

      {/* Top stats — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<Phone className="w-4 h-4 text-sky-600" />}
          label="Leady spolu"
          value={leadsTotal ?? 0}
          tint="sky"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-sky-600" />}
          label="Nové za 7 dní"
          value={leads7d ?? 0}
          tint="sky"
        />
        <StatCard
          icon={<Activity className="w-4 h-4 text-rose-600" />}
          label="Status NOVÝ"
          value={leadsNew ?? 0}
          tint="rose"
        />
        <StatCard
          icon={<ClipboardList className="w-4 h-4 text-violet-600" />}
          label="Otvorené obhliadky"
          value={obhliadkyOpen ?? 0}
          tint="violet"
        />
        <StatCard
          icon={<Hammer className="w-4 h-4 text-emerald-600" />}
          label="Aktívne realizácie"
          value={realizacieActive ?? 0}
          tint="emerald"
        />
        <StatCard
          icon={<Calendar className="w-4 h-4 text-emerald-600" />}
          label="Dokončené 30 dní"
          value={realizacie30d ?? 0}
          tint="emerald"
        />
      </div>

      {/* 3 sekcie — vedľa seba na xl, pod seba na menších */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ────── LEADY ────── */}
        <Section
          icon={<Phone className="w-5 h-5 text-sky-500" />}
          title="Leady (obchod)"
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "sky" | "violet" | "emerald" | "rose";
}) {
  const tintBg = {
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
    rose: "bg-rose-50 border-rose-200",
  }[tint];
  return (
    <div className={cn("rounded-xl border p-3", tintBg)}>
      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold tabular-nums mt-1">{value}</div>
    </div>
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
