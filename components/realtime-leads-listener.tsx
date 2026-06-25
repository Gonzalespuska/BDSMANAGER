"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Client component ktorý subscribe-ne Supabase Realtime channel pre `leads`
 * + `lead_activities` tabuľky.
 *
 * Pri akejkoľvek zmene (INSERT/UPDATE/DELETE) zavolá `router.refresh()` —
 * Next.js znova spustí server component, fetch-ne fresh dáta z DB, prerender.
 *
 * Used by /agent (a /admin v budúcnosti) na live updates bez F5.
 *
 * Vracia null — žiadne UI, len side effect. LiveIndicator komponenta
 * vedľa zobrazuje stav (subscribed / connecting / error).
 */
export function RealtimeLeadsListener({
  onStateChange,
}: {
  onStateChange?: (state: "connecting" | "live" | "error") => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    const supabase = createClient();
    onStateChange?.("connecting");

    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_activities" },
        () => {
          router.refresh();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onStateChange?.("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          onStateChange?.("error");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, onStateChange]);

  return null;
}
