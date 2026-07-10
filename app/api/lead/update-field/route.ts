export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/lead/update-field
 *
 * Rýchly inline update jedného poľa v lead.data JSONB. Používa sa na
 * lead karte v /agent — obchodák pri hovore doplní chýbajúcu info
 * (m², mesto, typ podlahy, priestor) bez otvárania detail stránky.
 *
 * Body: { lead_id: string, field: string, value: string }
 *   field musí byť jeden z povolených: plocha | lokalita | typ_podlahy | priestor
 *
 * Response: { ok: true } | { ok: false, error }
 *
 * Prístup: obchodník-vlastník leadu alebo admin.
 */

const ALLOWED_FIELDS = new Set(["plocha", "lokalita", "typ_podlahy", "priestor"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: { lead_id?: string; field?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const leadId = body.lead_id?.trim();
  const field = body.field?.trim();
  const value = String(body.value ?? "").trim();

  if (!leadId || !field) {
    return NextResponse.json(
      { ok: false, error: "missing_params" },
      { status: 400 },
    );
  }
  if (!ALLOWED_FIELDS.has(field)) {
    return NextResponse.json(
      { ok: false, error: "invalid_field" },
      { status: 400 },
    );
  }
  if (value.length > 200) {
    return NextResponse.json(
      { ok: false, error: "value_too_long" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("id, data, assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) {
    return NextResponse.json(
      { ok: false, error: "lead_not_found" },
      { status: 404 },
    );
  }

  // Access — obchodák-vlastník leadu alebo admin
  const canEdit =
    user.role === "admin" || lead.assigned_to === user.id;
  if (!canEdit) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  // Merge do data JSONB (nezmažeme ostatné polia!)
  const currentData = (lead.data ?? {}) as Record<string, unknown>;
  const newData = { ...currentData };
  if (value === "") {
    delete newData[field];
  } else {
    newData[field] = value;
  }

  const { error: updErr } = await admin
    .from("leads")
    .update({
      data: newData,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 },
    );
  }

  // Activity log (best-effort)
  await admin
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      user_id: user.id,
      type: "field_updated",
      data: { field, value },
    })
    .then(() => {})
    .catch(() => {});

  return NextResponse.json({ ok: true, field, value });
}
