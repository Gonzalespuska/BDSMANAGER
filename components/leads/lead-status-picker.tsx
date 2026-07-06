"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_META, type LeadStatus } from "@/lib/types/lead";

// Picker zobrazuje iba 6 high-level statusov ktoré matchujú tab kategórie:
//   Nový → Kontakt → Nedvíha → Otvorené → Ukončené / Archivované
// (Sub-statuses ako quote_sent, lost, not_interested zostali v DB pre
// detailný tracking, ale agent ich nepotrebuje meniť ručne.)
const STATUSES: LeadStatus[] = [
  "new",
  "phone_revealed",
  "no_answer",
  "interested",
  "inspected",
  "won",
  "archived",
];

/**
 * Emoji per status — musí MATCHOVAŤ tab-y v `/agent` (TABS array v
 * app/agent/page.tsx). Nahradili sme farebné bodky lebo user povedal
 * "emojis nech su aj v statuse miesto tych farieb nezmyslenych".
 */
const STATUS_EMOJI: Record<LeadStatus, string> = {
  new: "🆕",
  phone_revealed: "📞",
  no_answer: "🟡",
  scheduled: "📅",
  interested: "✅",
  quote_sent: "✅",
  not_interested: "❌",
  needs_inspection: "🔍",
  inspected: "✔️",
  in_realization: "🔨",
  won: "🏆",
  lost: "💔",
  archived: "📦",
};

/**
 * IMPORTANT: label-y musia matchovať tab-y v `/agent` (TABS array v
 * app/agent/page.tsx) — inak user vidí v hornej liste tab "CP", ale
 * v pickeri leadu "Otvorené" a nedá to logicky zladiť.
 */
const STATUS_TEXT: Record<LeadStatus, string> = {
  new: "Nové",
  phone_revealed: "Kontakt",
  no_answer: "Nezdvíhali",
  scheduled: "Naplánovaný",
  interested: "CP",
  quote_sent: "CP poslaná",
  not_interested: "Nezáujem",
  needs_inspection: "Na obhliadku",
  inspected: "Obhliadnutý",
  in_realization: "V realizácii",
  won: "Ukončené",
  lost: "Stratený",
  archived: "Archivované",
};

export function LeadStatusPicker({
  leadId,
  status,
  onChange,
}: {
  leadId: string;
  status: LeadStatus;
  onChange?: (newStatus: LeadStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [current, setCurrent] = React.useState<LeadStatus>(status);
  const [direction, setDirection] = React.useState<"down" | "up">("down");
  const ref = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Otvor smerom hore ak je málo miesta dole (posledná karta vo viewporte)
  React.useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDirection(spaceBelow < 380 ? "up" : "down");
  }, [open]);

  async function handlePick(newStatus: LeadStatus) {
    if (newStatus === current) {
      setOpen(false);
      return;
    }
    // Optimistic — UI sa prepne hneď, fetch ide na pozadí; revert ak server zlyhá
    const prev = current;
    setCurrent(newStatus);
    onChange?.(newStatus);
    setOpen(false);
    try {
      const r = await fetch("/api/lead/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          action: "change_status",
          new_status: newStatus,
        }),
      });
      const json = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !json.ok) {
        setCurrent(prev);
        onChange?.(prev);
        alert(`Chyba: ${json.error ?? `HTTP ${r.status}`}`);
      }
    } catch (e) {
      setCurrent(prev);
      onChange?.(prev);
      alert(`Chyba: ${e instanceof Error ? e.message : "network"}`);
    }
  }

  const meta = STATUS_META[current];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy}
        className={cn(
          "group inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider pl-2.5 pr-1.5 py-1 rounded-md cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-foreground/20 transition-all border border-black/10",
          meta.pill,
          busy && "opacity-50",
        )}
        aria-label="Zmeniť stav leadu"
      >
        {meta.label}
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-black/20 group-hover:bg-black/30 transition-colors">
          <ChevronDown
            className={cn(
              "w-3 h-3 stroke-[3] transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 z-20 w-56 max-h-[320px] overflow-y-auto rounded-lg border bg-background shadow-xl p-1",
            direction === "down" ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {STATUSES.map((s) => {
            const isActive = s === current;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handlePick(s)}
                disabled={busy}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-md text-sm font-semibold flex items-center gap-2.5 hover:bg-muted transition-colors",
                  isActive && "bg-muted",
                )}
              >
                <span className="shrink-0 w-4 text-base leading-none" aria-hidden>
                  {STATUS_EMOJI[s]}
                </span>
                <span className="flex-1">{STATUS_TEXT[s]}</span>
                {isActive && (
                  <span className="text-emerald-600 text-xs">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
