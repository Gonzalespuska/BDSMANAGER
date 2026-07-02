import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  Hammer,
  CheckCircle2,
  Image as ImageIcon,
  Users,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /agent/moje-zakazky — obchodák monitoring zákaziek ktoré posunul ďalej.
 *
 * 3 sekcie:
 *   • Na obhliadke (status=needs_inspection) — čaká na výsledok od obhliadkára
 *   • V realizácii (status=in_realization) — realizator pracuje, môžeš pozerať foto
 *   • Dokončené (status=won s realization_completed_at) — hotové zákazky
 */
export default async function MojeZakazkyPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  if (user.role !== "obchod" && user.role !== "admin") {
    redirect("/agent");
  }

  const sb = createAdminClient();

  // Bázová query pre všetky sekcie: leady kde JA som obchodník (assigned_to)
  const baseQuery = () =>
    sb
      .from("leads")
      .select(
        "id, name, phone, email, status, last_activity_at, value_estimate, data, " +
          "inspection_by, inspection_at, realization_by, realization_at, realization_completed_at",
      )
      .eq("assigned_to", user.id);

  const [onInspection, inRealization, completed] = await Promise.all([
    baseQuery().eq("status", "needs_inspection").order("inspection_at", { ascending: false }),
    baseQuery().eq("status", "in_realization").order("realization_at", { ascending: false }),
    baseQuery()
      .eq("status", "won")
      .not("realization_completed_at", "is", null)
      .order("realization_completed_at", { ascending: false })
      .limit(20),
  ]);

  const inspectionLeads = (onInspection.data ?? []) as unknown as (Lead & {
    inspection_by: string | null;
    inspection_at: string | null;
  })[];
  const realizationLeads = (inRealization.data ?? []) as unknown as (Lead & {
    realization_by: string | null;
    realization_at: string | null;
  })[];
  const completedLeads = (completed.data ?? []) as unknown as (Lead & {
    realization_by: string | null;
    realization_completed_at: string | null;
  })[];

  // Media counts + resolve user names
  const allLeadIds = [
    ...inspectionLeads.map((l) => l.id),
    ...realizationLeads.map((l) => l.id),
    ...completedLeads.map((l) => l.id),
  ];
  const allUserIds = Array.from(
    new Set(
      [
        ...inspectionLeads.map((l) => l.inspection_by),
        ...realizationLeads.map((l) => l.realization_by),
        ...completedLeads.map((l) => l.realization_by),
      ].filter(Boolean) as string[],
    ),
  );

  const [{ data: mediaCountsRaw }, { data: usersRaw }] = await Promise.all([
    allLeadIds.length
      ? sb.from("realization_media").select("lead_id").in("lead_id", allLeadIds)
      : Promise.resolve({ data: [] as { lead_id: string }[] }),
    allUserIds.length
      ? sb.from("users").select("id, name, email").in("id", allUserIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
  ]);
  const mediaCounts = new Map<string, number>();
  for (const m of mediaCountsRaw ?? []) {
    mediaCounts.set(m.lead_id, (mediaCounts.get(m.lead_id) ?? 0) + 1);
  }
  const userMap = new Map((usersRaw ?? []).map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Leady
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-sky-500" aria-hidden />
          Moje zákazky v tíme
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Zákazky ktoré si posunul ďalej — obhliadkárom a realizátorom. Sleduj stav, pozri fotky z realizácie.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          icon={<ClipboardList className="w-5 h-5 text-violet-600" />}
          label="Na obhliadke"
          value={inspectionLeads.length}
          tint="violet"
          desc="Čaká výsledok"
        />
        <StatCard
          icon={<Hammer className="w-5 h-5 text-emerald-600" />}
          label="V realizácii"
          value={realizationLeads.length}
          tint="emerald"
          desc="Práca prebieha"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-sky-600" />}
          label="Dokončené"
          value={completedLeads.length}
          tint="sky"
          desc="Posledných 20"
        />
      </div>

      {/* ─── OBHLIADKY ────────────────────────────────────────────────── */}
      <Section
        icon={<ClipboardList className="w-5 h-5 text-violet-600" />}
        title="Čakám na obhliadku"
        emptyMsg="Zatiaľ si žiadnu zákazku neposunul na obhliadku."
        count={inspectionLeads.length}
      >
        {inspectionLeads.length > 0 && (
          <ul className="space-y-2">
            {inspectionLeads.map((l) => {
              const inspector = l.inspection_by ? userMap.get(l.inspection_by) : null;
              const data = (l.data ?? {}) as Record<string, string>;
              return (
                <li
                  key={l.id}
                  className="rounded-xl border-2 border-violet-200 bg-violet-50/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-bold">{l.name}</div>
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-1">
                        {data.lokalita && <span>📍 {data.lokalita}</span>}
                        {data.plocha && <span>{data.plocha} m²</span>}
                        {inspector && <span>· obhliadkár: <strong>{inspector.name}</strong></span>}
                      </div>
                      {l.inspection_at && (
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Posunutá {new Date(l.inspection_at).toLocaleString("sk-SK")}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-bold bg-violet-100 text-violet-800 px-2 py-0.5 rounded">
                      NA OBHLIADKE
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ─── REALIZÁCIE (in-progress) ────────────────────────────────── */}
      <Section
        icon={<Hammer className="w-5 h-5 text-emerald-600" />}
        title="V realizácii"
        emptyMsg="Žiadne zákazky momentálne nie sú v realizácii."
        count={realizationLeads.length}
      >
        {realizationLeads.length > 0 && (
          <ul className="space-y-2">
            {realizationLeads.map((l) => {
              const realizator = l.realization_by ? userMap.get(l.realization_by) : null;
              const mediaCount = mediaCounts.get(l.id) ?? 0;
              const data = (l.data ?? {}) as Record<string, string>;
              return (
                <li key={l.id}>
                  <Link
                    href={`/realizacie/${l.id}`}
                    className="block rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 hover:bg-emerald-50/70 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-bold">{l.name}</div>
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-1">
                          {data.lokalita && <span>📍 {data.lokalita}</span>}
                          {data.plocha && <span>{data.plocha} m²</span>}
                          {realizator && <span>· realizuje: <strong>{realizator.name}</strong></span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-2">
                          {l.realization_at && (
                            <span>Posunutá {new Date(l.realization_at).toLocaleString("sk-SK")}</span>
                          )}
                          {mediaCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                              <ImageIcon className="w-3.5 h-3.5" aria-hidden />
                              {mediaCount} foto/video
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {l.value_estimate != null && (
                          <div className="font-bold text-emerald-700 tabular-nums text-lg">
                            {l.value_estimate.toLocaleString("sk-SK")} €
                          </div>
                        )}
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                          V REALIZÁCII
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ─── DOKONČENÉ ────────────────────────────────────────────────── */}
      <Section
        icon={<CheckCircle2 className="w-5 h-5 text-sky-600" />}
        title="Dokončené realizácie"
        emptyMsg="Zatiaľ žiadna zákazka nebola dokončená."
        count={completedLeads.length}
      >
        {completedLeads.length > 0 && (
          <ul className="space-y-1.5">
            {completedLeads.map((l) => {
              const mediaCount = mediaCounts.get(l.id) ?? 0;
              return (
                <li key={l.id}>
                  <Link
                    href={`/realizacie/${l.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm">{l.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Dokončená{" "}
                        {new Date(l.realization_completed_at as string).toLocaleDateString("sk-SK")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {mediaCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <ImageIcon className="w-3.5 h-3.5" aria-hidden />
                          {mediaCount}
                        </span>
                      )}
                      {l.value_estimate != null && (
                        <span className="font-bold text-emerald-700 tabular-nums">
                          {l.value_estimate.toLocaleString("sk-SK")} €
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  desc,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  desc?: string;
  tint: "violet" | "emerald" | "sky";
}) {
  const tintBg = {
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
    sky: "bg-sky-50 border-sky-200",
  }[tint];
  return (
    <div className={cn("rounded-2xl border-2 p-4", tintBg)}>
      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-extrabold tabular-nums mt-1.5">{value}</div>
      {desc && <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>}
    </div>
  );
}

function Section({
  icon,
  title,
  emptyMsg,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  emptyMsg: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {count > 0 ? (
        <div>{children}</div>
      ) : (
        <div className="rounded-xl border bg-background p-6 text-center text-sm text-muted-foreground">
          {emptyMsg}
        </div>
      )}
    </section>
  );
}
