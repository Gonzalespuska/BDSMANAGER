"use client";

import * as React from "react";

import { LiveIndicator, type LiveState } from "./live-indicator";
import { RealtimeLeadsListener } from "./realtime-leads-listener";

/**
 * Client wrapper okolo agent dashboardu.
 *
 * Spája Supabase Realtime subscription (RealtimeLeadsListener) s vizuálnym
 * indikátorom (LiveIndicator) cez zdielaný state.
 *
 * Použitie v server component (agent/page.tsx):
 *   <AgentLiveWrapper>
 *     <h1>Leady na volanie</h1>
 *     ...
 *   </AgentLiveWrapper>
 */
export function AgentLiveWrapper({ children }: { children: React.ReactNode }) {
  const [liveState, setLiveState] = React.useState<LiveState>("connecting");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end -mb-2">
        <LiveIndicator state={liveState} />
      </div>
      <RealtimeLeadsListener onStateChange={setLiveState} />
      {children}
    </div>
  );
}
