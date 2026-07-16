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
 * Priorita obrázka:
 *   1. /macko.png (drop tam vlastný obrázok)
 *   2. /macko.svg (fallback placeholder)
 *
 * Detekciu robíme cez preload Image() namiesto onError (onError bol
 * nespoľahlivý kvôli key={} remount race).
 */
export function MackoLogo({ homeHref }: { homeHref: string }) {
  const [src, setSrc] = React.useState<string>("/macko.svg");
  const [animKey, setAnimKey] = React.useState(0);

  // Skús načítať macko.png — ak existuje, prepni sa naň. Inak zostaň na svg.
  React.useEffect(() => {
    const test = new Image();
    test.onload = () => {
      if (test.naturalWidth > 0) setSrc("/macko.png");
    };
    test.src = "/macko.png";
  }, []);

  return (
    <Link
      href={homeHref}
      onClick={() => setAnimKey((k) => k + 1)}
      className="shrink-0 relative"
      title="Domov (klik = refresh)"
    >
      <img
        key={animKey}
        src={src}
        alt=""
        aria-hidden
        className="w-10 h-10 md:w-14 md:h-14 rounded-full object-cover macko-refresh-anim"
      />
      <style jsx>{`
        .macko-refresh-anim {
          animation: mackoRefresh 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 1;
          transform-origin: center;
          will-change: transform;
        }
        @keyframes mackoRefresh {
          0% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.35) rotate(180deg); }
          100% { transform: scale(1) rotate(360deg); }
        }
      `}</style>
    </Link>
  );
}
