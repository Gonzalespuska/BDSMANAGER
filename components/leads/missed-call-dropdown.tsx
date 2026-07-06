"use client";

import * as React from "react";
import { PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dropdown s možnosťami pripomienky pri Nedvíha.
 * Používa FIXED pozíciu (nie absolute), aby ho nezrezal parent card overflow.
 * Backdrop klikom → close.
 */
export function MissedCallDropdown({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (hours: number | undefined) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [coord, setCoord] = React.useState<{ top: number; right: number } | null>(
    null,
  );

  React.useEffect(() => {
    if (!open) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setCoord({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={cn(
          "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-bold h-11 px-3 text-sm transition-colors",
          busy && "opacity-50 pointer-events-none",
        )}
      >
        <PhoneOff className="w-4 h-4" aria-hidden />
        Nedvíha
        <span className="text-xs opacity-80">▾</span>
      </button>

      {open && coord && (
        <>
          {/* Backdrop na close klikom mimo */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="fixed z-50 w-64 rounded-xl border-2 border-amber-300 bg-white shadow-2xl overflow-hidden"
            style={{ top: coord.top, right: coord.right }}
          >
            <div className="px-3 py-2 border-b bg-amber-50 text-[10px] uppercase tracking-wider font-black text-amber-900">
              ⏰ Pripomenúť volať…
            </div>
            <Row
              label="Za 1 hodinu"
              hint="+1h"
              onClick={() => {
                onPick(1);
                setOpen(false);
              }}
              busy={busy}
            />
            <Row
              label="Za 3 hodiny"
              hint="+3h"
              onClick={() => {
                onPick(3);
                setOpen(false);
              }}
              busy={busy}
            />
            <Row
              label="Za 6 hodín"
              hint="+6h"
              onClick={() => {
                onPick(6);
                setOpen(false);
              }}
              busy={busy}
            />
            <button
              type="button"
              onClick={() => {
                onPick(undefined);
                setOpen(false);
              }}
              disabled={busy}
              className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 border-t disabled:opacity-50"
            >
              Bez pripomienky (default 4h)
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Row({
  label,
  hint,
  onClick,
  busy,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="w-full text-left px-3 py-2.5 hover:bg-amber-50 text-sm font-bold border-b last:border-0 flex items-center justify-between disabled:opacity-50 transition-colors"
    >
      <span>⏰ {label}</span>
      <span className="text-[10px] text-muted-foreground font-mono bg-slate-100 px-1.5 py-0.5 rounded">
        {hint}
      </span>
    </button>
  );
}
