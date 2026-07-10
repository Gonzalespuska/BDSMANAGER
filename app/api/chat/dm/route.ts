export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/chat/dm — vráti alebo vytvorí 1-na-1 (Direct Message) roomku.
 *
 * Body: { peer_id: string (uuid) }
 * Response: { ok: true, room_id, title, is_new } | { ok: false, error }
 *
 * Konvencia: DM roomka má title formátu:
 *   "🔒 DM:<uuid_min>:<uuid_max>"
 *
 * Keďže team_rooms schéma nemá is_dm stĺpec, pár účastníkov je zakódovaný
 * priamo v titule (deterministicky zoradené uuid). V UI sa title
 * remapuje na meno druhého užívateľa.
 *
 * loadRooms() v lib/team-chat.ts by mal filtrovať DM roomy podľa toho či
 * je aktuálny user účastník (parsuje uuid z title).
 */

const DM_PREFIX = "🔒 DM:";

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.id === "dev-user") {
    return NextResponse.json(
      { ok: false, error: "dev fallback user" },
      { status: 400 },
    );
  }

  let body: { peer_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const peerId = (body.peer_id ?? "").trim();
  if (!peerId || !/^[0-9a-f-]{36}$/i.test(peerId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_peer_id" },
      { status: 400 },
    );
  }
  if (peerId === user.id) {
    return NextResponse.json(
      { ok: false, error: "cannot_dm_yourself" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Overiť peer existuje + je active
  const { data: peer, error: peerErr } = await admin
    .from("users")
    .select("id, name, email, role, active")
    .eq("id", peerId)
    .maybeSingle();
  if (peerErr || !peer || !peer.active) {
    return NextResponse.json(
      { ok: false, error: "peer_not_found_or_inactive" },
      { status: 404 },
    );
  }

  // Deterministické poradie UUID (min:max) — tak sa DM medzi A↔B a B↔A je JEDNA roomka
  const [uidMin, uidMax] = [user.id, peerId].sort();
  const dmKey = `${DM_PREFIX}${uidMin}:${uidMax}`;

  // Skús nájsť existujúcu
  const { data: existing } = await admin
    .from("team_rooms")
    .select("id, title, created_at, last_message_at")
    .eq("title", dmKey)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      room_id: existing.id,
      title: existing.title,
      peer: { id: peer.id, name: peer.name, role: peer.role },
      is_new: false,
    });
  }

  // Vytvor novú
  const nowIso = new Date().toISOString();
  const { data: created, error: insertErr } = await admin
    .from("team_rooms")
    .insert({
      title: dmKey,
      created_by: user.id,
      last_message_at: nowIso,
    })
    .select("id, title, created_at, last_message_at")
    .single();
  if (insertErr || !created) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    room_id: created.id,
    title: created.title,
    peer: { id: peer.id, name: peer.name, role: peer.role },
    is_new: true,
  });
}
