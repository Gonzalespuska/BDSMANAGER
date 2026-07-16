export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/reassign-request/respond
 *
 * Cielený obchodák prijme alebo odmietne žiadosť o preradenie leadu.
 *
 * Body:
 *   { request_id: string, action: "accept" | "decline", decline_reason?: string }
 *
 * Accept:
 *   • leads.assigned_to = to_user_id (prepíše sa aj open lead — user OK)
 *   • request.status = 'accepted', responded_at = now()
 *   • activity log 'reassign_accepted'
 *
 * Decline:
 *   • request.status = 'declined', decline_reason ulozene
 *   • assigned_to sa NEmení
 *   • activity log 'reassign_declined'
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: {
    request_id?: string;
    action?: "accept" | "decline";
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
  if (!request_id || (action !== "accept" && action !== "decline")) {
    return NextResponse.json(
      { ok: false, error: "missing_or_invalid_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Načítaj aj kind + role_scope (migrácie 44 + 45).
  let req: {
    id: string;
    lead_id: string;
    to_user_id: string;
    from_user_id: string | null;
    requested_by: string;
    status: string;
    kind: "push" | "pull";
    role_scope: "obchod" | "obhliadky" | "realizacie";
  } | null = null;
  {
    const { data, error } = await admin
      .from("lead_reassign_requests")
      .select(
        "id, lead_id, to_user_id, from_user_id, requested_by, status, kind, role_scope",
      )
      .eq("id", request_id)
      .maybeSingle();
    if (error) {
      const { data: fb } = await admin
        .from("lead_reassign_requests")
        .select("id, lead_id, to_user_id, from_user_id, requested_by, status")
        .eq("id", request_id)
        .maybeSingle();
      req = fb
        ? {
            id: fb.id as string,
            lead_id: fb.lead_id as string,
            to_user_id: fb.to_user_id as string,
            from_user_id: fb.from_user_id as string | null,
            requested_by: fb.requested_by as string,
            status: fb.status as string,
            kind: "push",
            role_scope: "obchod",
          }
        : null;
    } else if (data) {
      req = {
        id: data.id as string,
        lead_id: data.lead_id as string,
        to_user_id: data.to_user_id as string,
        from_user_id: data.from_user_id as string | null,
        requested_by: data.requested_by as string,
        status: data.status as string,
        kind: ((data.kind as string) === "pull" ? "pull" : "push"),
        role_scope:
          (data.role_scope as string) === "obhliadky"
            ? "obhliadky"
            : (data.role_scope as string) === "realizacie"
              ? "realizacie"
              : "obchod",
      };
    }
  }
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

  // Kto smie odpovedať:
  //   • push (dar) → to_user_id (adresát daru)
  //   • pull (prosba) → from_user_id (súčasný owner, ktorého prosia)
  const canRespond =
    req.kind === "push"
      ? req.to_user_id === user.id
      : req.from_user_id === user.id;
  if (!canRespond) {
    return NextResponse.json(
      { ok: false, error: "not_addressee" },
      { status: 403 },
    );
  }

  const nowIso = new Date().toISOString();

  if (action === "accept") {
    // Prepíš príslušný stĺpec podľa role_scope.
    //   obchod    → assigned_to
    //   obhliadky → inspection_by
    //   realizacie→ realization_by
    const updateCol =
      req.role_scope === "obhliadky"
        ? "inspection_by"
        : req.role_scope === "realizacie"
          ? "realization_by"
          : "assigned_to";
    // stolen_at + stolen_from — používame ako unified marker „nedávno
    // preradené na teba" pre notification bell (loadNotifications).
    // Iba pri obchod scope — obhliadky/realizacie majú vlastnú logiku.
    const updates: Record<string, unknown> = {
      last_activity_at: nowIso,
      [updateCol]: req.to_user_id,
    };
    if (req.role_scope === "obchod") {
      updates.stolen_at = nowIso;
      updates.stolen_from = req.from_user_id;
    }
    const { error: upErr } = await admin
      .from("leads")
      .update(updates)
      .eq("id", req.lead_id);
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "lead_update_failed", message: upErr.message },
        { status: 500 },
      );
    }

    await admin
      .from("lead_reassign_requests")
      .update({ status: "accepted", responded_at: nowIso })
      .eq("id", req.id);

    try {
      await admin.from("lead_activities").insert({
        lead_id: req.lead_id,
        user_id: user.id,
        type: "reassign_accepted",
        data: {
          request_id: req.id,
          new_owner: req.to_user_id,
          prev_owner: req.from_user_id,
          requested_by: req.requested_by,
        },
      });
    } catch (e) {
      console.warn("[reassign/respond] activity log failed:", e);
    }

    return NextResponse.json({ ok: true, action: "accepted" });
  }

  // decline
  const declineReason = (body.decline_reason ?? "").slice(0, 500) || null;
  await admin
    .from("lead_reassign_requests")
    .update({
      status: "declined",
      responded_at: nowIso,
      decline_reason: declineReason,
    })
    .eq("id", req.id);

  try {
    await admin.from("lead_activities").insert({
      lead_id: req.lead_id,
      user_id: user.id,
      type: "reassign_declined",
      data: {
        request_id: req.id,
        requested_by: req.requested_by,
        decline_reason: declineReason,
      },
    });
  } catch (e) {
    console.warn("[reassign/respond] activity log failed:", e);
  }

  return NextResponse.json({ ok: true, action: "declined" });
}
