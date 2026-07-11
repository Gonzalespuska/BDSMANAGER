import { notFound, redirect } from "next/navigation";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChatHistory } from "@/lib/team-chat";
import { AppShell } from "@/components/app-shell";
import { loadNotifications } from "@/lib/notifications";

import { DmView } from "./dm-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /dm/[roomId] — samostatná Messenger-style stránka pre 1-na-1 chat.
 *
 * Prečo samostatná route:
 *   Tím chat (/agent/team) mixuje všeobecné roomky (Všeobecná diskusia,
 *   projektové témy) s osobnými správami. Obchodák/obhliadkár keď chce
 *   napísať kolegom (napr. otázka k obhliadke), potreboval ísť do
 *   Tím chat, nájsť správnu DM roomku v sidebar-i, klik ...
 *
 *   Teraz: klik na 💬 Napísať → priamo sa otvorí čistá messenger stránka
 *   s peer avatarom hore, telefónom, správami dole, input na spodku.
 *   Ako by si otvoril Messenger konverzáciu.
 */
export default async function DmPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const sb = createAdminClient();

  // Načítaj info o roomke — musí byť DM a musí ma zahŕňať
  const { data: room } = await sb
    .from("team_rooms")
    .select("id, title, created_by, is_dm, member_1_id, member_2_id")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) notFound();
  if (!room.is_dm) {
    // Nie je to DM — pošleme do Tím chat
    redirect(`/agent/team?room=${roomId}`);
  }

  // Overiť že som member
  const isMember = room.member_1_id === me.id || room.member_2_id === me.id;
  if (!isMember && me.role !== "admin") {
    redirect("/agent/team");
  }

  const peerId = room.member_1_id === me.id ? room.member_2_id : room.member_1_id;
  const { data: peer } = await sb
    .from("users")
    .select("id, name, email, phone, role, avatar_url")
    .eq("id", peerId)
    .maybeSingle();

  if (!peer) notFound();

  const messages = await loadChatHistory(roomId);

  const notifications = await loadNotifications(me.id).catch(() => []);
  const selfPaused = me.capacity === 0;

  return (
    <AppShell user={me} selfPaused={selfPaused} notifications={notifications} wide>
      <DmView
        roomId={roomId}
        meId={me.id}
        meName={me.name}
        peer={{
          id: peer.id as string,
          name: peer.name as string,
          email: peer.email as string,
          phone: (peer.phone as string | null) ?? null,
          role: peer.role as string,
          avatar_url: (peer.avatar_url as string | null) ?? null,
        }}
        initialMessages={messages}
      />
    </AppShell>
  );
}
