"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2, X } from "lucide-react";

import { toast } from "@/components/ui/toast";

/**
 * ReassignPicker — admin klikne malé „🔄 Preraď" tlačidlo na leade,
 * otvorí sa modal so zoznamom aktívnych obchodákov. Klik na jedného
 * pošle POST /api/admin/lead/reassign → cielenému obchodákovi vyskočí
 * sticky top-right žiadosť s prijať/odmietnuť.
 *
 * User 2026-07-15: „pridelit lead nejakemu obchodakovi ako keby ho
 * preradit aj ak je otvoreny uz proste ze sa to posunie inemu v time".
 */

type Agent = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  paused: boolean;
  currentLoad?: number;
};

export function ReassignButton({
  leadId,
  leadName,
  currentAssigneeId,
}: {
  leadId: string;
  leadName: string;
  currentAssigneeId: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200 transition-colors"
        title="Preradiť lead inému obchodákovi (musí prijať sticky notifikáciou)"
      >
        <ArrowRightLeft className="w-2.5 h-2.5" aria-hidden />
        Preraď
      </button>
      {mounted && open
        ? createPortal(
            <ReassignModal
              leadId={leadId}
              leadName={leadName}
              currentAssigneeId={currentAssigneeId}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ReassignModal({
  leadId,
  leadName,
  currentAssigneeId,
  onClose,
}: {
  leadId: string;
  leadName: string;
  currentAssigneeId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [agents, setAgents] = React.useState<Agent[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [ok, setOk] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/agents/list");
        const j = (await r.json()) as {
          ok?: boolean;
          agents?: Agent[];
          error?: string;
        };
        if (cancelled) return;
        if (!j.ok) {
          setError(j.error ?? "Nepodarilo sa načítať tím");
          setLoading(false);
          return;
        }
        setAgents(j.agents ?? []);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "network");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendRequest(toUserId: string, toUserName: string) {
    if (busyId) return;
    setBusyId(toUserId);
    setError(null);
    try {
      const r = await fetch("/api/admin/lead/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          to_user_id: toUserId,
          reason: reason.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        const map: Record<string, string> = {
          already_pending: `${toUserName} už má pending žiadosť pre tento lead — počkaj kým odpovie.`,
          already_assigned_to_target: `${toUserName} už tento lead vlastní.`,
          target_inactive: `${toUserName} je neaktívny — nemôže dostať lead.`,
          target_not_obchod: `${toUserName} nie je obchodník.`,
        };
        setError(map[j.error ?? ""] ?? `Chyba: ${j.error ?? "unknown"}`);
        setBusyId(null);
        return;
      }
      // Confirm toast + persist "Adriána" na "Leo" wording pre admina.
      // Yellow PENDING TRANSFER badge sa objaví na karte cez refresh.
      const fromName = currentAssigneeId
        ? (agents?.find((a) => a.id === currentAssigneeId)?.name ?? "aktuálny owner")
        : "pool (voľný)";
      toast.success(
        `⏳ Žiadosť poslaná: „${leadName}" od ${fromName} → ${toUserName}. Karta má žltý PENDING TRANSFER badge kým ${toUserName} neklikne Prijať.`,
      );
      setOk(`✓ Žiadosť poslaná ${toUserName}.`);
      setBusyId(null);
      // Refresh aby sa pridal yellow badge okamžite.
      router.refresh();
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white px-5 py-3 flex items-center gap-3 shrink-0">
          <ArrowRightLeft className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
              Preradiť lead
            </div>
            <div className="font-black text-lg leading-tight truncate">
              {leadName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b bg-slate-50">
          <label className="text-[10px] uppercase tracking-wider font-black text-slate-700 mb-1 block">
            Dôvod (voliteľné — uvidí ho obchodník)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="napr. Peter je preťažený, prosím prevezmi"
            className="w-full h-9 px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading && (
            <div className="flex flex-col items-center gap-2 py-6 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <div className="text-xs font-bold">Načítavam tím…</div>
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-sm p-3 mb-3">
              ⚠ {error}
            </div>
          )}
          {ok && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-3 mb-3 font-bold">
              {ok}
            </div>
          )}
          {agents && (
            <ul className="space-y-1.5">
              {agents.map((a) => {
                const isCurrent = a.id === currentAssigneeId;
                const disabled = isCurrent || !a.active || a.paused || !!busyId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => sendRequest(a.id, a.name)}
                      disabled={disabled}
                      className={
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-left transition-colors " +
                        (isCurrent
                          ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                          : a.paused || !a.active
                            ? "border-amber-200 bg-amber-50/60 text-amber-800 cursor-not-allowed"
                            : "border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50 text-slate-900")
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm truncate">
                          {a.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {a.email}
                          {isCurrent && (
                            <span className="ml-1 text-slate-400">
                              (aktuálny)
                            </span>
                          )}
                          {a.paused && (
                            <span className="ml-1 text-amber-700 font-bold">
                              (pauznutý)
                            </span>
                          )}
                          {!a.active && (
                            <span className="ml-1 text-rose-700 font-bold">
                              (neaktívny)
                            </span>
                          )}
                        </div>
                      </div>
                      {busyId === a.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                      ) : (
                        !isCurrent &&
                        a.active &&
                        !a.paused && (
                          <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider shrink-0">
                            Poslať →
                          </span>
                        )
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
