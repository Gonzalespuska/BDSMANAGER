"use client";

import * as React from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * SyncHealthWidget — na admin dashboard. Live status pipeline z epoxidovo.sk.
 *
 * User 2026-07-15: „urob to najlepsie ako sa da s tym ze uz nikdy tento
 * problem nebude". Toto je vizuálny „vital sign" — admin vidí na prvý
 * pohľad či leady tečú alebo je niečo zle.
 *
 * Status:
 *   • 🟢 healthy   — lead za posledných 6h
 *   • 🟡 warning   — 6-24h bez leadu
 *   • 🔴 critical  — 24h+ bez leadu (možný Adriána-style incident)
 */
type Health = {
  status: "healthy" | "warning" | "critical";
  last_web_lead: {
    name: string;
    at: string;
    hours_ago: number;
  } | null;
  web_leads_6h: number;
  web_leads_24h: number;
  last_meta_lead: { name: string; at: string } | null;
  meta_leads_24h: number;
};

export function SyncHealthWidget() {
  const [data, setData] = React.useState<Health | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/admin/sync-health", { cache: "no-store" });
        const j = (await r.json()) as { ok?: boolean } & Health;
        if (!cancelled && j.ok) setData(j);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const iv = setInterval(load, 60_000); // refresh každú minútu
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border-2 border-slate-200 bg-white p-4 flex items-center gap-3 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-bold">Kontrola pipeline…</span>
      </div>
    );
  }
  if (!data) return null;

  const tint =
    data.status === "healthy"
      ? {
          border: "border-emerald-300",
          bg: "bg-emerald-50/40",
          text: "text-emerald-900",
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          label: "PIPELINE OK",
        }
      : data.status === "warning"
        ? {
            border: "border-amber-300",
            bg: "bg-amber-50/60",
            text: "text-amber-900",
            icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
            label: "WARNING",
          }
        : {
            border: "border-rose-400",
            bg: "bg-rose-50/60",
            text: "text-rose-900",
            icon: (
              <AlertTriangle className="w-5 h-5 text-rose-600 animate-pulse" />
            ),
            label: "CRITICAL",
          };

  return (
    <div
      className={`rounded-xl border-2 ${tint.border} ${tint.bg} p-4 space-y-3`}
    >
      <div className="flex items-center gap-2">
        {tint.icon}
        <div className={`text-xs font-black uppercase tracking-widest ${tint.text}`}>
          <Activity className="w-3 h-3 inline mr-1" />
          Sync health · {tint.label}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat
          label="Web 6h"
          value={data.web_leads_6h}
          highlight={data.web_leads_6h === 0}
        />
        <Stat label="Web 24h" value={data.web_leads_24h} />
        <Stat label="Meta 24h" value={data.meta_leads_24h} />
      </div>

      {data.last_web_lead ? (
        <div className={`text-xs ${tint.text}`}>
          <span className="font-bold">Posledný web lead:</span>{" "}
          <span className="tabular-nums">{data.last_web_lead.name}</span>{" "}
          <span className="opacity-70">
            (pred{" "}
            {data.last_web_lead.hours_ago < 1
              ? `${Math.round(data.last_web_lead.hours_ago * 60)} min`
              : `${data.last_web_lead.hours_ago} h`}
            )
          </span>
        </div>
      ) : (
        <div className={`text-xs ${tint.text} italic`}>
          Zatiaľ žiadny web lead v DB.
        </div>
      )}

      {data.status === "critical" && (
        <div className="text-xs font-bold text-rose-900 bg-rose-100 rounded-lg p-2 border border-rose-300">
          🚨 Za 24h neprišiel žiadny web lead. Skontroluj sync-epoxidovo/route.ts,
          Neon schemu a webhook forward na epoxidovo.sk. Adriána-style incident.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
      <div
        className={
          "text-2xl font-black tabular-nums " +
          (highlight && value === 0 ? "text-rose-700" : "text-slate-900")
        }
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider font-black text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}
