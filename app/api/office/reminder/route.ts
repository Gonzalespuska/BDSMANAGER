export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * /api/office/reminder — správa pripomienok pre Office kalendár.
 *
 * GET  → list všetkých MOJICH aktívnych (nedismissed) + due dnes/predtým.
 *        Query ?all=1 → aj pripomienky do budúcnosti (kalendár view).
 * POST → { note, remind_date } → vytvorí novú pripomienku pre auth usera
 * PATCH → { id, dismissed?, note?, remind_date? } → update / dismiss
 * DELETE → ?id=<uuid> → mazať úplne (dismiss je preferovanejšie)
 */

const MAX_NOTE_LEN = 500;

async function requireAuth() {
  const me = await getCurrentAppUser();
  if (!me) {
    return { error: NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 }) };
  }
  return { user: me };
}

// ─── LIST ──────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const includeFuture = url.searchParams.get("all") === "1";
  const sb = createAdminClient();

  let q = sb
    .from("office_reminders")
    .select("id, note, remind_date, dismissed_at, created_at, updated_at, user_id")
    .eq("user_id", auth.user.id)
    .is("dismissed_at", null)
    .order("remind_date", { ascending: true });

  if (!includeFuture) {
    const today = new Date().toISOString().slice(0, 10);
    q = q.lte("remind_date", today);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reminders: data ?? [] });
}

// ─── CREATE ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { note?: string; remind_date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const note = (body.note ?? "").trim();
  const remindDate = (body.remind_date ?? "").trim();

  if (!note) {
    return NextResponse.json({ ok: false, error: "note_required" }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LEN) {
    return NextResponse.json({ ok: false, error: "note_too_long" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(remindDate)) {
    return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("office_reminders")
    .insert({
      user_id: auth.user.id,
      note,
      remind_date: remindDate,
    })
    .select("id, note, remind_date, dismissed_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reminder: data });
}

// ─── UPDATE / DISMISS ──────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: {
    id?: string;
    dismissed?: boolean;
    note?: string;
    remind_date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const sb = createAdminClient();

  // Overiť vlastníctvo (alebo admin)
  const { data: existing } = await sb
    .from("office_reminders")
    .select("id, user_id")
    .eq("id", body.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (existing.user_id !== auth.user.id && auth.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.dismissed === "boolean") {
    patch.dismissed_at = body.dismissed ? new Date().toISOString() : null;
  }
  if (typeof body.note === "string") {
    const n = body.note.trim();
    if (!n) {
      return NextResponse.json({ ok: false, error: "note_required" }, { status: 400 });
    }
    if (n.length > MAX_NOTE_LEN) {
      return NextResponse.json({ ok: false, error: "note_too_long" }, { status: 400 });
    }
    patch.note = n;
  }
  if (typeof body.remind_date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.remind_date)) {
      return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }
    patch.remind_date = body.remind_date;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("office_reminders")
    .update(patch)
    .eq("id", body.id)
    .select("id, note, remind_date, dismissed_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reminder: data });
}

// ─── DELETE ────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: existing } = await sb
    .from("office_reminders")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (existing.user_id !== auth.user.id && auth.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error } = await sb.from("office_reminders").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
