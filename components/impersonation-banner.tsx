"use client";

import * as React from "react";
import { Eye, X } from "lucide-react";

/**
 * ImpersonationBanner — top-of-page pásik keď admin je prezerá ako
 * konkrétny user. Klik "Späť na Admin" clearne cookie a reloadne.
 */
export function ImpersonationBanner({ userName }: { userName: string }) {
  const [busy, setBusy] = React.useState(false);

  async function stop() {
    setBusy(true);
    try {
      const res = await fetch("/api/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "clear" }),
      });
      const json = (await res.json()) as { ok?: boolean; redirect?: string };
      if (json.ok && json.redirect) {
        window.location.href = json.redirect;
      } else {
        window.location.href = "/admin";
      }
    } catch {
      window.location.href = "/admin";
    }
  }

  // User 2026-07-14: „nech ked kukas ako niekto je to sticky ten bar
  // ze aj ked scrollujem ho vidim". Sticky správanie zabezpečuje parent
  // wrapper v app-shell.tsx (banner + dev + header ako jeden celok).
  return (
    <div className="bg-violet-600 text-white text-xs md:text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3 shadow-lg">
      <Eye className="w-4 h-4" aria-hidden />
      <span>
        Prezeráš ako <strong>{userName}</strong> — vidíš presne to čo on
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="ml-1 inline-flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
      >
        <X className="w-3 h-3" aria-hidden />
        Späť na Admin
      </button>
    </div>
  );
}
