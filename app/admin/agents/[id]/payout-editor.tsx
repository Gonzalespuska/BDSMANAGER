"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Percent, X } from "lucide-react";

import { updateAgentAction } from "@/app/admin/agents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Payout percent editor — admin nastaví % z hodnoty won leadu ktorý pripadne
 * obchodákovi (napr. 10 = 10% z each won lead).
 * Slúži pre transparentné payout kalkulácie.
 */
export function PayoutEditor({
  agentId,
  initialPercent,
  agentName,
  wonMonthValue,
  wonAllValue,
}: {
  agentId: string;
  initialPercent: number;
  agentName: string;
  /** Suma value_estimate na won leadoch tento mesiac */
  wonMonthValue: number;
  /** Suma value_estimate na won leadoch celkovo */
  wonAllValue: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(String(initialPercent));
  const [saved, setSaved] = React.useState(initialPercent);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const monthPayout = (wonMonthValue * saved) / 100;
  const totalPayout = (wonAllValue * saved) / 100;

  async function save() {
    const num = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      setError("Zadaj 0 – 100");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateAgentAction(agentId, { payout_percent: num });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(num);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Percent className="w-4 h-4 text-emerald-700" aria-hidden />
        <div className="text-sm font-bold uppercase tracking-wider text-emerald-900">
          Payout — % z won leadu
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setEditing(false);
                  setValue(String(saved));
                  setError(null);
                }
              }}
              className="h-10 text-base font-bold w-24 text-right tabular-nums"
            />
            <span className="text-lg font-bold">%</span>
            <Button
              size="sm"
              onClick={save}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValue(String(saved));
                setError(null);
              }}
              disabled={busy}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          {error && (
            <div className="text-xs text-rose-700 font-semibold">{error}</div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black tabular-nums text-emerald-800">
              {saved}%
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              className="text-xs"
            >
              Upraviť
            </Button>
          </div>
          <div className="text-[11px] text-emerald-900/80 leading-tight">
            {saved > 0
              ? `${agentName} dostáva ${saved}% z hodnoty každého won leadu.`
              : `Nastav % ak ${agentName} má odmenu z hodnoty leadu (napr. 10 = 10%).`}
          </div>
          {saved > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200">
              <PayoutTile label="Tento mesiac" value={monthPayout} />
              <PayoutTile label="Celkovo" value={totalPayout} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PayoutTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/60 border border-emerald-200 p-2">
      <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-800/70">
        {label}
      </div>
      <div className="text-lg font-black tabular-nums text-emerald-900">
        {value.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} €
      </div>
    </div>
  );
}
