"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

import { updateAgentAction } from "@/app/admin/agents/actions";
import { toast } from "@/components/ui/toast";

/**
 * NameEditor — inline editovateľné meno agenta na /admin/agents/[id].
 * Klik na ceruzku pri mene → input → save cez updateAgentAction.
 *
 * User 2026-07-15: „nemam moznost upravit meno agenta".
 */
export function AgentNameEditor({
  agentId,
  initialName,
  fallbackEmail,
}: {
  agentId: string;
  initialName: string | null;
  fallbackEmail: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(initialName ?? "");
  const [saved, setSaved] = React.useState(initialName ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Meno nemôže byť prázdne");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateAgentAction(agentId, { name: trimmed });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(`Chyba: ${res.error}`);
      return;
    }
    setSaved(trimmed);
    setEditing(false);
    toast.success(`✅ Meno zmenené na „${trimmed}"`);
    // Delay pred reload — bez neho zabije JS kontext skôr než sa toast
    // stihne vykresliť. User 2026-07-16 → „no notification".
    setTimeout(() => window.location.reload(), 900);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setName(saved);
                setError(null);
              }
            }}
            disabled={busy}
            className="text-2xl font-extrabold tracking-tight leading-none px-2 py-1 rounded-md border-2 border-sky-400 focus:outline-none focus:border-sky-600 min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
          >
            <Check className="w-3.5 h-3.5" />
            {busy ? "Ukladám…" : "Uložiť"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(saved);
              setError(null);
            }}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-black bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {error && (
          <div className="text-xs text-rose-700 font-bold">⚠ {error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <h1 className="text-2xl font-extrabold tracking-tight leading-none truncate">
        {saved || (
          <span className="text-muted-foreground italic">
            bez mena ({fallbackEmail})
          </span>
        )}
      </h1>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 inline-flex items-center gap-1 p-1.5 rounded-md text-xs font-black bg-white border border-slate-300 hover:border-sky-400 hover:bg-sky-50 text-slate-700"
        title="Upraviť meno"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
