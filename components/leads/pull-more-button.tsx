"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { toast } from "@/components/ui/toast";

/**
 * PullMoreButton — „+5 leadov z poolu" tlačidlo na /agent stránke.
 *
 * User 2026-07-16: „urob manualne tlacdilo v pripade ze obchodakovi
 * dojdu nove leady... prida mu to 5 leadov z poolu ktore su nedotknute...
 * zobere kazdemu obchodakovi 1 nie jednemu 5".
 */
export function PullMoreButton({
  count = 5,
  size = "sm",
}: {
  count?: number;
  /** "sm" = default header chip; "lg" = veľký CTA button pre empty state. */
  size?: "sm" | "lg";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function pull() {
    if (busy) return;
    const ok = window.confirm(
      `Zoberieš ${count} nedotknutých leadov od kolegov (rozdelené — po 1 z každého aktívneho obchodáka, oldest first). Pokračovať?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/agent/pool/pull-more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        transferred?: number;
        requested?: number;
        breakdown?: Array<{ from_name: string; count: number }>;
        error?: string;
        message?: string;
      };
      if (!r.ok || !j.ok) {
        toast.error(`Chyba: ${j.error ?? "unknown"}`);
        setBusy(false);
        return;
      }
      if ((j.transferred ?? 0) === 0) {
        toast.info(
          j.message ?? "Nič na prevzatie — kolegovia nemajú untouched leady.",
        );
        setBusy(false);
        return;
      }
      const detail =
        (j.breakdown ?? [])
          .map((b) => `${b.count}× od ${b.from_name}`)
          .join(", ") || "";
      toast.success(
        `✓ Získané ${j.transferred} leadov${detail ? ` (${detail})` : ""}. Refresh…`,
      );
      setTimeout(() => router.refresh(), 900);
    } catch (e) {
      toast.error(
        `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const isLarge = size === "lg";
  return (
    <button
      type="button"
      onClick={pull}
      disabled={busy}
      className={
        isLarge
          ? "inline-flex items-center gap-2 px-5 py-3 rounded-xl text-base font-black bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md disabled:opacity-60"
          : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-black bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm disabled:opacity-60"
      }
      title={`Získať ${count} nedotknutých leadov z poolu (po 1 od každého kolegu)`}
    >
      {busy ? (
        <Loader2 className={isLarge ? "w-5 h-5 animate-spin" : "w-4 h-4 animate-spin"} aria-hidden />
      ) : (
        <Plus className={isLarge ? "w-5 h-5" : "w-4 h-4"} aria-hidden />
      )}
      Pridať leady
    </button>
  );
}
