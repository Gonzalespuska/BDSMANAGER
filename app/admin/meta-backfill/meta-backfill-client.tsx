"use client";

import * as React from "react";
import { Download, Play } from "lucide-react";

interface BackfillResult {
  ok: boolean;
  summary?: {
    total: number;
    inserted: number;
    duplicates: number;
    errors: number;
  };
  results?: Array<{
    id: string;
    status: "inserted" | "duplicate" | "error" | "not_found";
    error?: string;
    name?: string;
  }>;
  error?: string;
}

export function MetaBackfillClient() {
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<BackfillResult | null>(null);

  // Extract clean IDs from paste — supports:
  //   l:891026250611462
  //   891026250611462
  //   whole lines with tabs — take first column
  const ids = React.useMemo(() => {
    return input
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.replace(/^l:/, ""))
      .filter((x) => /^\d{10,}$/.test(x));
  }, [input]);

  async function run() {
    if (ids.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/meta-backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadgen_ids: ids }),
      });
      const data = (await res.json()) as BackfillResult;
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 space-y-3">
        <h2 className="font-bold text-sm inline-flex items-center gap-2 text-blue-900">
          📋 Paste leadgen_id (jeden na riadok, alebo cely stĺpec A)
        </h2>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={12}
          placeholder="Príklad:&#10;l:891026250611462&#10;l:256535652059514&#10;l:102780812672&#10;...&#10;&#10;(môžeš paste celý stĺpec zo Sheets — parsujem si všetko sám)"
          className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none resize-y"
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">
            Rozpoznaných ID: <strong className="text-blue-700">{ids.length}</strong>
            {ids.length > 500 && (
              <span className="text-rose-700 ml-2">
                ⚠️ Max 500 na jedno volanie — orežem
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={run}
            disabled={busy || ids.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold transition-colors shadow"
          >
            {busy ? (
              <>
                <Download className="w-4 h-4 animate-pulse" />
                Sťahujem…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Backfill {ids.length} leadov
              </>
            )}
          </button>
        </div>
      </section>

      {result && (
        <section className="rounded-2xl border-2 bg-background overflow-hidden">
          <header className="px-4 py-3 border-b bg-slate-50">
            <h2 className="font-bold">📊 Výsledok</h2>
          </header>
          <div className="p-4">
            {!result.ok && (
              <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 mb-3">
                ❌ {result.error ?? "Neznáma chyba"}
              </div>
            )}
            {result.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <SummaryTile label="Celkom" value={result.summary.total} tint="slate" />
                <SummaryTile
                  label="Vložených"
                  value={result.summary.inserted}
                  tint="emerald"
                />
                <SummaryTile
                  label="Duplikáty"
                  value={result.summary.duplicates}
                  tint="amber"
                />
                <SummaryTile
                  label="Chyby"
                  value={result.summary.errors}
                  tint="rose"
                />
              </div>
            )}
            {result.results && (
              <div className="max-h-[400px] overflow-auto text-xs font-mono">
                {result.results.map((r, i) => (
                  <div
                    key={i}
                    className={
                      "px-2 py-1 border-b flex items-center justify-between gap-2 " +
                      (r.status === "inserted"
                        ? "bg-emerald-50 text-emerald-900"
                        : r.status === "duplicate"
                          ? "bg-amber-50 text-amber-900"
                          : "bg-rose-50 text-rose-900")
                    }
                  >
                    <span>{r.id}</span>
                    <span className="font-semibold">
                      {r.status === "inserted" && `✅ ${r.name}`}
                      {r.status === "duplicate" && "🔁 už existuje"}
                      {r.status === "not_found" && `❌ ${r.error ?? "not found"}`}
                      {r.status === "error" && `❌ ${r.error}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: "slate" | "emerald" | "amber" | "rose";
}) {
  const bg = {
    slate: "bg-slate-50 border-slate-200",
    emerald: "bg-emerald-50 border-emerald-300",
    amber: "bg-amber-50 border-amber-300",
    rose: "bg-rose-50 border-rose-300",
  }[tint];
  const text = {
    slate: "text-slate-800",
    emerald: "text-emerald-800",
    amber: "text-amber-800",
    rose: "text-rose-800",
  }[tint];
  return (
    <div className={"rounded-lg border-2 p-3 " + bg}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div className={"mt-1 text-2xl font-black tabular-nums " + text}>
        {value}
      </div>
    </div>
  );
}
