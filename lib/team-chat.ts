import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Team chat helpers — Discord-style multi-room chat pre obchodníkov + admina.
 *
 * Schema:
 *   - team_rooms: každý obchodák si môže vytvoriť roomku (`+ Nová roomka`).
 *     Default je "Všeobecná diskusia" (id 0000…001).
 *   - team_messages: každá správa patrí do jednej roomky cez room_id.
 *   - Bump trigger: nová správa → room.last_message_at = NOW(), takže rooms
 *     sa zoraďujú v sidebar zhora-dole podľa aktivity (najnovšia hore).
 *
 * Substring search (ILIKE) je room-scoped: hľadá v aktuálnej roomke len.
 */

export const DEFAULT_ROOM_ID = "00000000-0000-0000-0000-000000000001";

/** Prefix DM room title (viď /api/chat/dm/route.ts). */
export const DM_PREFIX = "🔒 DM:";

export type ChatMessage = {
  id: string;
  user_id: string;
  room_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  // Hydrated user fields (joined manually)
  user_name: string;
  user_email: string;
  user_role: "admin" | "obchod" | "obhliadky" | "realizacie";
};

export type ChatRoom = {
  id: string;
  title: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  last_message_at: string;
  message_count: number;
  /** True ak je to DM medzi 2 usermi. */
  is_dm: boolean;
  /** DM: meno druhého užívateľa (pre zobrazenie), null pri obyčajných roomkách. */
  peer_name: string | null;
  /** DM: id druhého užívateľa. */
  peer_id: string | null;
};

/**
 * Ak title matchuje DM_PREFIX, vytiahne [uidMin, uidMax]. Vráti null pre
 * obyčajné roomky.
 */
export function parseDmTitle(
  title: string,
): { uidMin: string; uidMax: string } | null {
  if (!title.startsWith(DM_PREFIX)) return null;
  const raw = title.slice(DM_PREFIX.length);
  const parts = raw.split(":");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(a) || !/^[0-9a-f-]{36}$/i.test(b)) return null;
  return { uidMin: a, uidMax: b };
}

const PAGE_SIZE = 100;

/**
 * Načíta zoznam aktívnych roomiek zoradených podľa last_message_at DESC.
 * Hydratuje meno tvorcu (z public.users).
 *
 * DM roomy: filtrujeme také kde ani jeden účastník = current user
 * (`currentUserId`). Pre DM roomy hydratujeme peer_name (meno druhého).
 */
export async function loadRooms(currentUserId?: string): Promise<ChatRoom[]> {
  const admin = createAdminClient();
  const { data: rooms, error } = await admin
    .from("team_rooms")
    .select("id, title, created_by, created_at, last_message_at")
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error || !rooms) {
    if (error) console.error("[chat] loadRooms failed:", error.message);
    return [];
  }
  if (rooms.length === 0) return [];

  // Filter DM roomy — iba také kde je current user účastník
  const visibleRooms = rooms.filter((r) => {
    const dm = parseDmTitle(r.title);
    if (!dm) return true; // obyčajná roomka — všetci vidia
    if (!currentUserId) return false; // bez user ID nikto nevidí DMs
    return dm.uidMin === currentUserId || dm.uidMax === currentUserId;
  });

  // Hydratuj mená creatorov + peers (pre DM roomy)
  const userIds = new Set<string>();
  for (const r of visibleRooms) {
    if (r.created_by) userIds.add(r.created_by);
    const dm = parseDmTitle(r.title);
    if (dm) {
      userIds.add(dm.uidMin);
      userIds.add(dm.uidMax);
    }
  }
  const users =
    userIds.size > 0
      ? (
          await admin
            .from("users")
            .select("id, name")
            .in("id", Array.from(userIds))
        ).data ?? []
      : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  // Hydratuj message counts (jedno query, batch)
  const counts: Record<string, number> = {};
  for (const r of visibleRooms) {
    const { count } = await admin
      .from("team_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", r.id)
      .is("deleted_at", null);
    counts[r.id] = count ?? 0;
  }

  return visibleRooms.map((r) => {
    const dm = parseDmTitle(r.title);
    let peerId: string | null = null;
    let peerName: string | null = null;
    if (dm && currentUserId) {
      peerId = dm.uidMin === currentUserId ? dm.uidMax : dm.uidMin;
      peerName = userMap.get(peerId) ?? "Neznámy";
    }
    return {
      id: r.id,
      title: r.title,
      created_by: r.created_by,
      created_by_name: r.created_by ? userMap.get(r.created_by) ?? null : null,
      created_at: r.created_at,
      last_message_at: r.last_message_at,
      message_count: counts[r.id] ?? 0,
      is_dm: !!dm,
      peer_id: peerId,
      peer_name: peerName,
    };
  });
}

export async function loadChatHistory(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<ChatMessage[]> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("team_messages")
    .select("id, user_id, room_id, body, created_at, edited_at")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error || !rows) {
    if (error) console.error("[chat] loadHistory failed:", error.message);
    return [];
  }
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: users } = await admin
    .from("users")
    .select("id, name, email, role")
    .in("id", userIds);
  const usersMap = new Map((users ?? []).map((u) => [u.id, u]));

  return rows
    .map((r): ChatMessage | null => {
      const u = usersMap.get(r.user_id);
      if (!u) return null;
      return {
        id: r.id,
        user_id: r.user_id,
        room_id: r.room_id,
        body: r.body,
        created_at: r.created_at,
        edited_at: r.edited_at,
        user_name: u.name,
        user_email: u.email,
        user_role: u.role as "admin" | "obchod" | "obhliadky" | "realizacie",
      };
    })
    .filter((m): m is ChatMessage => m !== null)
    .reverse(); // ascending order in UI
}

export async function searchChat(
  keyword: string,
  roomId?: string,
): Promise<ChatMessage[]> {
  const term = keyword.trim();
  if (!term) return [];

  // Substring search (case-insensitive) — ako v Discorde.
  const safe = term.replace(/[\\%_,*]/g, (m) => "\\" + m);
  const pattern = `*${safe}*`;

  const admin = createAdminClient();
  let q = admin
    .from("team_messages")
    .select("id, user_id, room_id, body, created_at, edited_at")
    .is("deleted_at", null)
    .ilike("body", pattern);
  if (roomId) q = q.eq("room_id", roomId);
  const { data: rows, error } = await q
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows) {
    if (error) console.error("[chat] search failed:", error.message);
    return [];
  }
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: users } = await admin
    .from("users")
    .select("id, name, email, role")
    .in("id", userIds);
  const usersMap = new Map((users ?? []).map((u) => [u.id, u]));

  return rows
    .map((r): ChatMessage | null => {
      const u = usersMap.get(r.user_id);
      if (!u) return null;
      return {
        id: r.id,
        user_id: r.user_id,
        room_id: r.room_id,
        body: r.body,
        created_at: r.created_at,
        edited_at: r.edited_at,
        user_name: u.name,
        user_email: u.email,
        user_role: u.role as "admin" | "obchod" | "obhliadky" | "realizacie",
      };
    })
    .filter((m): m is ChatMessage => m !== null);
}
