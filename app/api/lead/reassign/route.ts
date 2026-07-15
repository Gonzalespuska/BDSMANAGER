export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/reassign
 *
 * User 2026-07-15: „ak leo chce poslat elovi lead neajky mu da request
 * a napise ktory lead mu prideluje... a naopak ak elo chce requestnut
 * aby mu pridelil leo lead od ADAMA NEMCA tak da request".
 *
 * Body: { lead_id, to_user_id, reason?, kind: 'push' | 'pull' }
 *
 * PUSH (dar):
 *   • requestor = súčasný owner leadu (from_user_id)
 *   • target = to_user_id (musí to prijať)
 *   • Admin môže push-nuť cudzí lead → admin behaviour zachovaný.
 *
 * PULL (prosba):
 *   • requestor = to_user_id (ten kto chce lead získať)
 *   • target = súčasný owner (from_user_id, musí to prijať)
 *   • Iba obchod / admin môže volať.
 *
 * Vytvorí sa žiadosť v `lead_reassign_requests`. Cieľ (kto má
 * odsúhlasiť) uvidí sticky top-right kartu + zvukový ding.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "role_denied" },
      { status: 403 },
    );
  }

  let body: {
    lead_id?: string;
    to_user_id?: string;
    reason?: string;
    kind?: "push" | "pull";
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

  const kind = body.kind === "pull" ? "pull" : "push";
  // role_scope: aká úloha sa presúva (default 'obchod' pre back-compat)
  //   obchod    → leads.assigned_to
  //   obhliadky → leads.inspection_by
  //   realizacie→ leads.realization_by
  const roleScope =
    body.role_scope === "obhliadky"
      ? "obhliadky"
      : body.role_scope === "realizacie"
        ? "realizacie"
        : "obchod";
  const { lead_id, reason } = body;
  const to_user_id =
    kind === "pull" ? (body.to_user_id ?? user.id) : body.to_user_id;
  if (!lead_id || !to_user_id) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("users")
    .select("id, role, active, name")
    .eq("id", to_user_id)
    .maybeSingle();
  if (!target || !target.active) {
    return NextResponse.json(
      { ok: false, error: "target_inactive" },
      { status: 400 },
    );
  }
  // Target role musí sedieť s role_scope (obchod → obchod, obhliadky → obhliadky, atď.).
  // Admin je fallback all-mighty (môže dostať/ponúknuť čokoľvek).
  const requiredRole = roleScope; // 'obchod' | 'obhliadky' | 'realizacie'
  if (target.role !== requiredRole && target.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "target_wrong_role", required: requiredRole },
      { status: 400 },
    );
  }

  const { data: lead } = await admin
    .from("leads")
    .select("id, assigned_to, inspection_by, realization_by, name")
    .eq("id", lead_id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "lead_not_found" },
      { status: 404 },
    );
  }
  const currentOwner =
    roleScope === "obhliadky"
      ? (lead.inspection_by as string | null)
      : roleScope === "realizacie"
        ? (lead.realization_by as string | null)
        : (lead.assigned_to as string | null);
  if (currentOwner === to_user_id) {
    return NextResponse.json(
      { ok: false, error: "already_assigned_to_target" },
      { status: 400 },
    );
  }

  // AUTORIZÁCIA — kto smie kaký kind vytvoriť:
  if (kind === "push") {
    // Push = ponúkam SVOJU úlohu. Musím byť owner (admin môže preskočiť).
    if (user.role !== "admin" && currentOwner !== user.id) {
      return NextResponse.json(
        { ok: false, error: "push_only_by_owner" },
        { status: 403 },
      );
    }
  } else {
    // Pull = prosím o cudziu úlohu.
    if (to_user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "pull_must_target_self" },
        { status: 403 },
      );
    }
    if (!currentOwner) {
      return NextResponse.json(
        { ok: false, error: "pull_lead_unassigned" },
        { status: 400 },
      );
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("lead_reassign_requests")
    .insert({
      lead_id,
      from_user_id: currentOwner,
      to_user_id,
      requested_by: user.id,
      reason: reason ?? null,
      status: "pending",
      kind,
      role_scope: roleScope,
    })
    .select("id")
    .single();
  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { ok: false, error: "already_pending" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "insert_failed", message: insertErr.message },
      { status: 500 },
    );
  }

  try {
    await admin.from("lead_activities").insert({
      lead_id,
      user_id: user.id,
      type: kind === "pull" ? "pull_requested" : "reassign_requested",
      data: {
        to_user_id,
        to_user_name: target.name,
        from_user_id: currentOwner,
        reason: reason ?? null,
        request_id: inserted.id,
        kind,
        role_scope: roleScope,
      },
    });
  } catch (e) {
    console.warn("[lead/reassign] activity log failed:", e);
  }

  return NextResponse.json({
    ok: true,
    request_id: inserted.id,
    to_user_name: target.name,
    kind,
  });
}
