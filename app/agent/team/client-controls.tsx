"use client";

import * as React from "react";
import { Pause } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  updateAgentCapacityAction,
  setAgentActiveAction,
} from "./actions";

/**
 * Capacity slider (0-10) — debounced save on input change.
 * 0 = pauzovaný, 5 = default, 10 = max.
 */
export function CapacityControl({
  userId,
  initial,
}: {
  userId: string;
  initial: number;
}) {
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  function commit(next: number) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      const res = await updateAgentCapacityAction(userId, next);
      setSaving(false);
      if (!res.ok) setError(res.error);
    }, 350);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        {value === 0 && (
          <Pause className="w-3.5 h-3.5 text-zinc-500" aria-hidden />
        )}
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => commit(Number(e.target.value))}
          className="w-24 accent-sky-600"
          disabled={saving}
          aria-label="Capacity"
        />
        <span
          className={cn(
            "min-w-[1.5ch] text-center font-bold",
            value === 0 && "text-zinc-500",
            value >= 8 && "text-emerald-600",
          )}
        >
          {value}
        </span>
      </div>
      {error && (
        <span className="text-[10px] text-destructive">{error}</span>
      )}
      {saving && (
        <span className="text-[10px] text-muted-foreground">ukladám…</span>
      )}
    </div>
  );
}

/**
 * Active toggle switch — deaktivuje usera (auto-assign ho preskočí).
 */
export function ActiveToggle({
  userId,
  initial,
}: {
  userId: string;
  initial: boolean;
}) {
  const [on, setOn] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    if (busy) return;
    const prev = on;
    const next = !on;
    setOn(next);
    setBusy(true);
    const res = await setAgentActiveAction(userId, next);
    setBusy(false);
    if (!res.ok) {
      setOn(prev);
      alert(`Chyba: ${res.error}`);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        on ? "bg-emerald-500" : "bg-muted",
        busy && "opacity-60",
      )}
      aria-pressed={on}
      aria-label={on ? "Deaktivovať" : "Aktivovať"}
    >
      <span
        className={cn(
          "inline-block w-4 h-4 transform rounded-full bg-white transition-transform shadow",
          on ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
