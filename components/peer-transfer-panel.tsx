"use client";

import * as React from "react";
import { ArrowRightLeft, HandHeart, Loader2, Send } from "lucide-react";

/**
 * PeerTransferPanel — na profile INÉHO používateľa (rovnaká rola)
 * poskytne 2 stĺpce:
 *   • ĽAVÝ: JEHO úlohy (leady/obhliadky/realizácie) → button „Poprosím"
 *     (pull request — pýtam si od neho)
 *   • PRAVÝ: MOJE úlohy → button „Poslať" (push — darujem mu ju)
 *
 * User 2026-07-15: „potrebujem system medzi obchodakmi a obhliadkarmi
 * a realizatormi kedy by si mohli ako keby vymenit... poslu ziadost
 * normalne cez ich profil v nejakej sekcii tim u nich tam kde maju
 * chaty a bude tam request tlacidlo otvori to nejake zakladne udaje".
 *
 * Zdielaný backend s ReassignRequestsBar — obidve strany dostanú
 * sticky notif + ding. Nič sa nepresunie pokým odchod nepotvrdí.
 */

type PeerTaskItem = {
  id: string;
  name: string;
  status: string;
  lokalita: string | null;
  plocha: string | null;
  updated_at: string;
};

type Payload = {
  role_scope: "obchod" | "obhliadky" | "realizacie";
  their_tasks: PeerTaskItem[];
  my_tasks: PeerTaskItem[];
};

export function PeerTransferPanel({
  peerId,
  peerName,
  peerRole,
}: {
  peerId: string;
  peerName: string;
  peerRole: "obchod" | "obhliadky" | "realizacie";
}) {
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const roleLabel =
    peerRole === "obchod"
      ? "leady"
      : peerRole === "obhliadky"
        ? "obhliadky"
        : "realizácie";

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/peer/tasks?peer_id=${peerId}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as { ok?: boolean; data?: Payload };
      if (j.ok && j.data) setData(j.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function request(kind: "pull" | "push", task: PeerTaskItem) {
    if (busyId || !data) return;
    const noun = kind === "pull" ? "prosím o" : "posielam";
    const promptText =
      kind === "pull"
        ? `Prosba k ${peerName} o „${task.name}" (voliteľná poznámka)`
        : `Poznámka pre ${peerName} k „${task.name}" (voliteľné)`;
    const reason = window.prompt(promptText, "");
    if (reason === null) return;
    setBusyId(task.id);
    setFlash(null);
    try {
      const body: Record<string, unknown> = {
        lead_id: task.id,
        kind,
        role_scope: data.role_scope,
        reason: reason.trim() || null,
      };
      if (kind === "push") body.to_user_id = peerId;
      const r = await fetch("/api/lead/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        const map: Record<string, string> = {
          already_pending: "Pre túto úlohu už beží žiadosť.",
          already_assigned_to_target: "Už mu patrí.",
          pull_lead_unassigned: "Úloha nemá ownera.",
          push_only_by_owner: "Push môže spraviť iba súčasný owner.",
          target_wrong_role: `${peerName} nie je ${roleLabel === "leady" ? "obchodník" : roleLabel === "obhliadky" ? "obhliadkár" : "realizátor"}.`,
        };
        setFlash({
          kind: "err",
          text: map[j.error ?? ""] ?? `Chyba: ${j.error}`,
        });
        setBusyId(null);
        return;
      }
      setFlash({
        kind: "ok",
        text: `✓ Žiadosť ${noun} „${task.name}" odoslaná ${peerName}. Cink u neho zazvoní.`,
      });
      // Refresh tasks (jeho task môže mať teraz pending badge)
      await load();
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border-2 bg-white shadow-sm p-6 flex items-center justify-center gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-bold">Načítavam úlohy…</span>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="rounded-2xl border-2 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-slate-800 to-slate-950 text-white px-5 py-3 flex items-center gap-3">
        <ArrowRightLeft className="w-5 h-5" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
            Vymeniť {roleLabel} s {peerName}
          </div>
          <div className="text-sm opacity-80">
            Prosba / dar musí byť potvrdená druhou stranou.
          </div>
        </div>
      </div>

      {flash && (
        <div
          className={
            "px-4 py-2 text-sm font-bold " +
            (flash.kind === "ok"
              ? "bg-emerald-50 text-emerald-900 border-b border-emerald-200"
              : "bg-rose-50 text-rose-900 border-b border-rose-200")
          }
        >
          {flash.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        {/* ĽAVÝ: jeho úlohy → poprosím */}
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest font-black text-rose-700 mb-2 inline-flex items-center gap-1.5">
            <HandHeart className="w-3.5 h-3.5" />
            Jeho {roleLabel} — poprosím
          </div>
          {data.their_tasks.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-3">
              {peerName} nemá aktívne {roleLabel}.
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-80 overflow-y-auto">
              {data.their_tasks.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border bg-slate-50 hover:bg-rose-50/40 hover:border-rose-300 p-2 flex items-center gap-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm truncate">
                      {t.name || "bez mena"}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[t.lokalita, t.plocha ? `${t.plocha} m²` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => request("pull", t)}
                    disabled={busyId === t.id}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 disabled:opacity-60"
                  >
                    {busyId === t.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <HandHeart className="w-3 h-3" />
                    )}
                    Poprosím
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PRAVÝ: moje úlohy → poslať mu */}
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest font-black text-indigo-700 mb-2 inline-flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Moje {roleLabel} — poslať jemu
          </div>
          {data.my_tasks.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-3">
              Nemáš aktívne {roleLabel} k odovzdaniu.
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-80 overflow-y-auto">
              {data.my_tasks.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border bg-slate-50 hover:bg-indigo-50/40 hover:border-indigo-300 p-2 flex items-center gap-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm truncate">
                      {t.name || "bez mena"}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[t.lokalita, t.plocha ? `${t.plocha} m²` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => request("push", t)}
                    disabled={busyId === t.id}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border border-indigo-300 disabled:opacity-60"
                  >
                    {busyId === t.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    Poslať
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
