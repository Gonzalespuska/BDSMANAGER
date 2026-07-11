"use client";

import * as React from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

/**
 * Button v assign banner — auto-nájdi optimálny deň v kalendári podľa
 * mesta klienta. Batchuje cesty (ak tím má v ten deň iné zákazky v tom
 * istom meste, sedí ich naraz).
 *
 * Po click:
 *   1. Fetch /api/calendar/suggest-day
 *   2. Ukáž pill so návrhom (dátum + dôvod)
 *   3. Klik na pill → navigate na /calendar?m=YYYY-MM&day=YYYY-MM-DD&time=HH:MM
 *      + existujúce assign params — otvorí day modal na priradenie.
 */
export function SuggestDayButton({
  city,
  mode,
  currentUrl,
}: {
  city: string | null;
  mode: "inspection" | "realization";
  /** Aktuálna URL — pre zachovanie existujúcich query paramov pri navigácii. */
  currentUrl?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<null | {
    date: string;
    time: string;
    reason: string;
    same_city_count: number;
  }>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function findBest() {
    if (!city) {
      setError("Mesto klienta nie je vyplnené — nedá sa suggestnúť.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/calendar/suggest-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error ?? "unknown");
        return;
      }
      setSuggestion({
        date: j.date,
        time: j.time,
        reason: j.reason,
        same_city_count: j.same_city_count ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusy(false);
    }
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    // Navigate na kalendár na správny mesiac + pre-select day
    const [y, m] = suggestion.date.split("-");
    const monthStr = `${y}-${m}`;
    // Zachovaj existujúce query params (assign=X&lead=Y&city=Z)
    const url = new URL(
      typeof window !== "undefined" ? window.location.href : "http://localhost",
    );
    url.searchParams.set("m", monthStr);
    url.searchParams.set("day", suggestion.date);
    url.searchParams.set("time", suggestion.time);
    if (typeof window !== "undefined") {
      window.location.href = url.pathname + url.search;
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {!suggestion && (
        <button
          type="button"
          onClick={findBest}
          disabled={busy || !city}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-4 py-2.5 text-sm font-black shadow-md shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Hľadám optimálny deň…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              🎯 Nájdi optimálny deň
            </>
          )}
        </button>
      )}
      {error && (
        <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          Chyba: {error}
        </div>
      )}
      {suggestion && (
        <div className="rounded-xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-md">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Odporúčaný termín
              </div>
              <div className="text-lg font-black text-slate-900 mt-0.5">
                {new Date(suggestion.date + "T00:00:00").toLocaleDateString(
                  "sk-SK",
                  { weekday: "long", day: "numeric", month: "long" },
                )}{" "}
                <span className="text-emerald-700">o {suggestion.time}</span>
              </div>
              <div className="text-sm text-slate-700 font-semibold mt-1">
                {suggestion.same_city_count > 0 && "🎯 "}
                {suggestion.reason}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={acceptSuggestion}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-black transition-colors shadow-sm"
            >
              ✓ Prejsť na tento deň
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2.5 text-sm font-bold transition-colors"
            >
              Späť
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
