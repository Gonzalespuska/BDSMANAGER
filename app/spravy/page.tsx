import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { loadNotifications } from "@/lib/notifications";
import { loadRooms, DEFAULT_ROOM_ID } from "@/lib/team-chat";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  SpravyClient,
  type Colleague,
  type DmRoom,
  type GroupRoom,
} from "./spravy-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /spravy — Messenger-style hub.
 *
 * Sekcie:
 *   • Skupiny — "🏢 Tím" (obchod + realizacie + admin, obhliadkárov nie)
 *   • Konverzácie — 1-na-1 DM roomky
 *   • Search bar hore — filtruje oboje
 *   • "+" tlačidlo → picker so všetkými aktívnymi kolegami
 *     (search, klik → vytvorí DM → naviguje na /dm/[id])
 */
export default async function SpravyPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const sb = createAdminClient();

  // 1) Kolegovia (aktívni, bez mňa) — pre picker
  const { data: colleaguesRaw } = await sb
    .from("users")
    .select("id, name, email, role, avatar_url")
    .eq("active", true)
    .neq("id", me.id)
    .order("name");
  const colleagues: Colleague[] = (colleaguesRaw ?? []).map((u) => ({
    id: u.id as string,
    name: (u.name as string) ?? "",
    email: (u.email as string) ?? "",
    role: (u.role as string) ?? "user",
    avatar_url: (u.avatar_url as string | null) ?? null,
  }));

  // 2) DM roomky
  const rooms = await loadRooms(me.id);
  const dmRoomsRaw = rooms.filter((r) => r.is_dm);

  const peerIds = Array.from(
    new Set(dmRoomsRaw.map((r) => r.peer_id).filter(Boolean) as string[]),
  );
  const peerMeta = new Map<
    string,
    { role: string; avatar_url: string | null }
  >();
  if (peerIds.length > 0) {
    const { data: peers } = await sb
      .from("users")
      .select("id, role, avatar_url")
      .in("id", peerIds);
    for (const p of peers ?? []) {
      peerMeta.set(p.id as string, {
        role: (p.role as string) ?? "user",
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const lastMsgMap = new Map<string, { body: string; created_at: string }>();
  for (const r of dmRoomsRaw) {
    const { data: msg } = await sb
      .from("team_messages")
      .select("body, created_at")
      .eq("room_id", r.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (msg) {
      lastMsgMap.set(r.id, {
        body: (msg.body as string) ?? "",
        created_at: (msg.created_at as string) ?? "",
      });
    }
  }

  const dmRooms: DmRoom[] = dmRoomsRaw.map((r) => {
    const meta = r.peer_id ? peerMeta.get(r.peer_id) : null;
    const last = lastMsgMap.get(r.id);
    return {
      id: r.id,
      peer_id: r.peer_id ?? "",
      peer_name: r.peer_name ?? "Kolega",
      peer_role: meta?.role ?? "user",
      peer_avatar_url: meta?.avatar_url ?? null,
      last_body: last?.body ?? null,
      last_ts:
        last?.created_at ?? (r.last_message_at as string | null) ?? null,
    };
  });

  // 3) Skupiny — "🏢 Tím" (default general room)
  //    Členovia: admin + obchod + realizacie (obhliadkárov nie — zámerne
  //    ich nezaťažujeme predajno-realizačnou komunikáciou).
  const canSeeTeamChat = ["admin", "obchod", "realizacie"].includes(
    me.role as string,
  );
  const groupRooms: GroupRoom[] = [];
  if (canSeeTeamChat) {
    const { data: teamLast } = await sb
      .from("team_messages")
      .select("body, created_at")
      .eq("room_id", DEFAULT_ROOM_ID)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count: memberCount } = await sb
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("role", ["admin", "obchod", "realizacie"]);
    groupRooms.push({
      id: DEFAULT_ROOM_ID,
      title: "Tím",
      emoji: "🏢",
      description: "Obchodáci + realizátori + admin",
      member_count: memberCount ?? 0,
      last_body: (teamLast?.body as string | null) ?? null,
      last_ts: (teamLast?.created_at as string | null) ?? null,
    });
  }

  const notifications = await loadNotifications(me.id).catch(() => []);
  const selfPaused = me.capacity === 0;

  return (
    <AppShell user={me} selfPaused={selfPaused} notifications={notifications}>
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-sky-500" aria-hidden />
            Správy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Konverzácie s kolegami. História správ zostáva.
          </p>
        </header>

        <SpravyClient
          colleagues={colleagues}
          dmRooms={dmRooms}
          groupRooms={groupRooms}
        />
      </div>
    </AppShell>
  );
}
