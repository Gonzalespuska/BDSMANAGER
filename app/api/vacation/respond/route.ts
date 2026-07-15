export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/vacation/respond
 *
 * Admin-only: schváli / odmietne pending dovolenku.
 *
 * Body: { request_id, action: 'approve'|'decline', decline_reason? }
 *
 * Na approve:
 *   • vacation_requests.status = approved
 *   • users.vacation_from = from_date, vacation_until = to_date
 *   • paused_until = to_date (aby existujúca auto-assign logika už user-a preskočila)
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "admin_only" },
      { status: 403 },
    );
  }

  let body: {
    request_id?: string;
    action?: "approve" | "decline";
    decline_reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { request_id, action } = body;
  if (!request_id || (action !== "approve" && action !== "decline")) {
    return NextResponse.json(
      { ok: false, error: "missing_or_invalid_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("vacation_requests")
    .select("id, user_id, from_date, to_date, status")
    .eq("id", request_id)
    .maybeSingle();
  if (!req) {
    return NextResponse.json(
      { ok: false, error: "request_not_found" },
      { status: 404 },
    );
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "already_responded", status: req.status },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  if (action === "approve") {
    const { error: upReq } = await admin
      .from("vacation_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: nowIso,
      })
      .eq("id", req.id);
    if (upReq) {
      return NextResponse.json(
        { ok: false, error: upReq.message },
        { status: 500 },
      );
    }

    // Nastav user.vacation_from/until + paused_until (aby ho auto-assign
    // ignorovala rovnakým mechanizmom ako self-pause).
    const pausedUntilIso = new Date(
      req.to_date + "T23:59:59.999Z",
    ).toISOString();
    await admin
      .from("users")
      .update({
        vacation_from: req.from_date,
        vacation_until: req.to_date,
        paused_until: pausedUntilIso,
      })
      .eq("id", req.user_id);

    return NextResponse.json({ ok: true, action: "approved" });
  }

  const declineReason = (body.decline_reason ?? "").slice(0, 500) || null;
  await admin
    .from("vacation_requests")
    .update({
      status: "declined",
      reviewed_by: user.id,
      reviewed_at: nowIso,
      decline_reason: declineReason,
    })
    .eq("id", req.id);

  return NextResponse.json({ ok: true, action: "declined" });
}
