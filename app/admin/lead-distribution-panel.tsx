"use client";

import * as React from "react";
import { Loader2, UserCheck, Shuffle } from "lucide-react";

/**
 * Admin panel na aktiváciu obchodákov + redistribúciu unassigned leadov.
 * User 2026-07-14: „urob z Denis Petrus a Alena Schronk normalnych
 * obchodakov idu uz volat aj tam ten system ze im to bude davat leady …
 * nove leady co chodia nech su automaticky pridelovane aktivnym".
 */
export function LeadDistributionPanel() {
  const [activating, setActivating] = React.useState(false);
  const [redistributing, setRedistributing] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function activateDealers() {
    setActivating(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/activate-dealers", { method: "POST" });
      const j = (await r.json()) as {
        ok: boolean;
        matched?: Array<{ name: string; before: unknown; after: unknown }>;
        not_found?: string[];
        error?: string;
      };
      if (!j.ok) {
        setMsg(`⚠ ${j.error}`);
      } else {
        const foundNames = (j.matched ?? []).map((m) => m.name).join(", ");
        const missing = (j.not_found ?? []).join(", ");
        setMsg(
          `✓ Aktivovaní: ${foundNames || "nikto"}${missing ? ` · Neexistujú v DB: ${missing}` : ""}`,
        );
      }
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : "network_error"}`);
    }
    setActivating(false);
  }

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
          🔄 Distribúcia leadov obchodákom
        </div>
        <div className="text-xs text-sky-800/80 mt-0.5">
          Nové leady sa od teraz auto-priradia aktívnemu obchodákovi s najmenším
          loadom (least-loaded round-robin). Tieto 2 akcie sú one-shot:
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={activateDealers}
          disabled={activating}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-black disabled:opacity-50 shadow-sm"
        >
          {activating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserCheck className="w-4 h-4" />
          )}
          Aktivuj Denis Petrus + Alena Schronk
        </button>

        <button
          type="button"
          onClick={redistribute}
          disabled={redistributing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 text-sm font-black disabled:opacity-50 shadow-sm"
        >
          {redistributing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Shuffle className="w-4 h-4" />
          )}
          Rozdeľ unassigned leady
        </button>
      </div>

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
