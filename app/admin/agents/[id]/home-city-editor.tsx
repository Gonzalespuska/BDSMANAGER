"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, X } from "lucide-react";

import { updateAgentAction } from "@/app/admin/agents/actions";
import { Button } from "@/components/ui/button";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
import { cn } from "@/lib/utils";

/**
 * HomeCityEditor — nastavuje `users.home_city` (domovské mesto usera).
 *
 * Používa sa pri auto-preselect obhliadkara / realizatora:
 *   Ak je lead z Bratislavy a obhliadkar má home_city=Bratislava → prefillne sa.
 *   Obchodák môže manuálne prepnúť na iného obhliadkara ak treba.
 *
 * Autocomplete = ten istý komponent ako pri generátori a novom leade
 * (píše "B" → ponuka Bratislava, Banská Bystrica, atď.).
 */
export function HomeCityEditor({
  agentId,
  initialCity,
  agentRole,
}: {
  agentId: string;
  initialCity: string | null;
  agentRole: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!initialCity);
  const [city, setCity] = React.useState(initialCity ?? "");
  const [savedCity, setSavedCity] = React.useState(initialCity ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    const trimmed = city.trim();
    setBusy(true);
    setError(null);
    const res = await updateAgentAction(agentId, {
      home_city: trimmed || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedCity(trimmed);
    setEditing(false);
    router.refresh();
  }

  // Zobrazujeme iba pre role kde má zmysel (obhliadky / realizacie / admin).
  // Skolenie / office ju nepotrebujú — nechodia do terénu.
  const relevantRoles = ["obhliadky", "realizacie", "admin", "obchod"];
  if (!relevantRoles.includes(agentRole)) return null;

  const isInspector = agentRole === "obhliadky";
  const roleHint = isInspector
    ? "Pri obhliadkach z rovnakej lokality sa tento obhliadkár prefillne automaticky."
    : agentRole === "realizacie"
      ? "Používa sa pri smart-suggest realizácie podľa lokality zákazky."
      : "Voľné — pomôže pri smart-suggest priradení podľa lokality.";

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-violet-600" aria-hidden />
        <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Domovské mesto
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <CityAutocomplete
            value={city}
            onChange={setCity}
            placeholder="Napíš mesto — napr. B (Bratislava)"
            className="h-10 text-base font-bold"
          />
          {error && (
            <div className="text-xs text-destructive">⚠ {error}</div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={busy}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-3.5 h-3.5 mr-1" aria-hidden />
              {busy ? "Ukladám…" : "Uložiť"}
            </Button>
            {savedCity && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setCity(savedCity);
                  setError(null);
                }}
              >
                <X className="w-3.5 h-3.5 mr-1" aria-hidden />
                Zrušiť
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {roleHint}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-extrabold">
            {savedCity ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-violet-500" aria-hidden />
                {savedCity}
              </span>
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
            {savedCity ? "Upraviť" : "Pridať mesto"}
          </Button>
        </div>
      )}
    </div>
  );
}
