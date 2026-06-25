"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_META, type LeadStatus } from "@/lib/types/lead";
import { changeStatusInlineAction } from "@/app/agent/actions";

// Picker zobrazuje iba 6 high-level statusov ktoré matchujú tab kategórie:
//   Nový → Kontakt → Nedvíha → Otvorené → Ukončené / Archivované
// (Sub-statuses ako quote_sent, lost, not_interested zostali v DB pre
// detailný tracking, ale agent ich nepotrebuje meniť ručne.)
const STATUSES: LeadStatus[] = [
  "new",
  "phone_revealed",
  "no_answer",
  "interested",
  "won",
  "archived",
];

const STATUS_DOT: Record<LeadStatus, string> = {
  new: "bg-red-500",
  phone_revealed: "bg-blue-500",
  no_answer: "bg-amber-500",
  scheduled: "bg-purple-500",
  interested: "bg-emerald-600",
  quote_sent: "bg-violet-600",
  not_interested: "bg-zinc-500",
  won: "bg-green-700",
  lost: "bg-red-700",
  archived: "bg-zinc-400",
};

const STATUS_TEXT: Record<LeadStatus, string> = {
  new: "Nový",
  phone_revealed: "Kontakt",
  no_answer: "Nedvíha",
  scheduled: "Naplánovaný",
  interested: "Otvorené",
  quote_sent: "Ponuka poslaná",
  not_interested: "Nezáujem",
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
    setBusy(true);
    const result = await changeStatusInlineAction(leadId, newStatus);
    if (result.ok) {
      setCurrent(newStatus);
      onChange?.(newStatus);
      setOpen(false);
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
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
                <span
                  className={cn(
                    "shrink-0 w-2.5 h-2.5 rounded-full",
                    STATUS_DOT[s],
                  )}
                  aria-hidden
                />
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
