"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, X } from "lucide-react";

/**
 * LeadEmailEditor — inline „+ Doplniť email" chip pre leady kde chýba
 * email. Ekvivalent MissingFieldChip pre top-level lead.email column.
 *
 * User 2026-07-16: „niekedy v leade nieje email v tom pripade nech je
 * kolonka kde mozem doplnit ten email rovanko ako ked chyba mesto typ
 * podlahy".
 */
export function LeadEmailEditor({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const v = value.trim();
    if (!v) {
      setError("Napíš email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Neplatný formát emailu");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/lead/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, field: "email", value: v }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        setError(j.error ?? "chyba");
        setBusy(false);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Mail className="w-4 h-4 shrink-0 text-slate-500" aria-hidden />
        <input
          ref={inputRef}
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setValue("");
              setError(null);
            }
          }}
          disabled={busy}
          placeholder="meno@domena.sk"
          className="flex-1 min-w-[200px] h-9 px-3 rounded-md border-2 border-emerald-300 focus:outline-none focus:border-emerald-500 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !value.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Uložiť
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue("");
            setError(null);
          }}
          disabled={busy}
          className="inline-flex items-center p-1.5 rounded-md text-xs font-black bg-white border border-slate-300 hover:bg-slate-50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {error && (
          <div className="w-full text-xs text-rose-700 font-bold">⚠ {error}</div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:border-emerald-500 hover:bg-emerald-50 text-sm font-black text-emerald-800 transition-colors"
      title="Doplniť email zákazníka"
    >
      <Mail className="w-4 h-4 shrink-0" aria-hidden />
      + Doplniť email
    </button>
  );
}
