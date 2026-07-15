export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/lead/manage
 *
 * Admin-only ovládanie leadu z /admin/leads karty:
 *   • action=set_status    → prepíše leads.status
 *   • action=delete        → hard-delete z DB (CASCADE aj activity + reassign req)
 *   • action=unassign      → assigned_to = NULL (bez notifikácie)
 *
 * Body: { lead_id, action, status?, hard? }
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
    lead_id?: string;
    action?: "set_status" | "delete" | "unassign";
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { lead_id, action } = body;
  if (!lead_id || !action) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  if (action === "set_status") {
    const allowed = new Set([
      "new",
      "phone_revealed",
      "no_answer",
      "scheduled",
      "interested",
      "not_interested",
      "quote_sent",
      "needs_inspection",
      "inspected",
      "in_realization",
      "won",
      "lost",
      "archived",
    ]);
    if (!body.status || !allowed.has(body.status)) {
      return NextResponse.json(
        { ok: false, error: "invalid_status" },
        { status: 400 },
      );
    }
    const { error } = await admin
      .from("leads")
      .update({ status: body.status, last_activity_at: nowIso })
      .eq("id", lead_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    try {
      await admin.from("lead_activities").insert({
        lead_id,
        user_id: user.id,
        type: "admin_status_change",
        data: { new_status: body.status, at: nowIso },
      });
    } catch {
      /* audit best-effort */
    }
    return NextResponse.json({ ok: true, action: "set_status" });
  }

  if (action === "unassign") {
    const { error } = await admin
      .from("leads")
      .update({ assigned_to: null, last_activity_at: nowIso })
      .eq("id", lead_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, action: "unassign" });
  }

  if (action === "delete") {
    // Cascade: activity/reassign_req FK sú ON DELETE CASCADE.
    const { error } = await admin.from("leads").delete().eq("id", lead_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, action: "delete" });
  }

  return NextResponse.json(
    { ok: false, error: "unknown_action" },
    { status: 400 },
  );
}
