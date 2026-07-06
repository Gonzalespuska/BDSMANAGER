"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardList, Hammer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * HandoffActions — 2 tlačítka v lead karte:
 *   • Poslať na obhliadku (violet) → naviguje na /calendar v mode "assign-inspection"
 *   • Poslať do realizácie (emerald) → naviguje na /calendar v mode "assign-realization"
 *
 * Prečo cez kalendár:
 *   Obchodák MUSÍ vidieť voľné dni (kto kedy má obhliadky/realizácie) — nie
 *   len zadať dátum naslepo. Preto klik ho pošle na kalendár stránku,
 *   tam klikne na voľný deň → modal so 2 poľami:
 *     • Poznámka
 *     • Osoba (default podľa home_city zákazky, dá sa prepnúť)
 *   Potvrdí → uloží sa priradenie.
 *
 * Query params:
 *   /calendar?assign=inspection&lead=<uuid>&city=<lokalita>
 *   /calendar?assign=realization&lead=<uuid>&city=<lokalita>
 */
export function HandoffActions({
  leadId,
  currentStatus,
  leadCity,
}: {
  leadId: string;
  currentStatus: string;
  /** Mesto zákazky (z lead.data.lokalita) — pre auto-preselect */
  leadCity?: string | null;
}) {
  // Realizáciu možno posunúť iba zo stavu kde má zmysel.
  const canRealization = ["won", "quote_sent", "interested", "inspected"].includes(
    currentStatus,
  );

  const cityParam = leadCity ? `&city=${encodeURIComponent(leadCity)}` : "";
  const inspectionHref = `/calendar?assign=inspection&lead=${leadId}${cityParam}`;
  const realizationHref = `/calendar?assign=realization&lead=${leadId}${cityParam}`;

  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="border-violet-300 text-violet-800 hover:bg-violet-50"
      >
        <Link href={inspectionHref}>
          <ClipboardList className="w-3.5 h-3.5 mr-1.5" aria-hidden />
          Poslať na obhliadku
        </Link>
      </Button>
      {canRealization ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
        >
          <Link href={realizationHref}>
            <Hammer className="w-3.5 h-3.5 mr-1.5" aria-hidden />
            Poslať do realizácie
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className={cn(
            "border-emerald-300 text-emerald-800",
            "opacity-50 cursor-not-allowed",
          )}
          title="Realizáciu možno posunúť len zo stavu Otvorené / CP poslaná / Obhliadnutý / Ukončené"
        >
          <Hammer className="w-3.5 h-3.5 mr-1.5" aria-hidden />
          Poslať do realizácie
        </Button>
      )}
    </div>
  );
}
