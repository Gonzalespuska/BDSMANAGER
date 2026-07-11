export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/manual-create
 *
 * Body: {
 *   name: string (required),
 *   phone: string | null,
 *   email: string | null,
 *   city: string | null,
 *   m2: string | null,
 *   floor_type: string | null,
 * }
 *
 * Validation:
 *   - name je required
 *   - phone ALEBO email je required (aspoň jedno)
 *
 * Vytvorí nový lead v public.leads:
 *   - status='phone_revealed' (obchodák ho pridal ručne, telefón vie)
 *   - source_type='manual', source_campaign='obchodák manual add'
 *   - assigned_to = current user (obchodák)
 *   - data.plocha, data.lokalita, data.typ_podlahy z body
 *
 * Vráti { ok: true, lead_id }.
 * Použitie: ManualAssignModal → nový lead → redirect na assign flow.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_wrong_role" },
      { status: 403 },
    );
  }

  let body: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    m2?: string | null;
    floor_type?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const name = (body.name ?? "").trim();
  const phone = body.phone?.trim() || null;
  const email = body.email?.trim() || null;
  const city = body.city?.trim() || null;
  const m2 = body.m2?.trim() || null;
  const floorType = body.floor_type?.trim() || null;

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "missing_name" },
      { status: 400 },
    );
  }
  if (!phone && !email) {
    return NextResponse.json(
      { ok: false, error: "missing_contact" },
      { status: 400 },
    );
  }

  // Pri manuáli je telefón (ak existuje) rovno "odhalený" — obchodák
  // ho vie a status je "phone_revealed", nie "new".
  const nowIso = new Date().toISOString();

  const leadData: Record<string, string> = {};
  if (city) leadData.lokalita = city;
  if (m2) leadData.plocha = m2;
  if (floorType) leadData.typ_podlahy = floorType;

  const admin = createAdminClient();

  // Zdroj — hľadáme "manual" source id v public.sources, ak nie je použijeme null
  let sourceId: string | null = null;
  try {
    const { data: src } = await admin
      .from("sources")
      .select("id")
      .eq("slug", "manual")
      .maybeSingle();
    if (src) sourceId = src.id as string;
  } catch {
    /* ignore */
  }

  const { data: created, error } = await admin
    .from("leads")
    .insert({
      source_id: sourceId,
      source_type: "manual",
      source_campaign: "Manuálne pridané obchodákom",
      name,
      phone,
      email,
      data: leadData,
      status: phone ? "phone_revealed" : "new",
      assigned_to: user.id,
      phone_revealed_at: phone ? nowIso : null,
      phone_revealed_by: phone ? user.id : null,
      created_at: nowIso,
      last_activity_at: nowIso,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[lead/manual-create] insert error:", error);
    return NextResponse.json(
      { ok: false, error: `db_insert: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Audit log
  admin
    .from("lead_activities")
    .insert({
      lead_id: created.id,
      user_id: user.id,
      type: "manual_created",
      data: { name, has_phone: !!phone, has_email: !!email },
    })
    .then(() => {
      /* fire-and-forget */
    });

  return NextResponse.json({ ok: true, lead_id: created.id });
}
