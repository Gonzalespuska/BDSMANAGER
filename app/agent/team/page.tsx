import { redirect } from "next/navigation";
import { Phone, Users } from "lucide-react";

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

      <div className="rounded-2xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 px-4 py-3 flex items-start gap-3 text-sm">
        <Phone className="w-5 h-5 text-sky-600 dark:text-sky-300 mt-0.5 shrink-0" aria-hidden />
        <div className="text-sky-900 dark:text-sky-200">
          <strong>Ak sa ti problém nezodpovedal,</strong> kontaktuj{" "}
          <strong>Peťa Nogu</strong> —{" "}
          <a
            href="tel:+421915996831"
            className="font-mono font-bold underline decoration-dotted hover:text-sky-700 dark:hover:text-sky-100"
          >
            0915 996 831
          </a>
        </div>
      </div>

      <ChatRoom
        meId={me.id}
        meRole={me.role}
        initialMessages={initialMessages}
      />
    </div>
  );
}
