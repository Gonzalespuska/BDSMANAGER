export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/lead/direct-assign
 *
 * User 2026-07-15: „ja som admin teraz, chapes takze tu musim mat ze
 * Priradit inemu Agentovi iba proste rozkaz".
 *
 * Admin priamo prepíše owner/inspection_by/realization_by bez potvrdenia
 * druhou stranou (iba admin, iba rozkaz). Nezakladá reassign_request.
 *
 * Body: { lead_id, to_user_id, role_scope: 'obchod'|'obhliadky'|'realizacie' }
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
    to_user_id?: string;
    role_scope?: "obchod" | "obhliadky" | "realizacie";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { lead_id, to_user_id } = body;
  const roleScope =
    body.role_scope === "obhliadky"
      ? "obhliadky"
      : body.role_scope === "realizacie"
        ? "realizacie"
        : "obchod";
  if (!lead_id || !to_user_id) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Validácia targetu (aktívny + správna role)
  const { data: target } = await admin
    .from("users")
    .select("id, name, role, active")
    .eq("id", to_user_id)
    .maybeSingle();
  if (!target || !target.active) {
    return NextResponse.json(
      { ok: false, error: "target_inactive" },
      { status: 400 },
    );
  }
  if (target.role !== roleScope && target.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "target_wrong_role", required: roleScope },
      { status: 400 },
    );
  }

  const updateCol =
    roleScope === "obhliadky"
      ? "inspection_by"
      : roleScope === "realizacie"
        ? "realization_by"
        : "assigned_to";

  const nowIso = new Date().toISOString();
  // stolen_at pre obchod scope — trigger notifikácie pre receivera
  // v bell (loadNotifications má reassigned_lead type).
  const previousOwnerCol = updateCol;
  const { data: leadBefore } = await admin
    .from("leads")
    .select(previousOwnerCol)
    .eq("id", lead_id)
    .maybeSingle();
  const prevOwner =
    leadBefore && (leadBefore as Record<string, unknown>)[previousOwnerCol];

  const updatePayload: Record<string, unknown> = {
    [updateCol]: to_user_id,
    last_activity_at: nowIso,
  };
  if (roleScope === "obchod") {
    updatePayload.stolen_at = nowIso;
    updatePayload.stolen_from = prevOwner ?? null;
  }
  const { data: updated, error } = await admin
    .from("leads")
    .update(updatePayload)
    .eq("id", lead_id)
    .select("id, name")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "lead_not_found" },
      { status: 404 },
    );
  }

  // Audit log
  try {
    await admin.from("lead_activities").insert({
      lead_id,
      user_id: user.id,
      type: "admin_direct_assign",
      data: {
        to_user_id,
        to_user_name: target.name,
        role_scope: roleScope,
      },
    });
  } catch (e) {
    console.warn("[direct-assign] activity log failed:", e);
  }

  return NextResponse.json({
    ok: true,
    lead_name: updated.name,
    to_user_name: target.name,
  });
}
