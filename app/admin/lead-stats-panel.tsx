"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Globe, Loader2, Search, Share2, TrendingUp } from "lucide-react";

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
        className="group block rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 hover:border-emerald-500 hover:bg-emerald-50/70 transition-all p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-black text-emerald-700 inline-flex items-center gap-1">
              Leady celkovo · {windowLabel}
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-1 text-5xl font-black tabular-nums text-emerald-900">
              {loading ? (
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              ) : (
                (stats?.total ?? 0)
              )}
            </div>
          </div>
          <div className="rounded-xl bg-emerald-100 text-emerald-600 p-3" aria-hidden>
            <TrendingUp className="w-8 h-8" />
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-3 gap-2">
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
        <Breakdown
          label="Google"
          value={stats?.google ?? 0}
          Icon={Search}
          tint="rose"
          loading={loading}
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
}: {
  label: string;
  value: number;
  Icon: typeof TrendingUp;
  tint: "indigo" | "sky" | "rose";
  loading: boolean;
}) {
  const cls =
    tint === "indigo"
      ? "border-indigo-200 bg-white text-indigo-900"
      : tint === "sky"
        ? "border-sky-200 bg-white text-sky-900"
        : "border-rose-200 bg-white text-rose-900";
  const iconCls =
    tint === "indigo"
      ? "text-indigo-500"
      : tint === "sky"
        ? "text-sky-500"
        : "text-rose-500";
  return (
    <div
      className={"rounded-xl border-2 " + cls + " p-3 flex items-center gap-3"}
    >
      <Icon className={"w-5 h-5 shrink-0 " + iconCls} aria-hidden />
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider font-black opacity-70">
          {label}
        </div>
        <div className="text-2xl font-black tabular-nums leading-tight">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            value
          )}
        </div>
      </div>
    </div>
  );
}
