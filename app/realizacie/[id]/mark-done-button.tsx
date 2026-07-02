"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { markRealizationDoneAction } from "@/app/agent/actions";
import { Button } from "@/components/ui/button";

export function MarkDoneButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function done() {
    setBusy(true);
    const res = await markRealizationDoneAction(leadId);
    setBusy(false);
    if (!res.ok) {
      alert(`Chyba: ${res.error}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
      {!confirming ? (
        <div className="text-center space-y-2">
          <div className="text-sm text-emerald-900">
            Keď je realizácia hotová a zákazník s ňou spokojný:
          </div>
          <Button
            type="button"
            onClick={() => setConfirming(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden />
            Označiť ako dokončené
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-bold text-emerald-900 text-center">
            Určite označiť ako dokončené? Zákazka sa presunie do histórie a obchodník uvidí notifikáciu.
          </div>
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              onClick={done}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden />
              )}
              Áno, dokončiť
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Zrušiť
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
