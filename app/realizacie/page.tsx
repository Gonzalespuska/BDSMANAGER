import { redirect } from "next/navigation";
import Link from "next/link";
import { Hammer, Calendar, Package, CheckCircle2, ArrowRight } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /realizacie — Dashboard pre realizačný tím.
 *
 * Zobrazí:
 *   - Aktívne realizácie priradené prihlásenému userovi (realization_by=me.id)
 *     alebo všetky ak admin
 *   - Historické realizácie (won so realization_completed_at)
 */
export default async function RealizacieDashboard() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  if (user.role !== "realizacie" && user.role !== "admin") {
    const { dashboardPathForRole } = await import("@/lib/roles");
    redirect(dashboardPathForRole(user.role));
  }

  const sb = createAdminClient();

  // Aktívne realizácie: status=in_realization + priradené mne (alebo všetky pre admin)
  const activeQuery = sb
    .from("leads")
    .select(
      "id, name, phone, email, status, last_activity_at, value_estimate, assigned_to, realization_by, realization_at, data",
    )
    .eq("status", "in_realization")
    .order("realization_at", { ascending: false });

  const activeQueryScoped = user.role === "admin"
    ? activeQuery
    : activeQuery.eq("realization_by", user.id);

  const { data: activeRaw } = await activeQueryScoped;
  const active = (activeRaw ?? []) as (Lead & { realization_by: string; realization_at: string })[];

  // Historické: won so realization_completed_at
  const historyQuery = sb
    .from("leads")
    .select("id, name, value_estimate, realization_completed_at, realization_by")
    .eq("status", "won")
    .not("realization_completed_at", "is", null)
    .order("realization_completed_at", { ascending: false })
    .limit(20);
  const historyQueryScoped = user.role === "admin"
    ? historyQuery
    : historyQuery.eq("realization_by", user.id);
  const { data: history } = await historyQueryScoped;

  // Fallback: ak DB migration ešte nebola spustená, in_realization vôbec neexistuje.
  // Ukážeme dovtedy legacy 'won'+'quote_sent' leady (proxy).
  const showLegacyProxy = active.length === 0;
  let legacyActive: Lead[] = [];
  if (showLegacyProxy) {
    const legacyQuery = sb
      .from("leads")
      .select("*")
      .in("status", ["won", "quote_sent"])
      .order("last_activity_at", { ascending: false })
      .limit(20);
    const scoped = user.role === "admin" ? legacyQuery : legacyQuery.eq("assigned_to", user.id);
    const { data } = await scoped;
    legacyActive = (data ?? []) as Lead[];
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Hammer className="w-6 h-6 text-emerald-500" aria-hidden />
          Realizácie
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user.role === "admin"
            ? "Všetky prebiehajúce a dokončené realizácie (admin view)."
            : "Zákazky ktoré ti obchodník posunul na realizáciu. Klik na detail → foto upload + označiť hotovo."}
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<Calendar className="w-5 h-5 text-emerald-600" />}
          label="Aktívne realizácie"
          value={active.length}
          tint="emerald"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-sky-600" />}
          label="Dokončené"
          value={history?.length ?? 0}
          tint="sky"
        />
        <StatCard
          icon={<Package className="w-5 h-5 text-violet-600" />}
          label="Spolu (aktívne + dokončené)"
          value={active.length + (history?.length ?? 0)}
          tint="violet"
        />
      </div>

      {/* ─── AKTÍVNE ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          🔨 Aktívne realizácie
        </h2>
        {active.length > 0 ? (
          <ul className="space-y-2">
            {active.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/realizacie/${l.id}`}
                  className="block rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-4 hover:bg-emerald-50/70 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-bold text-base">{l.name}</div>
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-1">
                        {(l.data as Record<string, string>)?.lokalita && (
                          <span>📍 {(l.data as Record<string, string>).lokalita}</span>
                        )}
                        {(l.data as Record<string, string>)?.plocha && (
                          <span>{(l.data as Record<string, string>).plocha} m²</span>
                        )}
                        {(l.data as Record<string, string>)?.typ_podlahy && (
                          <span>· {(l.data as Record<string, string>).typ_podlahy}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Posunutá na realizáciu: {new Date(l.realization_at).toLocaleString("sk-SK")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {l.value_estimate != null && (
                        <div className="font-bold text-emerald-700 tabular-nums text-lg">
                          {l.value_estimate.toLocaleString("sk-SK")} €
                        </div>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground inline-block mt-1" aria-hidden />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : showLegacyProxy && legacyActive.length > 0 ? (
          <div className="space-y-2">
            <div className="rounded-lg border-2 border-dashed border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              🚧 <strong>DB migrácia 10_role_handoff.sql ešte nebola spustená</strong> — zobrazujem proxy: leady so statusom "won" alebo "quote_sent" priradené tebe. Po spustení migrácie sa tu ukážu iba tie, ktoré ti obchodník explicitne posunul do realizácie.
            </div>
            <ul className="space-y-2">
              {legacyActive.map((l) => (
                <li key={l.id} className="rounded-xl border bg-background p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Link
                    href={`/realizacie/${l.id}`}
                    className="flex-1 min-w-0 group"
                  >
                    <div className="font-bold group-hover:text-sky-700 group-hover:underline decoration-dotted">
                      {l.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Status: {l.status} · Assigned: {l.assigned_to ?? "—"}
                    </div>
                  </Link>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Link
                      href={`/realizacie/${l.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border-2 border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 px-2.5 py-1.5 text-xs font-bold transition-colors"
                    >
                      → Otvoriť
                    </Link>
                    <Link
                      href={`/realizacie/${l.id}/plan?view=postup`}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-bold transition-colors shadow"
                      title="Postupový plán — odškrtávanie krokov na stavbe"
                    >
                      🔨 Postup
                    </Link>
                    <Link
                      href={`/realizacie/${l.id}/plan?view=sklad`}
                      className="inline-flex items-center gap-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white px-2.5 py-1.5 text-xs font-bold transition-colors shadow"
                      title="Zoznam materiálu zo skladu — čo brať na zákazku"
                    >
                      📦 Sklad
                    </Link>
                    <Link
                      href={`/realizacie/${l.id}/plan?view=zodpovednost`}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 text-xs font-bold transition-colors shadow"
                      title="Zodpovednosť — kto podpísal čo (obchodák, obhliadkár, realizator, skladník)"
                    >
                      ✍️ Zodpovednosť
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
            Žiadne aktívne realizácie. Obchodník ti zatiaľ nič neposunul.
          </div>
        )}
      </section>

      {/* ─── DOKONČENÉ ─────────────────────────────────────────────────── */}
      {(history?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            ✅ Dokončené (posledných 20)
          </h2>
          <ul className="space-y-1.5">
            {history!.map((l) => (
              <li
                key={l.id}
                className="rounded-lg border bg-background px-3 py-2 flex items-center justify-between gap-3"
              >
                <Link
                  href={`/realizacie/${l.id}`}
                  className="flex-1 hover:underline font-bold text-sm"
                >
                  {l.name}
                </Link>
                <div className="text-xs text-muted-foreground flex items-center gap-3 shrink-0">
                  {l.value_estimate != null && (
                    <span className="tabular-nums">
                      {l.value_estimate.toLocaleString("sk-SK")} €
                    </span>
                  )}
                  <span>
                    {new Date(l.realization_completed_at as string).toLocaleDateString("sk-SK")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
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
    </div>
  );
}
