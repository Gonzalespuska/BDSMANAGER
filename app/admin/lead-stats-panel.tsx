"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Globe, Loader2, Search, Share2, TrendingUp, UserPlus } from "lucide-react";

/**
 * LeadStatsPanel — jedna veľká bublina LEADY CELKOVO (klikateľná →
 * /admin/leads) + tenký breakdown pod ňou (Meta / Web / Google — NIE
 * klikateľné). Time window switcher hore (1d / 7d / 30d / všetko).
 *
 * User 2026-07-15: „toto ma byt jedna bublina ktora ta linkne na vsetky
 * leady, a dole iba rozdelene proste 51 web 62 meta atd nemusi tam byt
 * link... a nech sa to tu da menit ze 1d 7d 30d atd".
 */
type Window = "1d" | "7d" | "30d" | "all";
type Stats = {
  total: number;
  meta: number;
  web: number;
  google: number;
  other: number;
};

export function LeadStatsPanel() {
  const [win, setWin] = React.useState<Window>("30d");
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/lead-stats?window=${win}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean } & Stats) => {
        if (!cancelled && j.ok) setStats(j);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [win]);

  const windowLabel =
    win === "1d"
      ? "za 24h"
      : win === "7d"
        ? "za 7 dní"
        : win === "30d"
          ? "za 30 dní"
          : "všetko";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-wider font-black text-muted-foreground">
          Leady
        </h2>
        <WindowSwitch value={win} onChange={setWin} />
      </div>

      <Link
        href="/admin/leads"
        className="group block rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-all p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
              Leady celkovo · {windowLabel}
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-1 text-5xl font-black tabular-nums text-emerald-900 dark:text-emerald-100">
              {loading ? (
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              ) : (
                (stats?.total ?? 0)
              )}
            </div>
          </div>
          <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 p-3" aria-hidden>
            <TrendingUp className="w-8 h-8" />
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Breakdown
          label="Meta"
          value={stats?.meta ?? 0}
          Icon={Share2}
          tint="indigo"
          loading={loading}
        />
        <Breakdown
          label="Web"
          value={stats?.web ?? 0}
          Icon={Globe}
          tint="sky"
          loading={loading}
        />
        {/* Manuálne = admin sám pridal cez /admin/pridat (source_type=manual)
            User 2026-07-16: „7 leadov 6 z mety a 0 z webu totalne ti jebe uz
            alebo co" — chýbal 4. tile (Michal Mazuch bol admin-added manual). */}
        <Breakdown
          label="Manuálne"
          value={stats?.other ?? 0}
          Icon={UserPlus}
          tint="amber"
          loading={loading}
        />
        <Breakdown
          label="Google"
          value={stats?.google ?? 0}
          Icon={Search}
          tint="rose"
          loading={loading}
          inBuild
        />
      </div>
    </section>
  );
}

function WindowSwitch({
  value,
  onChange,
}: {
  value: Window;
  onChange: (w: Window) => void;
}) {
  const opts: Array<{ v: Window; l: string }> = [
    { v: "1d", l: "1d" },
    { v: "7d", l: "7d" },
    { v: "30d", l: "30d" },
    { v: "all", l: "Všetko" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
      {opts.map(({ v, l }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "px-2.5 py-1 text-[11px] font-black rounded-md transition-colors " +
            (value === v
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100")
          }
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Breakdown({
  label,
  value,
  Icon,
  tint,
  loading,
  inBuild,
}: {
  label: string;
  value: number;
  Icon: typeof TrendingUp;
  tint: "indigo" | "sky" | "rose" | "amber";
  loading: boolean;
  inBuild?: boolean;
}) {
  const cls = inBuild
    ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-400"
    : tint === "indigo"
      ? "border-indigo-200 dark:border-indigo-800 bg-white dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-100"
      : tint === "sky"
        ? "border-sky-200 dark:border-sky-800 bg-white dark:bg-sky-950/30 text-sky-900 dark:text-sky-100"
        : tint === "amber"
          ? "border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-950/30 text-amber-900 dark:text-amber-100"
          : "border-rose-200 dark:border-rose-800 bg-white dark:bg-rose-950/30 text-rose-900 dark:text-rose-100";
  const iconCls = inBuild
    ? "text-slate-400"
    : tint === "indigo"
      ? "text-indigo-500 dark:text-indigo-400"
      : tint === "sky"
        ? "text-sky-500 dark:text-sky-400"
        : tint === "amber"
          ? "text-amber-500 dark:text-amber-400"
          : "text-rose-500 dark:text-rose-400";
  return (
    <div
      className={
        "rounded-xl border-2 " +
        cls +
        " p-3 flex items-center gap-3 " +
        (inBuild ? "opacity-70 cursor-not-allowed select-none" : "")
      }
      aria-disabled={inBuild}
      title={inBuild ? "V príprave" : undefined}
    >
      <Icon className={"w-5 h-5 shrink-0 " + iconCls} aria-hidden />
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider font-black opacity-70 inline-flex items-center gap-1">
          {label}
          {inBuild && (
            <span className="text-[8px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded">
              🚧 in build
            </span>
          )}
        </div>
        <div className="text-2xl font-black tabular-nums leading-tight">
          {inBuild ? (
            <span className="text-slate-400 text-lg">—</span>
          ) : loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            value
          )}
        </div>
      </div>
    </div>
  );
}
