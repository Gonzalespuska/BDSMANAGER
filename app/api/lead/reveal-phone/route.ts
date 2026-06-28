export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/lead/reveal-phone
 *
 * Reveal phone na lead karte. Nahrádza pôvodný server action
 * `revealPhoneAction` ktorý mal občasné problémy v edge runtime
 * (server action stream vracia undefined → t.ok TypeError).
 *
 * Body: { lead_id: string }
 * Response: { ok: true } | { ok: false, error }
 */
export async function POST(request: NextRequest) {
  let body: { lead_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body.lead_id) {
    return NextResponse.json(
      { ok: false, error: "missing_lead_id" },
      { status: 400 },
    );
  }

  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // Načítaj lead pre SLA vyhodnotenie + ownership check
    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("id, sla_deadline, sla_status, phone_revealed_at, assigned_to")
      .eq("id", body.lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }

    // OWNERSHIP: lead je môj alebo som admin alebo je unassigned (claim flow)
    if (
      lead.assigned_to &&
      lead.assigned_to !== user.id &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        { ok: false, error: "forbidden_not_your_lead" },
        { status: 403 },
      );
    }

    // Ak už bol odhalený, no-op (idempotent)
    if (lead.phone_revealed_at) {
      return NextResponse.json({ ok: true, mode: "already_revealed" });
    }

    // SLA: met ak NOW <= deadline, inak breached
    let newSlaStatus = lead.sla_status;
    if (lead.sla_status === "pending" && lead.sla_deadline) {
      newSlaStatus = now <= new Date(lead.sla_deadline) ? "met" : "breached";
    }

    const { error: updateError } = await admin
      .from("leads")
      .update({
        phone_revealed_at: nowIso,
        phone_revealed_by: user.id,
        sla_status: newSlaStatus,
        last_activity_at: nowIso,
        first_contact_at: nowIso,
      })
      .eq("id", body.lead_id);

    if (updateError) {
      console.error("[reveal-phone] update failed:", updateError);
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 },
      );
    }

    // Fire-and-forget audit log
    admin
      .from("lead_activities")
      .insert({
        lead_id: body.lead_id,
        user_id: user.id,
        type: "phone_revealed",
        data: {
          sla_status: newSlaStatus,
          sla_deadline: lead.sla_deadline,
        },
      })
      .then(() => {})
      .catch((e) => console.warn("[reveal-phone] audit log failed:", e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reveal-phone] exception:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
