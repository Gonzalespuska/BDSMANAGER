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

  // Aktívne realizácie: status=in_realization + priradené mne.
  // Zoradené ASC (najbližšie hore). Nižšie filtrujeme na najbližších 7 dní.
  const activeQuery = sb
    .from("leads")
    .select(
      "id, name, phone, email, status, last_activity_at, value_estimate, assigned_to, realization_by, realization_at, data",
    )
    .eq("status", "in_realization")
    .order("realization_at", { ascending: true });

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

      {/* Stats — iba jeden veľký tile "Aktívne realizácie". User: "dokoncene
          a spolu daj prec to tam netreba ten riadok". Dokončené prípadne
          pojedú do vlastnej sekcie nižšie. */}
      <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-5 flex items-center gap-4 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shrink-0">
          <Calendar className="w-7 h-7" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs md:text-sm font-black uppercase tracking-widest text-emerald-800">
            Aktívne realizácie
          </div>
          <div className="text-4xl md:text-5xl font-black tabular-nums text-slate-900 leading-none mt-1">
            {active.length}
          </div>
        </div>
      </div>

      {/* ─── AKTÍVNE — 7-dňový plán ──────────────────────────────────── */}
      <section className="space-y-3">
      {(() => {
        const now = new Date();
        const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const in7d = new Date(today0);
        in7d.setDate(in7d.getDate() + 7);
        const week: Array<{ date: Date; iso: string; items: typeof active }> = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(today0);
          d.setDate(d.getDate() + i);
          const iso = d.toISOString().slice(0, 10);
          week.push({ date: d, iso, items: [] });
        }
        const laterItems: typeof active = [];
        for (const l of active) {
          const at = new Date(l.realization_at);
          // Použi SK dátumovú časť z realization_at (posun UTC → SK).
          // BUG 2026-07-11: predtym toLocaleDateString("en-CA", ...) — na
          // CF Workers edge runtime nemá full ICU a hodí exception. Fix:
          // manuálny SK offset (+1h zima / +2h leto). Robíme aproximáciu
          // konštantne +2h (SK leto Jul-Aug), pre robustnejšiu variantu
          // treba full-ICU alebo dynamickú DST detekciu.
          const skTime = new Date(at.getTime() + 2 * 3600 * 1000);
          const isoDay = skTime.toISOString().slice(0, 10);
          const slot = week.find((w) => w.iso === isoDay);
          if (slot) slot.items.push(l);
          else if (at >= in7d) laterItems.push(l);
          // items pred dneškom (in progress) → prilepím do dnes
          else week[0].items.push(l);
        }

        function weekdayLabel(d: Date): string {
          const now2 = new Date();
          const isToday =
            d.toDateString() === now2.toDateString();
          const tomorrow = new Date(now2);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const isTomorrow = d.toDateString() === tomorrow.toDateString();
          if (isToday) return "Dnes";
          if (isTomorrow) return "Zajtra";
          return d.toLocaleDateString("sk-SK", { weekday: "long" });
        }

        function fullDate(d: Date): string {
          return d.toLocaleDateString("sk-SK", {
            day: "numeric",
            month: "long",
          });
        }

        return active.length > 0 ? (
          <div className="space-y-6">
            {week.map((w) => {
              const isEmpty = w.items.length === 0;
              const isToday = w.date.toDateString() === new Date().toDateString();
              return (
                <section key={w.iso} className="space-y-2">
                  <div
                    className={cn(
                      "flex items-baseline gap-3 border-l-4 pl-3 py-1",
                      isToday
                        ? "border-emerald-500"
                        : isEmpty
                          ? "border-slate-200"
                          : "border-emerald-300",
                    )}
                  >
                    <h3
                      className={cn(
                        "text-2xl md:text-3xl font-black capitalize leading-none",
                        isToday ? "text-emerald-700" : "text-slate-800",
                      )}
                    >
                      {weekdayLabel(w.date)}
                    </h3>
                    <span className="text-lg font-bold text-slate-500">
                      · {fullDate(w.date)}
                    </span>
                    {!isEmpty && (
                      <span className="ml-auto text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
                        {w.items.length} zákazk
                        {w.items.length === 1 ? "a" : w.items.length < 5 ? "y" : "ov"}
                      </span>
                    )}
                  </div>
                  {isEmpty ? (
                    <div className="text-sm italic text-slate-400 pl-4">
                      🌴 Žiadne realizácie
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {w.items.map((l) => {
                        const data = (l.data ?? {}) as Record<string, string>;
                        // CF Workers edge: bez full-ICU sa timeZone môže tichý fallback
                        // alebo throw. Manuálny +2h leto → HH:MM z ISO substr.
                        const skTime = new Date(
                          new Date(l.realization_at).getTime() + 2 * 3600 * 1000,
                        );
                        const timeStr = skTime.toISOString().slice(11, 16);
                        return (
                          <li
                            key={l.id}
                            className="rounded-2xl border-2 border-emerald-300 bg-white shadow-sm overflow-hidden"
                          >
                            <Link
                              href={`/realizacie/${l.id}`}
                              className="block p-4 hover:bg-emerald-50/40 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0 flex-1">
                                  {/* ČAS — big pill */}
                                  <div className="inline-flex items-center gap-2 mb-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-lg font-black tabular-nums shadow-sm">
                                      ⏰ {timeStr}
                                    </span>
                                  </div>
                                  <div className="font-black text-xl md:text-2xl leading-tight">
                                    {l.name}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {data.lokalita && (
                                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-sm font-bold">
                                        📍 {data.lokalita}
                                      </span>
                                    )}
                                    {data.plocha && (
                                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-sm font-bold">
                                        📏 {data.plocha} m²
                                      </span>
                                    )}
                                    {data.typ_podlahy && (
                                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-sm font-bold">
                                        🎨 {data.typ_podlahy}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  {l.value_estimate != null && (
                                    <div className="font-black text-emerald-700 tabular-nums text-2xl md:text-3xl">
                                      {l.value_estimate.toLocaleString("sk-SK")} €
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Link>
                            <div className="border-t-2 border-emerald-100 bg-emerald-50/50 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                              <Link
                                href={`/realizacie/${l.id}/plan?view=zodpovednost`}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm"
                              >
                                <span>✍️</span>
                                Zodpovednosť
                              </Link>
                              <Link
                                href={`/realizacie/${l.id}/plan?view=sklad`}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm"
                              >
                                <span>📦</span>
                                Inventúra
                              </Link>
                              <Link
                                href={`/realizacie/${l.id}/plan?view=postup`}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm"
                              >
                                <span>🔨</span>
                                Postup
                              </Link>
                              <Link
                                href={`/realizacie/${l.id}/kontent`}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm"
                                title="Foto/video zo stavby pre marketing"
                              >
                                <span>📱</span>
                                Kontent
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
            {laterItems.length > 0 && (
              <section className="mt-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
                <div className="text-sm text-slate-700 font-semibold">
                  ⏭ Ďalej ({laterItems.length} zákazk
                  {laterItems.length === 1 ? "a" : laterItems.length < 5 ? "y" : "ov"})
                  za viac ako 7 dní
                </div>
                <div className="mt-2">
                  <Link
                    href="/calendar"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 text-sm font-black transition-colors"
                  >
                    Pozri v kalendári →
                  </Link>
                </div>
              </section>
            )}
          </div>
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
        );
      })()}
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
