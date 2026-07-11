import { notFound, redirect } from "next/navigation";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChatHistory } from "@/lib/team-chat";
import { AppShell } from "@/components/app-shell";
import { loadNotifications } from "@/lib/notifications";

import { DmView } from "./dm-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DM_PREFIX = "🔒 DM:";
const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * /dm/[roomId] — samostatná Messenger-style stránka pre 1-na-1 chat.
 *
 * DM konvencia (viď /api/chat/dm/route.ts): team_rooms.title je
 *   `🔒 DM:<uuid_min>:<uuid_max>` — pár účastníkov zakódovaný v titule,
 *   pretože team_rooms schéma nemá is_dm/member_1_id/member_2_id.
 *
 * Prečo samostatná route (nie /agent/team?room=X):
 *   Tím chat sídli v /agent/team a mixuje všeobecné roomky (Všeobecná
 *   diskusia, projektové témy) s DM správami v sidebar-i. Obchodák keď
 *   klikne 💬 Napísať → chce priamo Messenger-style konverzáciu, nie
 *   preklopiť sa do Team chatu.
 */
export default async function DmPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { roomId } = await params;
  const sp = await searchParams;
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const sb = createAdminClient();

  const { data: room } = await sb
    .from("team_rooms")
    .select("id, title, created_by")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) notFound();

  const title = (room.title as string) ?? "";
  if (!title.startsWith(DM_PREFIX)) {
    // Nie je to DM — pošleme do Tím chat (všeobecná/projekt roomka)
    redirect(`/agent/team?room=${roomId}`);
  }

  const [uidMin, uidMax] = title.slice(DM_PREFIX.length).split(":");
  if (!UUID_RE.test(uidMin ?? "") || !UUID_RE.test(uidMax ?? "")) {
    // Nevalidný DM title — fallback do Tím chatu
    redirect(`/agent/team?room=${roomId}`);
  }

  // Overiť že som member (jeden z dvoch UUID)
  const isMember = me.id === uidMin || me.id === uidMax;
  if (!isMember && me.role !== "admin") {
    redirect("/agent/team");
  }

  const peerId = me.id === uidMin ? uidMax : uidMin;
  const { data: peer } = await sb
    .from("users")
    .select("id, name, email, role, avatar_url")
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
          name: (peer.name as string) ?? "Kolega",
          email: (peer.email as string) ?? "",
          phone: null, // users tabuľka nemá phone column (viď supabase/schema.sql)
          role: (peer.role as string) ?? "user",
          avatar_url: (peer.avatar_url as string | null) ?? null,
        }}
        initialMessages={messages}
        prefill={sp.prefill}
      />
    </AppShell>
  );
}
