"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Phone, X } from "lucide-react";

import { updateAgentAction } from "@/app/admin/agents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { autoFormatPhoneWhileTyping, formatPhoneIntl } from "@/lib/phone-format";

/**
 * Editovateľné phone pole v admin/agents/[id] detaile.
 * Zobrazí aktuálny telefón (alebo "—" ak chýba) + Edit button.
 * Po klikom otvorí input pre úpravu, save cez updateAgentAction.
 */
export function PhoneEditor({
  agentId,
  initialPhone,
  agentName,
}: {
  agentId: string;
  initialPhone: string | null;
  agentName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!initialPhone);
  const [phone, setPhone] = React.useState(initialPhone ?? "");
  const [savedPhone, setSavedPhone] = React.useState(initialPhone ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    const trimmed = phone.trim();
    if (trimmed && trimmed.replace(/\s/g, "").length < 9) {
      setError("Telefón je príliš krátky (min 9 znakov)");
      return;
    }
    setBusy(true);
    setError(null);
    // Normalizuj na +421 950 890 098 format PRED uložením — jednotný tvar
    // v celom CRM + email footeroch. User 2026-07-16: „telefonne cislo
    // nech tam je rovnake pravidlo ako sme sa bavili v tom formate
    // +421 950 890 a nech to takto ukazuje vsade aj do footerov mailov".
    const normalized = trimmed ? formatPhoneIntl(trimmed) : null;
    const res = await updateAgentAction(agentId, {
      phone: normalized,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(`Chyba: ${res.error}`);
      return;
    }
    setSavedPhone(normalized ?? "");
    setEditing(false);
    toast.success(`✅ Telefón uložený: ${normalized || "(prázdny)"}`);
    window.location.reload();
  }

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center gap-2 mb-3">
        <Phone className="w-4 h-4 text-sky-600" aria-hidden />
        <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Telefón obchodníka
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(autoFormatPhoneWhileTyping(e.target.value))}
            onBlur={(e) => setPhone(autoFormatPhoneWhileTyping(e.target.value))}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) {
                e.preventDefault();
                setPhone(autoFormatPhoneWhileTyping(text));
              }
            }}
            placeholder="+421 950 890 098"
            autoFocus
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setPhone(savedPhone);
                setError(null);
              }
            }}
            className="h-10 text-base font-bold"
          />
          {error && (
            <div className="text-xs text-destructive">⚠ {error}</div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={busy || !phone.trim()}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-3.5 h-3.5 mr-1" aria-hidden />
              {busy ? "Ukladám…" : "Uložiť"}
            </Button>
            {savedPhone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setPhone(savedPhone);
                  setError(null);
                }}
              >
                <X className="w-3.5 h-3.5 mr-1" aria-hidden />
                Zrušiť
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Použije sa v <strong>email signatúre</strong> (podpis pod {agentName})
            a v <strong>PDF footeri cenovej ponuky</strong> ktorú obchodník
            posiela zákazníkom.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-extrabold tabular-nums">
            {savedPhone ? (
              formatPhoneIntl(savedPhone)
            ) : (
              <span className="text-muted-foreground italic font-normal text-base">
                — nezadané
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            {savedPhone ? "Upraviť" : "Pridať telefón"}
          </Button>
        </div>
      )}
    </div>
  );
}
