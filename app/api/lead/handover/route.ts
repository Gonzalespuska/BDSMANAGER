import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/lead/handover
 *
 * Body:
 *   { lead_id, target_user_id, mode: "inspection" | "realization", note? }
 *
 * Nahradzuje Server Actions handoverToInspectionAction /
 * handoverToRealizationAction — Server Actions v Cloudflare Pages
 * edge runtime nie su spolahlive (často vracaju undefined kvoli
 * revalidatePath ci ineho edge-runtime quirk).
 *
 * REST endpoint je jednoduchsi, testovatelnejsi, a garantuje ze
 * client dostane odpoved (aspon status code + telo).
 */
export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_wrong_role" },
      { status: 403 },
    );
  }

  let body: {
    lead_id?: string;
    target_user_id?: string;
    mode?: "inspection" | "realization";
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { lead_id, target_user_id, mode, note } = body;
  if (!lead_id || !target_user_id || !mode) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  if (mode !== "inspection" && mode !== "realization") {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }

  try {
    // Používame admin client — obchádzame RLS. Ownership check robíme sami.
    const sb = createAdminClient();

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("assigned_to, status")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr) {
      console.error("[handover] leadErr:", leadErr);
      return NextResponse.json(
        { ok: false, error: `db: ${leadErr.message}` },
        { status: 500 },
      );
    }
    if (!lead) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }
    if (lead.assigned_to !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden_not_your_lead" },
        { status: 403 },
      );
    }

    // Overiť target user role
    const expectedRole = mode === "inspection" ? "obhliadky" : "realizacie";
    const { data: target, error: targetErr } = await sb
      .from("users")
      .select("id, role")
      .eq("id", target_user_id)
      .maybeSingle();
    if (targetErr) {
      console.error("[handover] targetErr:", targetErr);
      return NextResponse.json(
        { ok: false, error: `db: ${targetErr.message}` },
        { status: 500 },
      );
    }
    if (!target) {
      return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
    }
    if (target.role !== expectedRole) {
      return NextResponse.json(
        {
          ok: false,
          error: `target_wrong_role: expected ${expectedRole}, got ${target.role}`,
        },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();

    // Update lead
    const updatePayload =
      mode === "inspection"
        ? {
            status: "needs_inspection",
            inspection_by: target_user_id,
            inspection_at: nowIso,
            last_activity_at: nowIso,
          }
        : {
            status: "in_realization",
            realization_by: target_user_id,
            realization_at: nowIso,
            last_activity_at: nowIso,
          };
    const { error: updErr } = await sb
      .from("leads")
      .update(updatePayload)
      .eq("id", lead_id);
    if (updErr) {
      console.error("[handover] updErr:", updErr);
      return NextResponse.json(
        { ok: false, error: `db_update: ${updErr.message}` },
        { status: 500 },
      );
    }

    // Activity log (best-effort)
    const activityType =
      mode === "inspection"
        ? "handed_over_to_inspection"
        : "handed_over_to_realization";
    const activityData =
      mode === "inspection"
        ? { inspector_id: target_user_id, note: note ?? null }
        : { realization_by: target_user_id, note: note ?? null };
    const { error: actErr } = await sb.from("lead_activities").insert({
      lead_id,
      user_id: user.id,
      type: activityType,
      data: activityData,
    });
    if (actErr) {
      console.error("[handover] activity insert failed:", actErr);
      // Nie fatal
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[handover] EXCEPTION:", e);
    return NextResponse.json(
      {
        ok: false,
        error: `server_exception: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 500 },
    );
  }
}
