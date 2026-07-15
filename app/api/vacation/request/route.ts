export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/vacation/request
 *
 * User 2026-07-15: „tam budu mat moznost vypytat si dovolenku od do
 * kde pride zas adminovi request do dovolenky request, kde im to admin
 * moze potvrdit bude tam od do a tym oficialne proste zo systemu ho
 * vyluci takze tak sa to bude robit aby mu v ten datum nedavalo robotu".
 *
 * Body: { from_date: "YYYY-MM-DD", to_date: "YYYY-MM-DD", reason?: string }
 *
 * Vytvorí `pending` žiadosť. Admin ju musí schváliť cez sticky bar.
 * Po schválení sa nastaví users.vacation_from/until — auto-assignment
 * cron worker takého usera preskočí a jeho nedotknuté leady presunie.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: { from_date?: string; to_date?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { from_date, to_date, reason } = body;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !from_date ||
    !to_date ||
    !isoDate.test(from_date) ||
    !isoDate.test(to_date)
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_dates" },
      { status: 400 },
    );
  }
  if (to_date < from_date) {
    return NextResponse.json(
      { ok: false, error: "to_before_from" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: inserted, error } = await admin
    .from("vacation_requests")
    .insert({
      user_id: user.id,
      from_date,
      to_date,
      reason: reason?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json(
      { ok: false, error: "insert_failed", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, request_id: inserted.id });
}

/** GET /api/vacation/request — vráti moje žiadosti (pending + posledné). */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", items: [] },
      { status: 401 },
    );
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("vacation_requests")
    .select("id, from_date, to_date, reason, status, requested_at, decline_reason")
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ ok: true, items: data ?? [] });
}
