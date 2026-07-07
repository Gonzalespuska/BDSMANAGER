"use client";

import Link from "next/link";
import { MapPin, Phone, Ruler, StickyNote } from "lucide-react";

import { formatPhoneSK } from "@/lib/phone-format";
import type { Lead } from "@/lib/types/lead";

/**
 * ObhliadkaCard — jedna karta v /obhliadky dashbore.
 *
 * MUSÍ byť client komponent lebo phone link má `onClick={e =>
 * e.stopPropagation()}` (aby klik na telefón nespustil route na detail).
 * V RSC (server) sa inline event handler nedá priradiť native `<a>` —
 * Next 14 hodí runtime error „Event handlers cannot be passed to Client
 * Component props" a stránka spadne s digest.
 */
export function ObhliadkaCard({ lead }: { lead: Lead }) {
  const rawData = lead.data;
  const data = (
    rawData && typeof rawData === "object" ? rawData : {}
  ) as Record<string, string>;
  const date = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyL = lead as any;
    const raw =
      anyL.inspection_at ??
      lead.next_callback_at ??
      data.inspection_scheduled_at ??
      null;
    if (!raw) return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  })();
  const time = date
    ? date.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
    : null;

  const note =
    (data as Record<string, string | undefined>).inspection_note ||
    (data as Record<string, string | undefined>).agent_note ||
    "";

  return (
    <li>
      <Link
        href={`/obhliadky/${lead.id}`}
        className="block rounded-xl border-2 border-violet-200 bg-background p-4 hover:border-violet-400 hover:bg-violet-50/30 transition-all shadow-sm hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* LEFT — meno + telefón */}
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-lg leading-tight">
              {lead.name}
            </div>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 mt-1 text-sm font-bold text-emerald-700 hover:text-emerald-800 tabular-nums"
              >
                <Phone className="w-3.5 h-3.5" aria-hidden />
                {formatPhoneSK(lead.phone)}
              </a>
            )}
          </div>

          {/* RIGHT — čas */}
          {time && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Čas
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-violet-700">
                {time}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM — m², lokalita, typ podlahy */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          {data.plocha && (
            <span className="inline-flex items-center gap-1 font-bold text-foreground">
              <Ruler className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              {data.plocha} m²
            </span>
          )}
          {data.lokalita && (
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              {data.lokalita}
            </span>
          )}
          {data.typ_podlahy && (
            <span className="text-xs text-muted-foreground">
              🎨 {data.typ_podlahy}
            </span>
          )}
          {data.priestor && (
            <span className="text-xs text-muted-foreground">
              🏠 {data.priestor}
            </span>
          )}
        </div>

        {/* Poznámka od obchodníka (ak existuje) */}
        {note && (
          <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
            <StickyNote className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden />
            <div className="text-[12px] text-amber-900 leading-snug">
              <strong className="font-bold">Od obchodníka:</strong> {note}
            </div>
          </div>
        )}
      </Link>
    </li>
  );
}
