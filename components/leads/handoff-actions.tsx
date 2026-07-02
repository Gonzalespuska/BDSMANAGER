"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Hammer, Loader2, Check, X } from "lucide-react";

import {
  handoverToInspectionAction,
  handoverToRealizationAction,
  listUsersByRoleAction,
} from "@/app/agent/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * HandoffActions — 2 tlačítka v lead karte pre obchodníka:
 *   • Poslať na obhliadku (violet) → vyberá obhliadkára z dropdownu
 *   • Poslať do realizácie (emerald) → vyberá člena realizačného tímu
 *
 * Po klikne sa otvorí picker modal so zoznamom active userov s danou rolou.
 * Po výbere sa vykoná server action, lead zmení status a zmizne z obchodníkovho tabu.
 */
export function HandoffActions({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = React.useState<null | "inspection" | "realization">(null);
  const [busy, setBusy] = React.useState(false);
  const [users, setUsers] = React.useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function openPicker(kind: "inspection" | "realization") {
    setPickerOpen(kind);
    setLoading(true);
    setNote("");
    const res = await listUsersByRoleAction(
      kind === "inspection" ? "obhliadky" : "realizacie",
    );
    setLoading(false);
    if (!res.ok) {
      alert(`Nepodarilo sa načítať zoznam: ${res.error}`);
      setPickerOpen(null);
      return;
    }
    setUsers(res.users);
  }

  async function submit(pickedUserId: string) {
    if (!pickerOpen) return;
    setBusy(true);
    const res = pickerOpen === "inspection"
      ? await handoverToInspectionAction(leadId, pickedUserId, note.trim() || undefined)
      : await handoverToRealizationAction(leadId, pickedUserId, note.trim() || undefined);
    setBusy(false);
    if (!res.ok) {
      alert(`Chyba: ${res.error}`);
      return;
    }
    setPickerOpen(null);
    router.refresh();
  }

  // Realizáciu možno posunúť LEN keď je lead vo "won" alebo "quote_sent" stave
  // (dohodnuté / ponuka akceptovaná). Obhliadka je flexibilnejšia.
  const canRealization = ["won", "quote_sent", "interested"].includes(currentStatus);

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openPicker("inspection")}
          disabled={busy}
          className="border-violet-300 text-violet-800 hover:bg-violet-50"
        >
          <ClipboardList className="w-3.5 h-3.5 mr-1.5" aria-hidden />
          Poslať na obhliadku
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openPicker("realization")}
          disabled={busy || !canRealization}
          className={cn(
            "border-emerald-300 text-emerald-800 hover:bg-emerald-50",
            !canRealization && "opacity-50 cursor-not-allowed",
          )}
          title={!canRealization ? "Realizáciu možno posunúť len zo stavu Otvorené / Ponuka / Dohodnuté" : undefined}
        >
          <Hammer className="w-3.5 h-3.5 mr-1.5" aria-hidden />
          Poslať do realizácie
        </Button>
      </div>

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !busy && setPickerOpen(null)}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold inline-flex items-center gap-2">
                {pickerOpen === "inspection" ? (
                  <>
                    <ClipboardList className="w-5 h-5 text-violet-600" aria-hidden />
                    Poslať na obhliadku
                  </>
                ) : (
                  <>
                    <Hammer className="w-5 h-5 text-emerald-600" aria-hidden />
                    Poslať do realizácie
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => !busy && setPickerOpen(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Zavrieť"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              {pickerOpen === "inspection"
                ? "Vyber obhliadkára ktorý pôjde na miesto obhliadnuť situáciu."
                : "Vyber člena realizačného tímu ktorý bude zákazku realizovať."}
            </p>

            {/* Poznámka (voliteľná) */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Poznámka (voliteľné)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="napr. Volať pred obhliadkou, klient je v práci do 16:00"
                className="mt-1 w-full h-16 rounded-md border border-input bg-background p-2 text-sm resize-none"
                disabled={busy}
                maxLength={500}
              />
            </div>

            {/* User list */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Vyber osobu
              </label>
              {loading ? (
                <div className="mt-2 flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="mt-2 rounded-lg border-2 border-dashed border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Žiadny aktívny{" "}
                  {pickerOpen === "inspection" ? "obhliadkár" : "člen realizačného tímu"}{" "}
                  v systéme. Admin ho musí najprv pridať cez{" "}
                  <code>/admin/agents</code>.
                </div>
              ) : (
                <ul className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                  {users.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => submit(u.id)}
                        disabled={busy}
                        className="w-full text-left rounded-lg border border-input bg-background hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                        ) : (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {busy && (
              <div className="text-xs text-muted-foreground text-center">
                Odovzdávam…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
