"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/toast";

/**
 * LeadAdminControls — malý floating menu na admin lead karte:
 *   • Dropdown "Zmeniť status" (13 statusov)
 *   • Tlačidlo "Zmazať" (2× confirm)
 *   • Tlačidlo "Odpojiť owner" (unassign)
 *
 * User 2026-07-15: „daj mi moznost ako adminovi ich mazat alebo menit
 * aj status tu".
 */

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "🆕 Nové" },
  { value: "phone_revealed", label: "📞 Kontakt" },
  { value: "no_answer", label: "🟡 Nezdvíhali" },
  { value: "scheduled", label: "📅 Naplánované" },
  { value: "interested", label: "✅ CP" },
  { value: "not_interested", label: "❌ Nezáujem" },
  { value: "quote_sent", label: "✅ CP poslaná" },
  { value: "needs_inspection", label: "🔍 Obhliadka" },
  { value: "inspected", label: "✔️ Obhliadnutý" },
  { value: "in_realization", label: "🔨 V realizácii" },
  { value: "won", label: "🏆 Won" },
  { value: "lost", label: "💔 Stratený" },
  { value: "archived", label: "📦 Archivované" },
];

export function LeadAdminControls({
  leadId,
  leadName,
  currentStatus,
}: {
  leadId: string;
  leadName: string;
  currentStatus: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function call(
    action: "set_status" | "delete" | "unassign",
    status?: string,
  ) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/lead/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, action, status }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        toast.error(`Chyba: ${j.error ?? "unknown"}`);
        setBusy(false);
        return;
      }
      // Confirm toast — user 2026-07-15: „ked sa udeje nejaka akcia
      // pride mi confirm neajky ze preradil som lead teraz konkretne".
      if (action === "set_status") {
        const label =
          STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
        toast.success(`✓ ${leadName} → status: ${label}`);
      } else if (action === "unassign") {
        toast.success(
          `✓ ${leadName} vrátený do poolu (bez ownera). Auto-assign ho pridelí najmenej vyťaženému obchodníkovi.`,
        );
      } else if (action === "delete") {
        toast.success(`🗑 ${leadName} natrvalo zmazaný z DB.`);
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(
        `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      );
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-300 transition-colors disabled:opacity-60"
        title="Admin akcie: zmena statusu, odpojiť, zmazať"
      >
        {busy ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
        ) : (
          <MoreHorizontal className="w-2.5 h-2.5" />
        )}
        Akcie
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl bg-white shadow-2xl border-2 border-slate-200 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b bg-slate-50">
            <div className="text-[9px] uppercase tracking-wider font-black text-slate-500">
              Zmeniť status
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {STATUS_OPTIONS.map((s) => {
              const isCurrent = s.value === currentStatus;
              return (
                <li key={s.value}>
                  <button
                    type="button"
                    onClick={() => call("set_status", s.value)}
                    disabled={isCurrent || busy}
                    className={
                      "w-full text-left px-3 py-1.5 text-xs font-bold transition-colors " +
                      (isCurrent
                        ? "bg-sky-50 text-sky-700 cursor-default"
                        : "hover:bg-slate-50 text-slate-800")
                    }
                  >
                    {s.label}
                    {isCurrent && (
                      <span className="ml-2 text-[9px] text-sky-600">
                        (teraz)
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t bg-slate-50">
            {/* „Vrátiť do poolu" preč — user 2026-07-15: „nonsen daj to prec". */}
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `NATRVALO ZMAZAŤ „${leadName}"? Toto NIE JE undoable — cascade zmaže aj activity + reassign requesty.`,
                  ) &&
                  window.confirm(
                    `Naozaj natrvalo zmazať „${leadName}"? Posledné potvrdenie.`,
                  )
                )
                  call("delete");
              }}
              disabled={busy}
              className="w-full px-3 py-2 text-xs font-black text-rose-800 hover:bg-rose-50 text-left inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Zmazať NATRVALO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
