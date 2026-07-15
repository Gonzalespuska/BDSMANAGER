"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * PipelineWindowSwitch — 2-way segmented control 7d/30d.
 * Nastavuje URL query param ?pw=7d|30d, čo spôsobí server re-render
 * s inou window pre pipeline queries.
 */
export function PipelineWindowSwitch({ current }: { current: "7d" | "30d" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  // User 2026-07-12: „tento button moc nejde" — Predtym sa pending state
  // nikdy nezresetoval, takze tlacidla ostali disabled + opacity-70.
  // Fix: useTransition namiesto local state — auto-reset po nav.

  function switchTo(win: "7d" | "30d") {
    if (win === current) return;
    const params = new URLSearchParams(sp?.toString() ?? "");
    if (win === "7d") {
      params.delete("pw"); // 7d je default → clean URL
    } else {
      params.set("pw", win);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/admin/prehlad?${qs}` : "/admin/prehlad");
    });
  }
  const pending = isPending;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border-2 border-sky-200 bg-white/60 p-0.5 text-[11px] font-bold",
        pending && "opacity-70",
      )}
      role="group"
      aria-label="Časové okno pipeline"
    >
      <button
        type="button"
        onClick={() => switchTo("7d")}
        disabled={pending}
        className={cn(
          "px-2.5 py-1 rounded transition-colors",
          current === "7d"
            ? "bg-sky-500 text-white shadow-sm"
            : "text-sky-800 hover:bg-sky-100",
        )}
      >
        7 dní
      </button>
      <button
        type="button"
        onClick={() => switchTo("30d")}
        disabled={pending}
        className={cn(
          "px-2.5 py-1 rounded transition-colors",
          current === "30d"
            ? "bg-sky-500 text-white shadow-sm"
            : "text-sky-800 hover:bg-sky-100",
        )}
      >
        30 dní
      </button>
    </div>
  );
}
