import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { loadChatHistory } from "@/lib/team-chat";
import { ChatRoom } from "./chat-room";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /agent/team — Tím chat (Discord-like single channel).
 *
 * Workload presunutý do /workload (admin-only), prístupný cez profile menu.
 */
export default async function TeamPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const initialMessages = await loadChatHistory();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-sky-500" aria-hidden />
          Tím chat
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Spýtaj sa kolegov, zdieľaj tipy. Vyhľadávaj kľúčové slovo v hornej lište.
        </p>
      </header>

      <ChatRoom
        meId={me.id}
        meRole={me.role}
        initialMessages={initialMessages}
      />
    </div>
  );
}
