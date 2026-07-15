"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Loader2, X } from "lucide-react";

/**
 * VacationRequestForm — button „🏖 Zažiadať o dovolenku" na vlastnom
 * profile. Otvorí modal s dvoma date inputmi + reason. Pošle POST na
 * /api/vacation/request. Admin ju musí schváliť sticky bare.
 *
 * User 2026-07-15: „tam budu mat moznost vypytat si dovolenku od do
 * kde pride zas adminovi request".
 */

type VacationHistoryItem = {
  id: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  requested_at: string;
  decline_reason: string | null;
};

export function VacationRequestForm() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [history, setHistory] = React.useState<VacationHistoryItem[]>([]);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await fetch("/api/vacation/request", { cache: "no-store" });
        const j = (await r.json()) as {
          ok?: boolean;
          items?: VacationHistoryItem[];
        };
        if (j.ok && j.items) setHistory(j.items);
      } catch {
        /* ignore */
      }
    })();
  }, [open]);

  async function submit() {
    if (busy || !from || !to) return;
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch("/api/vacation/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_date: from, to_date: to, reason }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        const map: Record<string, string> = {
          invalid_dates: "Neplatné dátumy.",
          to_before_from: "Koniec dovolenky nemôže byť pred začiatkom.",
        };
        setFlash({
          kind: "err",
          text: map[j.error ?? ""] ?? `Chyba: ${j.error}`,
        });
        setBusy(false);
        return;
      }
      setFlash({
        kind: "ok",
        text: "✓ Žiadosť odoslaná adminovi. Uvidíš status v histórii nižšie.",
      });
      setFrom("");
      setTo("");
      setReason("");
      // Refresh history
      const r2 = await fetch("/api/vacation/request", { cache: "no-store" });
      const j2 = (await r2.json()) as {
        items?: VacationHistoryItem[];
      };
      if (j2.items) setHistory(j2.items);
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-black bg-cyan-100 hover:bg-cyan-200 text-cyan-900 border-2 border-cyan-300 transition-colors"
      title="Zažiadať admina o dovolenku (od–do)"
    >
      <CalendarDays className="w-4 h-4" />
      🏖 Zažiadať o dovolenku
    </button>
  );

  const modal = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-cyan-500 to-teal-600 text-white px-5 py-3 flex items-center gap-3 shrink-0">
          <CalendarDays className="w-5 h-5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
              Žiadosť o dovolenku
            </div>
            <div className="font-black text-lg leading-tight">
              Vyplň termín + dôvod
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-black text-slate-700 mb-1 block">
                Od (dátum)
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-slate-300 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-black text-slate-700 mb-1 block">
                Do (vrátane)
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from || undefined}
                className="w-full h-10 px-3 rounded-lg border-2 border-slate-300 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-black text-slate-700 mb-1 block">
              Dôvod (voliteľné)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="napr. Rodinná dovolenka v Chorvátsku, alebo lekár"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-300 text-sm focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>

          {flash && (
            <div
              className={
                "rounded-lg p-3 text-sm font-bold " +
                (flash.kind === "ok"
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                  : "bg-rose-50 text-rose-900 border border-rose-200")
              }
            >
              {flash.text}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy || !from || !to}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-black disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Poslať žiadosť adminovi
          </button>

          {history.length > 0 && (
            <div className="pt-2 border-t">
              <div className="text-[10px] uppercase tracking-wider font-black text-slate-500 mb-2">
                Moje predchádzajúce žiadosti
              </div>
              <ul className="space-y-1.5">
                {history.map((h) => {
                  const badge =
                    h.status === "approved"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : h.status === "declined"
                        ? "bg-rose-100 text-rose-800 border-rose-300"
                        : h.status === "pending"
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-slate-100 text-slate-700 border-slate-300";
                  return (
                    <li
                      key={h.id}
                      className="rounded-lg border bg-slate-50 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={
                            "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border " +
                            badge
                          }
                        >
                          {h.status === "approved"
                            ? "✓ schválené"
                            : h.status === "declined"
                              ? "✗ zamietnuté"
                              : h.status === "pending"
                                ? "⏳ čaká"
                                : h.status}
                        </span>
                        <span className="text-slate-700 font-bold tabular-nums">
                          {h.from_date} → {h.to_date}
                        </span>
                      </div>
                      {h.reason && (
                        <div className="text-slate-600 italic">
                          „{h.reason}"
                        </div>
                      )}
                      {h.decline_reason && (
                        <div className="text-rose-700 mt-1">
                          Zamietnuté: {h.decline_reason}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
