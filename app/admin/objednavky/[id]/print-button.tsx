"use client";

import { Printer } from "lucide-react";

/**
 * Client-side tlačidlo pre window.print().
 * V RSC (server) sa nedá dať onClick na `<a>` (Next 14 hodí runtime error).
 */
export function PrintButton() {
  return (
    <a
      href="#print"
      onClick={(e) => {
        e.preventDefault();
        window.print();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm font-bold transition-colors shadow"
    >
      <Printer className="w-4 h-4" />
      Tlačiť / PDF
    </a>
  );
}
