"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm font-bold transition-colors shadow"
    >
      <Printer className="w-4 h-4" />
      Tlačiť / PDF
    </button>
  );
}
