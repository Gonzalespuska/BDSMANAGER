"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Loader2, Phone, X } from "lucide-react";

import { playAlarm, unlockAudioOnFirstInteraction } from "@/lib/notification-sound";

/**
 * ReassignRequestsBar — sticky top-right karta pre PENDING žiadosti
 * o preradenie leadu.
 *
 * User 2026-07-15: „potrebujem mat ako admin moznost pridelit lead
 * nejakemu obchodakovi ako keby ho preradit aj ak je otvoreny uz proste
 * ze sa to posunie inemu v time obchodakovi a da mu to nejaku specialnu
 * notifikaciu aj hore v pravo ze ju musi odkliknut aby sa mu pridal ako
 * ziadost proste a nezmitne ak neodkliknes".
 *
 * Kľúčové vlastnosti:
 *   1) Nezmizne kým existuje aspoň 1 pending žiadosť (žiadny „×" close).
 *   2) Poll every 15 s cez /api/lead/reassign-request/pending.
 *   3) Nová žiadosť → playAlarm() (3× ding cez Web Audio) + red pulse.
 *   4) „Prijať" → prepíše assigned_to; „Odmietnuť" → status=declined.
 *   5) Sticky top-right (position: fixed, z-50), max-width 380 px.
 */

type PendingReq = {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  kind?: "push" | "pull";
  requested_by_name: string;
  from_user_name?: string;
  to_user_name?: string;
  reason: string | null;
  created_at: string;
};

export function ReassignRequestsBar() {
  const [items, setItems] = React.useState<PendingReq[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(true);
  const previousIdsRef = React.useRef<Set<string>>(new Set());

  // Pre-warm audio na prvý user interakciu (Chrome autoplay policy).
  React.useEffect(() => {
    unlockAudioOnFirstInteraction();
  }, []);

  const fetchPending = React.useCallback(async () => {
    try {
      const r = await fetch("/api/lead/reassign-request/pending", {
        cache: "no-store",
      });
      const j = (await r.json()) as { ok?: boolean; items?: PendingReq[] };
      if (!j.ok || !j.items) return;
      const nextItems = j.items;
      // Ding, ak sa objavila nová položka (ID ktoré predtým nebolo).
      const prev = previousIdsRef.current;
      const hasNew = nextItems.some((it) => !prev.has(it.id));
      if (hasNew && prev.size > 0) {
        // Nezačíname ding na prvom fetche po mount-e (aby to nezvonilo
        // pri každom refreshi stránky s existujúcimi requestami).
        playAlarm();
        setExpanded(true);
      }
      previousIdsRef.current = new Set(nextItems.map((i) => i.id));
      setItems(nextItems);
    } catch {
      /* silent — možno network hiccup, next poll to skúsi znova */
    }
  }, []);

  // Initial + polling
  React.useEffect(() => {
    fetchPending();
    const iv = setInterval(fetchPending, 15_000);
    return () => clearInterval(iv);
  }, [fetchPending]);

  async function respond(id: string, action: "accept" | "decline") {
    if (busyId) return;
    let declineReason: string | null = null;
    if (action === "decline") {
      const r = window.prompt(
        "Prečo odmietaš tento lead? (voliteľné, admin to uvidí)",
        "",
      );
      if (r === null) return; // cancel
      declineReason = r.trim() || null;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/lead/reassign-request/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          action,
          decline_reason: declineReason,
        }),
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
      // Odstráň lokálne — poll ho aj tak nevráti (už nie je pending).
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
      className="fixed top-20 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-auto"
      role="alert"
      aria-live="assertive"
    >
      {/* Žltá karta — user 2026-07-15: „nech je zlta farba toho".
          Predtým bola červená; žltá lepšie sedí s významom „pending / na
          rozhodnutie" (červená = fatal / error). */}
      <div className="rounded-2xl border-2 border-amber-400 bg-white shadow-2xl overflow-hidden animate-[reassignPulse_1.6s_ease-in-out_infinite]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-900 text-left"
          title={expanded ? "Skryť detail" : "Zobraziť detail"}
        >
          <AlertCircle className="w-5 h-5 shrink-0 animate-pulse" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black leading-tight">
              {items.length === 1
                ? `Žiadosť o preradenie leadu — ${items[0].lead_name}`
                : `${items.length} žiadostí o preradenie leadu`}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-slate-900/15 border border-slate-900/30 w-6 h-6 flex items-center justify-center text-xs font-black text-slate-900">
            {items.length}
          </span>
        </button>

        {expanded && (
          <ul className="divide-y max-h-[60vh] overflow-y-auto">
            {items.map((it) => {
              const isPull = it.kind === "pull";
              // Push (dar): niekto mi ponúka lead → zelený tint, „Prijať lead"
              // Pull (prosba): niekto prosí o môj lead → amber tint, „Dať mu ho"
              const tintBg = isPull ? "bg-amber-50/60" : "bg-emerald-50/40";
              const acceptLabel = isPull ? "Dať mu ho" : "Prijať lead";
              const acceptBtn = isPull
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-emerald-600 hover:bg-emerald-700";
              return (
                <li key={it.id} className={"p-3 " + tintBg}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={
                            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded " +
                            (isPull
                              ? "bg-amber-200 text-amber-900"
                              : "bg-emerald-200 text-emerald-900")
                          }
                        >
                          {isPull ? "PROSBA" : "DAR"}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">
                          {isPull
                            ? `${it.requested_by_name} chce tvoj lead`
                            : `${it.requested_by_name} ti ponúka lead`}
                        </span>
                      </div>
                      <div className="font-black text-sm text-slate-900 truncate">
                        {it.lead_name}
                      </div>
                      {it.lead_phone && !isPull && (
                        <div className="text-[11px] text-slate-600 inline-flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" aria-hidden />
                          {it.lead_phone}
                        </div>
                      )}
                      {it.reason && (
                        <div
                          className={
                            "mt-2 rounded-lg p-2 text-xs font-semibold text-slate-800 border-l-4 " +
                            (isPull
                              ? "bg-amber-100 border-amber-500"
                              : "bg-emerald-100 border-emerald-500")
                          }
                        >
                          <div className="text-[9px] uppercase tracking-widest font-black text-slate-500 mb-0.5">
                            💬 Poznámka od {it.requested_by_name}
                          </div>
                          „{it.reason}"
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/agent/leads/${it.lead_id}`}
                      className="shrink-0 text-[11px] font-bold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-200"
                      title="Otvoriť detail leadu (v novom tabe)"
                      target="_blank"
                    >
                      Detail
                      <ArrowRight className="w-3 h-3" aria-hidden />
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => respond(it.id, "accept")}
                      disabled={busyId === it.id}
                      className={
                        "flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-white text-xs font-black disabled:opacity-60 " +
                        acceptBtn
                      }
                    >
                      {busyId === it.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {acceptLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(it.id, "decline")}
                      disabled={busyId === it.id}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-black disabled:opacity-60"
                    >
                      <X className="w-4 h-4" />
                      Odmietnuť
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {/* CSS animácia — červený jemný pulse na okraji karty. */}
      <style jsx>{`
        @keyframes reassignPulse {
          0%,
          100% {
            box-shadow:
              0 10px 25px -5px rgba(0, 0, 0, 0.15),
              0 0 0 0 rgba(251, 191, 36, 0.6);
          }
          50% {
            box-shadow:
              0 10px 25px -5px rgba(0, 0, 0, 0.15),
              0 0 0 12px rgba(251, 191, 36, 0);
          }
        }
      `}</style>
    </div>
  );
}
