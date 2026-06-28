export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/chat/room — vytvor novú chat roomku (obchodník/admin).
 * Body: { title: string }
 * Response: { ok: true, room_id, title } | { ok: false, error }
 */
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

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "missing_title" },
      { status: 400 },
    );
  }
  if (title.length > 120) {
    return NextResponse.json(
      { ok: false, error: "title_too_long" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("team_rooms")
      .insert({
        title,
        created_by: user.id,
        last_message_at: nowIso,
      })
      .select("id, title, created_at, last_message_at")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "insert_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
