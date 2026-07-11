export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calcInventory,
  systemsFor,
  type FloorType,
} from "@/lib/data/realization-systems";

/**
 * POST /api/lead/set-system
 * Body: { lead_id, type (FloorType), binder?, system (code) }
 *
 * Uloží obchodákov výber systému do lead.data.realization_system + prepočíta
 * inventory a uloží do lead.data.realization_inventory. Realizator ich
 * potom uvidí v Inventúra module.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden_wrong_role" }, { status: 403 });
  }

  let body: {
    lead_id?: string;
    type?: FloorType;
    binder?: string | null;
    system?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const leadId = body.lead_id;
  const type = body.type;
  const system = body.system;
  const binder = body.binder ?? null;
  if (!leadId || !type || !system) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Validate: systém musí existovať pre type + binder
  const valid = systemsFor(type, binder as "epoxid" | "polyuretan" | null).some(
    (s) => s.code === system,
  );
  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_system_for_type" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("data, inspection_result")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const existingData = (lead.data as Record<string, unknown> | null) ?? {};
  const insp = (lead.inspection_result as Record<string, unknown> | null) ?? {};
  const m2 =
    typeof insp.measured_m2 === "number" && insp.measured_m2 > 0
      ? insp.measured_m2
      : typeof existingData.plocha === "string"
        ? parseFloat(existingData.plocha as string)
        : typeof existingData.plocha === "number"
          ? (existingData.plocha as number)
          : 0;

  const inventory = m2 > 0 ? calcInventory(system, m2) : [];

  const nextData = {
    ...existingData,
    realization_system: {
      type,
      binder,
      system,
      chosen_at: new Date().toISOString(),
      chosen_by: user.id,
    },
    realization_inventory: inventory,
  };

  const { error } = await admin
    .from("leads")
    .update({ data: nextData, last_activity_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `db_update: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, inventory_count: inventory.length });
}
