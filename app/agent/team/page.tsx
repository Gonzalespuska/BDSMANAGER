import { redirect } from "next/navigation";
import { Phone, Users } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { DEFAULT_ROOM_ID, loadChatHistory, loadRooms } from "@/lib/team-chat";
import { ChatRoom } from "./chat-room";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /agent/team — Tím chat (Discord-style multi-room).
 *
 * Layout: kompaktný header (1 riadok title+phone callout), pod ním chat
 * ktorý vyplní celý zvyšný viewport (calc minus header chrome).
 *
 * Špecificky na 16" notebookoch (~1100px viewport height) — pôvodné
 * `h-[75vh]` na chate dávalo iba ~830px ale nad ním header zožral ~330px
 * a pod chatom bola 100px biela plocha. Teraz fit-on-screen.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const requestedRoom = typeof sp.room === "string" ? sp.room : null;

  // Načítaj rooms najprv aby sme vedeli overiť či ?room=<id> je platný
  const rooms = await loadRooms(me.id);

  // Ak URL má ?room=<id> a je v našich rooms (t.j. má na to prístup), otvor
  // ho hneď — inak fallback na DEFAULT_ROOM_ID (Všeobecná diskusia).
  const openRoomId =
    requestedRoom && rooms.some((r) => r.id === requestedRoom)
      ? requestedRoom
      : DEFAULT_ROOM_ID;

  const initialMessages = await loadChatHistory(openRoomId);

  return (
    <div className="flex flex-col gap-2 md:gap-3 h-[calc(100vh-240px)] min-h-[520px]">
      {/* Kompaktný header — title + subtitle + phone callout všetko inline */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-sky-500" aria-hidden />
            Tím chat
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Spýtaj sa kolegov, zdieľaj tipy. Vytvor si roomku pre konkrétny problém.
          </p>
        </div>

        {/* Phone callout — compact single-line pill vpravo */}
        <a
          href="tel:+421915996831"
          className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 dark:bg-sky-950/30 px-3 py-1.5 text-xs md:text-sm text-sky-900 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
        >
          <Phone className="w-4 h-4 text-sky-600 dark:text-sky-300" aria-hidden />
          <span>
            Nezodpovedal? Volaj <strong>Peťa Nogu</strong> —{" "}
            <span className="font-mono font-bold underline decoration-dotted">
              0915 996 831
            </span>
          </span>
        </a>
      </div>

      {/* Chat container vyplní zvyšok viewportu */}
      <div className="flex-1 min-h-0">
        <ChatRoom
          meId={me.id}
          meRole={me.role}
          initialRooms={rooms}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  );
}
