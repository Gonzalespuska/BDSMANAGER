"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[/agent] runtime error:", error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto mt-6 rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-5 space-y-3">
      <div className="flex items-center gap-2 text-rose-900 dark:text-rose-100 font-black text-lg">
        <AlertTriangle className="w-5 h-5" aria-hidden />
        Chyba v /agent
      </div>
      <div className="text-sm font-mono bg-white dark:bg-slate-950 border border-rose-200 dark:border-rose-800 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
        {error.message || "(bez message)"}
      </div>
      {error.digest && (
        <div className="text-[11px] text-muted-foreground font-mono">
          Digest: {error.digest}
        </div>
      )}
      {error.stack && (
        <details className="text-[11px]">
          <summary className="cursor-pointer font-black text-rose-900 dark:text-rose-100">
            Stack trace
          </summary>
          <pre className="mt-2 font-mono bg-white dark:bg-slate-950 border border-rose-200 dark:border-rose-800 rounded p-2 overflow-x-auto max-h-96">
            {error.stack}
          </pre>
        </details>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-black px-3 py-1.5"
        >
          Skúsiť znova
        </button>
      </div>
    </div>
  );
}
