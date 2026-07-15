"use client";

import * as React from "react";
import { CalendarDays, Check, Loader2, X } from "lucide-react";

import {
  playAlarm,
  unlockAudioOnFirstInteraction,
} from "@/lib/notification-sound";

/**
 * VacationApprovalsBar — sticky top-right karta pre ADMINA s pending
 * dovolenkovými žiadosťami. Nezmizne kým admin klikne Schváliť/Zamietnuť.
 *
 * User 2026-07-15: „pride zas adminovi request do dovolenky request,
 * kde im to admin moze potvrdit bude tam od do".
 */

type Pending = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  requested_at: string;
};

export function VacationApprovalsBar() {
  const [items, setItems] = React.useState<Pending[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(true);
  const previousIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    unlockAudioOnFirstInteraction();
  }, []);

  const fetchPending = React.useCallback(async () => {
    try {
      const r = await fetch("/api/vacation/pending", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; items?: Pending[] };
      if (!j.ok || !j.items) return;
      const next = j.items;
      const prev = previousIdsRef.current;
      const hasNew = next.some((it) => !prev.has(it.id));
      if (hasNew && prev.size > 0) {
        playAlarm();
        setExpanded(true);
      }
      previousIdsRef.current = new Set(next.map((i) => i.id));
      setItems(next);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    fetchPending();
    const iv = setInterval(fetchPending, 20_000);
    return () => clearInterval(iv);
  }, [fetchPending]);

  async function respond(id: string, action: "approve" | "decline") {
    if (busyId) return;
    let declineReason: string | null = null;
    if (action === "decline") {
      const r = window.prompt(
        "Prečo zamietaš dovolenku? (voliteľné, user to uvidí)",
        "",
      );
      if (r === null) return;
      declineReason = r.trim() || null;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/vacation/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: id, action, decline_reason: declineReason }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        alert(`Chyba: ${j.error ?? "unknown"}`);
        setBusyId(null);
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      previousIdsRef.current.delete(id);
    } catch (e) {
      alert(`Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div
      // Umiestni nižšie ako ReassignRequestsBar (top-20 → top-44 offset)
      className="fixed top-44 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-auto"
      role="alert"
    >
      <div className="rounded-2xl border-2 border-cyan-400 bg-white shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-teal-600 text-white text-left"
        >
          <CalendarDays className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-black opacity-90">
              Žiadosť o dovolenku
            </div>
            <div className="text-sm font-black leading-tight">
              {items.length === 1
                ? `${items[0].user_name} — schváľ`
                : `${items.length} pending dovoleniek`}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white/25 border border-white/40 w-6 h-6 flex items-center justify-center text-xs font-black">
            {items.length}
          </span>
        </button>

        {expanded && (
          <ul className="divide-y max-h-[60vh] overflow-y-auto">
            {items.map((it) => (
              <li key={it.id} className="p-3 bg-cyan-50/40">
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-200 text-cyan-900">
                      {it.user_role}
                    </span>
                    <span className="font-black text-sm text-slate-900 truncate">
                      {it.user_name}
                    </span>
                  </div>
                  <div className="text-[13px] font-black text-slate-800 tabular-nums">
                    {it.from_date} → {it.to_date}
                  </div>
                  {it.reason && (
                    <div className="text-xs text-slate-700 mt-1 italic border-l-2 border-cyan-300 pl-2">
                      „{it.reason}"
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => respond(it.id, "approve")}
                    disabled={busyId === it.id}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-60"
                  >
                    {busyId === it.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Schváliť
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(it.id, "decline")}
                    disabled={busyId === it.id}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-black disabled:opacity-60"
                  >
                    <X className="w-4 h-4" />
                    Zamietnuť
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
