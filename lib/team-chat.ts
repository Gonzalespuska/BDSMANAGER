import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Team chat helpers — Discord-like single channel pre obchodníkov + admina.
 *
 * Fulltext search:
 *   - PG GIN index na to_tsvector('simple', body) — funguje pre SK aj EN keywords
 *     (simple lang = nepoužíva stemming, len lower-case + tokenize, čo je pre
 *     krátke chat keywordy dobré default — neperformuje stem na "telefón" → "telefon")
 *   - Query syntax: plainto_tsquery('simple', $1) — bezpečné voči injection
 */

export type ChatMessage = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  // Hydrated user fields (joined manually)
  user_name: string;
  user_email: string;
  user_role: "admin" | "user";
};

const PAGE_SIZE = 100;

export async function loadChatHistory(): Promise<ChatMessage[]> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("team_messages")
    .select("id, user_id, body, created_at, edited_at")
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
        body: r.body,
        created_at: r.created_at,
        edited_at: r.edited_at,
        user_name: u.name,
        user_email: u.email,
        user_role: u.role as "admin" | "user",
      };
    })
    .filter((m): m is ChatMessage => m !== null)
    .reverse(); // ascending order in UI
}

export async function searchChat(keyword: string): Promise<ChatMessage[]> {
  const term = keyword.trim();
  if (!term) return [];

  const admin = createAdminClient();
  // textSearch on PostgREST → uses to_tsvector match
  const { data: rows, error } = await admin
    .from("team_messages")
    .select("id, user_id, body, created_at, edited_at")
    .is("deleted_at", null)
    .textSearch("body", term, { config: "simple", type: "plain" })
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
        body: r.body,
        created_at: r.created_at,
        edited_at: r.edited_at,
        user_name: u.name,
        user_email: u.email,
        user_role: u.role as "admin" | "user",
      };
    })
    .filter((m): m is ChatMessage => m !== null);
}
