"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

/**
 * DeleteRealizationButton — obchodák môže zrušiť už priradenú realizáciu.
 *
 * User (2026-07-11): "obchodak moze mazat realizacie ale nech to chodi
 *   adminovi ako osobitne upozornenie ze to vymazal a nech tam je aj
 *   dovod vymazania".
 *
 * Volá POST /api/lead/delete-realization s reason. Backend:
 *   - resetne lead na status='quote_sent' (vráti sa do Finálna CP)
 *   - zmaže calendar_notes o realizácii
 *   - vloží office_reminders pre všetkých adminov
 *   - audit log lead_activities
 */
export function DeleteRealizationButton({
  leadId,
  leadName,
}: {
  leadId: string;
  leadName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  async function submit() {
    const r = reason.trim();
    if (!r) {
      setError("Napíš dôvod prečo rušíš — pôjde adminovi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lead/delete-realization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, reason: r }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      // Reset — lead sa vráti na Finálna CP tab
      window.location.href = "/obhliadnute?tab=finalna";
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusy(false);
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border-2 border-rose-200 hover:bg-rose-50 text-rose-700 px-3 py-2 text-sm font-bold transition-colors"
      title="Zrušiť priradenú realizáciu — admin dostane oznámenie"
    >
      <Trash2 className="w-4 h-4" />
      Zrušiť realizáciu
    </button>
  );

  const modal = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !busy && setOpen(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
              Zrušiť realizáciu
            </div>
            <div className="text-lg font-black leading-tight">„{leadName}"</div>
            <div className="text-xs opacity-90 mt-0.5">
              Admin dostane osobitné upozornenie s dôvodom.
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && setOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
              Dôvod zrušenia (povinné) *
            </div>
            <textarea
              autoFocus
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="napr. Klient si to rozmyslel — chce inú farbu / Termín kolidoval s inou zákazkou / Klient nezaplatil zálohu"
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 bg-white text-sm font-semibold resize-none focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
            <div className="font-black">Čo sa stane:</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Lead sa vráti do „Finálna CP" (môžeš znova priradiť)</li>
              <li>Zmažú sa kalendárové zápisy o realizácii</li>
              <li>Admin dostane oznámenie s dôvodom</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-900">
              ⚠ {error}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-3 bg-slate-50 flex items-center gap-2">
          <button
            type="button"
            onClick={() => !busy && setOpen(false)}
            className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2.5 text-sm font-bold"
            disabled={busy}
          >
            Zrušiť
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !reason.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 text-sm font-black shadow-sm disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rušim…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Áno, zrušiť realizáciu
              </>
            )}
          </button>
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
