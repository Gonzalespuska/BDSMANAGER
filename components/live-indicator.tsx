"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Mini-status dot pre Supabase Realtime connection.
 *
 * Stavy:
 *   - connecting (žltý, blink)
 *   - live (zelený, pulse)
 *   - error / offline (sivý)
 *
 * Riadený cez setState v parent (typicky RealtimeLeadsListener volá
 * onStateChange).
 */
export type LiveState = "connecting" | "live" | "error";

export function LiveIndicator({ state }: { state: LiveState }) {
  const label =
    state === "live" ? "LIVE" : state === "connecting" ? "Pripájam…" : "Offline";
  const color =
    state === "live"
      ? "bg-emerald-500"
      : state === "connecting"
        ? "bg-amber-400"
        : "bg-zinc-400";
  const textColor =
    state === "live"
      ? "text-emerald-700"
      : state === "connecting"
        ? "text-amber-700"
        : "text-zinc-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider",
        textColor,
      )}
      title={
        state === "live"
          ? "Realtime pripojené. Nové leady sa zjavia automaticky"
          : state === "connecting"
            ? "Pripájam k Supabase realtime…"
            : "Realtime offline. Refreshni stránku pre nové dáta"
      }
    >
      <span className="relative inline-flex">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            state === "live" ? "animate-ping bg-emerald-400" : "",
          )}
        />
        <span
          className={cn("relative inline-flex rounded-full h-2 w-2", color)}
        />
      </span>
      {label}
    </span>
  );
}
