"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Manuálne spúšťa /api/cron/sync-epoxidovo cez server action (nemôžeme
 * poslať CRON_SECRET z clienta priamo — obišli by sme auth).
 */
export function SyncEpoxidovoButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<
    | { ok: true; checked: number; new: number }
    | { ok: false; error: string }
    | null
  >(null);

  async function trigger() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/trigger-sync", { method: "POST" });
      const json = (await r.json()) as
        | { ok: true; checked: number; new: number }
        | { ok: false; error: string };
      setResult(json);
      if (json.ok && json.new > 0) {
        router.refresh();
      }
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <div className="font-bold text-sm inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-sky-600" aria-hidden />
          Manuálny sync epoxidovo.sk → CRM
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Klikni ak treba okamžite doťahať nové leady (bez čakania na cron).
        </div>
        {result && (
          <div
            className={`text-xs font-bold mt-1 inline-flex items-center gap-1 ${
              result.ok
                ? result.new > 0
                  ? "text-emerald-700"
                  : "text-muted-foreground"
                : "text-rose-700"
            }`}
          >
            {result.ok ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                {result.new > 0
                  ? `Pridaných ${result.new} nových leadov (z ${result.checked} zo zdrojovej DB)`
                  : `Nič nové — všetkých ${result.checked} už bolo synced.`}
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" aria-hidden />
                {result.error}
              </>
            )}
          </div>
        )}
      </div>
      <Button
        type="button"
        onClick={trigger}
        disabled={busy}
        className="bg-sky-600 hover:bg-sky-700"
      >
        <RefreshCw
          className={`w-4 h-4 mr-1.5 ${busy ? "animate-spin" : ""}`}
          aria-hidden
        />
        {busy ? "Synchronizujem…" : "Spustiť sync"}
      </Button>
    </div>
  );
}
