export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/inventory-taken
 * Body: { lead_id }
 *
 * Realizator klikne "Zobral som materiál" — uložíme timestamp do
 * lead.data.realization_inventory_taken_at aby sme mohli neskôr audit-nuť
 * kto a kedy zobral, plus checkbox stav na UI (žlté → zelené).
 *
 * User 2026-07-11:
 *   "to vzal sa neda kliknut je to somarina, radsej to daj prec a iba
 *    submit button ze to zobral to potvrdi".
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "realizacie" && user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden_wrong_role" }, { status: 403 });
  }

  let body: { lead_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const leadId = body.lead_id;
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("data, realization_by")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  // Ownership check
  if (user.role !== "admin" && lead.realization_by !== user.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden_not_your_realization" },
      { status: 403 },
    );
  }

  const nowIso = new Date().toISOString();
  const existing = (lead.data as Record<string, unknown> | null) ?? {};
  const nextData = {
    ...existing,
    realization_inventory_taken_at: nowIso,
    realization_inventory_taken_by: user.id,
  };
  const { error } = await admin
    .from("leads")
    .update({ data: nextData, last_activity_at: nowIso })
    .eq("id", leadId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `db_update: ${error.message}` },
      { status: 500 },
    );
  }

  // Audit
  admin
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      user_id: user.id,
      type: "inventory_taken",
      data: { taken_at: nowIso },
    })
    .then(() => {});

  return NextResponse.json({ ok: true, taken_at: nowIso });
}
