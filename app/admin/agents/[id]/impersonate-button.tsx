"use client";

import * as React from "react";
import { Eye, Loader2 } from "lucide-react";

/**
 * ImpersonateButton — admin klikne "Zobraziť ako Leo" a systém ho
 * prihlási očami Leo (per-user impersonation cez view_as_user_id
 * cookie). Redirect na dashboard toho user-a.
 */
export function ImpersonateButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [busy, setBusy] = React.useState(false);

  async function impersonate() {
    setBusy(true);
    try {
      const res = await fetch("/api/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };
      if (!json.ok || !json.redirect) {
        alert(`Chyba: ${json.error ?? "unknown"}`);
        setBusy(false);
        return;
      }
      // Hard nav aby SSR videl novú cookie
      window.location.href = json.redirect;
    } catch (e) {
      alert(`Chyba: ${e instanceof Error ? e.message : "network"}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={impersonate}
      disabled={busy}
      title={`Prihlásiť sa ako ${userName} — uvidíš presne to čo vidí on`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-violet-300 bg-violet-50 hover:bg-violet-100 hover:border-violet-500 text-violet-800 text-sm font-bold transition-all disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
      ) : (
        <Eye className="w-4 h-4" aria-hidden />
      )}
      Zobraziť ako {userName.split(" ")[0]}
    </button>
  );
}
