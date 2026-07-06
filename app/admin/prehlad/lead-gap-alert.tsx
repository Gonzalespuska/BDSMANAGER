"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadGapAlert — sleduje výpadok leadov osobitne pre Web a Meta.
 *
 * Poll interval: 60s. Šetrí bandwidth vs. každých 10s. 30-min prah
 * to znesie s rezervou.
 *
 * Alarm banner:
 *   • Je STICKY dokým admin klikne "×" (localStorage dismisses).
 *   • Osobitná notifikácia pre Web a osobitne pre Meta.
 *   • Keď z daného zdroja príde nový lead, alarm sa auto-zavrie
 *     (aj bez ×) — resetuje sa časovač.
 *
 * Prah je centralizovaný na serveri (LEAD_GAP_MINUTES = 30).
 */

type GapState = {
  lastAt: string | null;
  minutesSince: number | null;
  alarm: boolean;
};

type ApiResponse = {
  web: GapState;
  meta: GapState;
  threshold: number;
  generated_at: string;
};

const POLL_INTERVAL_MS = 60_000;

export function LeadGapAlert() {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Dismissal — keď admin klikne X, uložíme timestamp poslednej známej
  // hodnoty pre daný zdroj. Nový alarm sa objaví keď minutesSince
  // narastie znovu (t.j. keď admin ×, alarm ostane skrytý, ale keď
  // z toho zdroja príde nový lead a znova sa vytvorí gap, znovu vyskočí).
  const [dismissedAt, setDismissedAt] = React.useState<{
    web: string | null;
    meta: string | null;
  }>(() => {
    if (typeof window === "undefined") return { web: null, meta: null };
    try {
      const raw = window.localStorage.getItem("prehlad_leadgap_dismiss");
      if (raw) return JSON.parse(raw);
    } catch {}
    return { web: null, meta: null };
  });

  function persistDismiss(next: typeof dismissedAt) {
    setDismissedAt(next);
    try {
      window.localStorage.setItem(
        "prehlad_leadgap_dismiss",
        JSON.stringify(next),
      );
    } catch {}
  }

  async function fetchGap() {
    try {
      const r = await fetch("/api/admin/lead-source-gap", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as ApiResponse;
      setData(json);
      setError(null);
      // Auto-clear dismiss keď z daného zdroja prišiel NOVÝ lead
      // (t.j. lastAt sa posunul). Bez toho by dismiss trval navždy.
      if (json.web.lastAt && json.web.lastAt !== dismissedAt.web) {
        if (dismissedAt.web && !json.web.alarm) {
          persistDismiss({ ...dismissedAt, web: null });
        }
      }
      if (json.meta.lastAt && json.meta.lastAt !== dismissedAt.meta) {
        if (dismissedAt.meta && !json.meta.alarm) {
          persistDismiss({ ...dismissedAt, meta: null });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }

  React.useEffect(() => {
    fetchGap();
    const iv = window.setInterval(fetchGap, POLL_INTERVAL_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visual indicator (malý inline chip) — ukazuje sa VŽDY, aj bez alarmu.
  // Sticky banner sa ukazuje LEN keď je alarm a nie je dismissed.
  const showWebBanner =
    data?.web.alarm && dismissedAt.web !== (data?.web.lastAt ?? "__none__");
  const showMetaBanner =
    data?.meta.alarm && dismissedAt.meta !== (data?.meta.lastAt ?? "__none__");

  return (
    <>
      {/* Inline status indicator — vždy viditeľný, malý */}
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <SourceChip
          label="Web"
          state={data?.web ?? null}
          error={error}
        />
        <SourceChip
          label="Meta"
          state={data?.meta ?? null}
          error={error}
        />
      </div>

      {/* Sticky alarm banners — nezmiznú samy */}
      {(showWebBanner || showMetaBanner) && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {showWebBanner && data && (
            <AlarmBanner
              source="Web"
              minutesSince={data.web.minutesSince ?? 0}
              threshold={data.threshold}
              onDismiss={() =>
                persistDismiss({
                  ...dismissedAt,
                  web: data.web.lastAt ?? "__none__",
                })
              }
            />
          )}
          {showMetaBanner && data && (
            <AlarmBanner
              source="Meta"
              minutesSince={data.meta.minutesSince ?? 0}
              threshold={data.threshold}
              onDismiss={() =>
                persistDismiss({
                  ...dismissedAt,
                  meta: data.meta.lastAt ?? "__none__",
                })
              }
            />
          )}
        </div>
      )}
    </>
  );
}

function SourceChip({
  label,
  state,
  error,
}: {
  label: string;
  state: GapState | null;
  error: string | null;
}) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-600 border-zinc-300">
        {label}: err
      </span>
    );
  }
  if (!state) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-500 border-zinc-200">
        {label}: …
      </span>
    );
  }
  const { alarm, minutesSince } = state;
  return (
    <span
      title={
        state.lastAt
          ? `Posledný ${label} lead: ${new Date(state.lastAt).toLocaleString("sk-SK")}`
          : `Zatiaľ žiadny ${label} lead`
      }
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border tabular-nums",
        alarm
          ? "bg-rose-100 text-rose-800 border-rose-300 animate-pulse"
          : "bg-emerald-100 text-emerald-800 border-emerald-300",
      )}
    >
      {alarm ? (
        <AlertTriangle className="w-3 h-3" aria-hidden />
      ) : (
        <CheckCircle2 className="w-3 h-3" aria-hidden />
      )}
      {label}:{" "}
      {alarm
        ? `⚠️ ${minutesSince}min`
        : minutesSince != null
          ? `OK · ${formatMin(minutesSince)}`
          : "OK"}
    </span>
  );
}

function AlarmBanner({
  source,
  minutesSince,
  threshold,
  onDismiss,
}: {
  source: "Web" | "Meta";
  minutesSince: number;
  threshold: number;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-rose-400 bg-rose-50 shadow-2xl p-4 pr-10 relative animate-in slide-in-from-right-4"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Zavrieť"
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-rose-200/50 text-rose-900"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" aria-hidden />
        <div>
          <div className="font-extrabold text-rose-900">
            Z {source} neprišiel lead už {minutesSince} min
          </div>
          <div className="text-xs text-rose-800 mt-0.5">
            Prah: {threshold} min. Skontroluj napojenie{" "}
            {source === "Meta"
              ? "Meta webhook (Facebook Lead Ads)"
              : "webu (kontaktný formulár)"}
            .
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMin(m: number): string {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
