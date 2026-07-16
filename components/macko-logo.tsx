"use client";

import * as React from "react";

/**
 * MackoLogo — malý macko maskot vľavo v hlavičke.
 *
 * User 2026-07-16: „bavili sme sa ze tu ma byt ten macko maskot".
 *
 * Priorita:
 *   1. /macko.png (drop tam vlastný obrázok)
 *   2. /macko.svg (fallback placeholder)
 *
 * Ak /macko.png neexistuje, onError automaticky prepne na /macko.svg —
 * `onError` event handler vyžaduje client component (nemôže byť v RSC).
 */
export function MackoLogo() {
  const [src, setSrc] = React.useState("/macko.png");
  return (
    <img
      src={src}
      alt="Macko"
      className="w-10 h-10 md:w-14 md:h-14 shrink-0 rounded-full object-cover"
      onError={() => {
        if (src !== "/macko.svg") setSrc("/macko.svg");
      }}
    />
  );
}
