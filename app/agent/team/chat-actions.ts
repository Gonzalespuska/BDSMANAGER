"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import type { ChatMessage } from "@/lib/team-chat";
import { DEFAULT_ROOM_ID, searchChat } from "@/lib/team-chat";

/**
 * Server actions pre Tím chat — len authenticated useri (peter, admin, ...).
 */

export async function sendChatMessageAction(
  body: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") {
    return {
      ok: false,
      error: "dev fallback user — peter z DB nenájdený",
    };
  }
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "prázdna správa" };
  if (trimmed.length > 4000) {
    return { ok: false, error: "správa je príliš dlhá (max 4000)" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_messages")
    .insert({ user_id: user.id, body: trimmed, room_id: roomId })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, id: data.id };
}

export async function searchChatAction(
  keyword: string,
  roomId?: string,
): Promise<{ ok: true; results: ChatMessage[] } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const results = await searchChat(keyword, roomId);
  return { ok: true, results };
}

export async function deleteChatMessageAction(
  messageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user" };
  }

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("team_messages")
    .select("user_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: "not_found" };
  if (msg.user_id !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const { error } = await admin
    .from("team_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Vytvor novú roomku (each user can — RLS allows authenticated).
 * Pre rýchlosť používa fetch endpoint v UI (server actions sú v edge runtime
 * občas pomalé). Túto akciu necháme len ako záloha.
 */
export async function createRoomAction(
  title: string,
): Promise<{ ok: true; room_id: string } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user" };
  }
  const t = title.trim();
  if (!t) return { ok: false, error: "title required" };
  if (t.length > 120) return { ok: false, error: "title too long (max 120)" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_rooms")
    .insert({ title: t, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert" };
  return { ok: true, room_id: data.id };
}
