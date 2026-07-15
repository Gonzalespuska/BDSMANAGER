"use client";

import * as React from "react";
import { Loader2, Shuffle } from "lucide-react";

/**
 * Admin panel — manuálna redistribúcia unassigned leadov na aktívnych
 * obchodákov. Auto-assign každých 5 min beží cez cron (nie tu).
 *
 * User 2026-07-15: „co je kurva toto" — pôvodný panel mal aj stale
 * one-shot „Aktivuj Denis + Alena" (dávno hotové), UI je teraz čistejší.
 */
export function LeadDistributionPanel() {
  const [redistributing, setRedistributing] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function redistribute() {
    setRedistributing(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/redistribute-leads", {
        method: "POST",
      });
      const j = (await r.json()) as {
        ok: boolean;
        assigned?: number;
        total_unassigned?: number;
        skipped_no_agent?: number;
        error?: string;
      };
      if (!j.ok) {
        setMsg(`⚠ ${j.error}`);
      } else {
        setMsg(
          `✓ Priradených ${j.assigned ?? 0} z ${j.total_unassigned ?? 0} unassigned leadov aktívnym obchodákom.${(j.skipped_no_agent ?? 0) > 0 ? ` (${j.skipped_no_agent} preskočených — žiadny aktívny obchodák)` : ""}`,
        );
      }
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : "network_error"}`);
    }
    setRedistributing(false);
  }

  return (
    <section className="rounded-2xl border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
      <header>
        <div className="text-sm font-black text-sky-900 inline-flex items-center gap-2">
          🔄 Manuálna redistribúcia unassigned leadov
        </div>
        <div className="text-xs text-sky-800/80 mt-0.5">
          Nové leady sa auto-priradia každých 5 min cez cron (least-loaded round-robin).
          Tu je záložné manuálne tlačidlo — použite ak vidíte veľa unassigned leadov
          a cron ešte nezbehol.
        </div>
      </header>

      <button
        type="button"
        onClick={redistribute}
        disabled={redistributing}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 text-sm font-black disabled:opacity-50 shadow-sm"
      >
        {redistributing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Shuffle className="w-4 h-4" />
        )}
        Rozdeľ unassigned leady teraz
      </button>

      {msg && (
        <div
          className={
            "rounded-lg p-2.5 text-xs font-bold " +
            (msg.startsWith("✓")
              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
              : "bg-rose-100 text-rose-900 border border-rose-300")
          }
        >
          {msg}
        </div>
      )}
    </section>
  );
}
