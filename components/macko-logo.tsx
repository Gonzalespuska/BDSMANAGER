"use client";

import * as React from "react";
import Link from "next/link";

/**
 * MackoLogo — macko maskot vľavo v hlavičke + refresh animácia.
 *
 * User 2026-07-16: „ked dam refresh alebo stlacim na logo cize da refresh
 * nech sa ta hlava macka zacne rotovat a posuvat a zvacsovat smerom ku mne
 * na monitor a potom zas sa to vrati naspat taky efekt ale cely prebehne
 * za pol sekundy".
 *
 * Animácia:
 *   - Auto-play pri mount (page load / F5 refresh)
 *   - Klik na macko → nová animácia + hard reload (funguje ako refresh)
 *   - 500 ms: scale 1 → 1.35 → 1 + rotate 0° → 360°
 *
 * Priorita obrázka:
 *   1. /macko.png (drop tam vlastný obrázok)
 *   2. /macko.svg (fallback placeholder)
 */
export function MackoLogo({ homeHref }: { homeHref: string }) {
  const [src, setSrc] = React.useState("/macko.png");
  // Key ktorý sa mení pri klik-nutí → React remountne <img> → animácia fire.
  const [animKey, setAnimKey] = React.useState(0);

  return (
    <Link
      href={homeHref}
      onClick={() => {
        setAnimKey((k) => k + 1);
      }}
      className="shrink-0 relative"
      title="Domov (klik = refresh)"
    >
      <img
        key={animKey}
        src={src}
        alt=""
        aria-hidden
        className="w-10 h-10 md:w-14 md:h-14 rounded-full object-cover macko-refresh-anim"
        onError={() => {
          if (src !== "/macko.svg") setSrc("/macko.svg");
        }}
      />
      {/* Inline animation — nie je v globals.css aby nekonfliktovala. */}
      <style jsx>{`
        .macko-refresh-anim {
          animation: mackoRefresh 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 1;
          transform-origin: center;
          will-change: transform;
        }
        @keyframes mackoRefresh {
          0% {
            transform: scale(1) rotate(0deg);
          }
          50% {
            transform: scale(1.35) rotate(180deg);
          }
          100% {
            transform: scale(1) rotate(360deg);
          }
        }
      `}</style>
    </Link>
  );
}
