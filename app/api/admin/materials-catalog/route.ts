export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET  /api/admin/materials-catalog        → list catalog (search + filter)
 *      Query params:
 *        q         — search by sku/name (case-insensitive, min 1 char)
 *        category  — filter by primer|binder|topcoat|other
 * POST /api/admin/materials-catalog        → create item
 * PATCH /api/admin/materials-catalog       → update item
 * DELETE /api/admin/materials-catalog      → deactivate (soft)
 *
 * User 2026-07-18: „cenu za sud si to vytiahne z cenniku materialov cize
 * najskor si podme definovat materialy ake pozname a potom to budeme iba
 * vyberat nie manualne pisat ze sika floor 151".
 *
 * Backend je `sika_catalog` table (migration 39 + rozsirene 48 o
 * consumption_per_m2 + unit_label). Pouziva sa ako master catalog v
 * /admin/systems ProductRow — obchodak/admin klikne pridat komponent,
 * napise „151", vyberie Sikafloor-151 → auto-fillne sku/spotreba/balenie/
 * cena/jednotka bez rucneho typu.
 */

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { user: null, err: "unauthorized" as const };
  if (user.role !== "admin") return { user: null, err: "forbidden" as const };
  return { user, err: null };
}

export async function GET(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const category = (url.searchParams.get("category") ?? "").trim();

  const admin = createAdminClient();
  let query = admin
    .from("sika_catalog")
    .select(
      "sap_number, name, packaging, packaging_kg, default_cost_eur, category, unit_label, consumption_per_m2, active",
    )
    .eq("active", true);

  if (category && ["primer", "binder", "topcoat", "chip", "other"].includes(category)) {
    query = query.eq("category", category);
  }
  if (q.length > 0) {
    // OR-search: sap_number ILIKE %q% OR name ILIKE %q%
    query = query.or(`sap_number.ilike.%${q}%,name.ilike.%${q}%`);
  }
  const { data, error } = await query.order("name").limit(50);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sap = String(body.sap_number ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!sap || !name) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sika_catalog")
    .insert({
      sap_number: sap,
      name,
      packaging: String(body.packaging ?? ""),
      packaging_kg: (body.packaging_kg as number) ?? null,
      default_cost_eur: (body.default_cost_eur as number) ?? null,
      category: (body.category as string) ?? "other",
      unit_label: String(body.unit_label ?? "sud"),
      consumption_per_m2: (body.consumption_per_m2 as number) ?? null,
      active: true,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sap = String(body.sap_number ?? "").trim();
  if (!sap) {
    return NextResponse.json({ ok: false, error: "missing_sap_number" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "name",
    "packaging",
    "packaging_kg",
    "default_cost_eur",
    "category",
    "unit_label",
    "consumption_per_m2",
    "active",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("sika_catalog").update(patch).eq("sap_number", sap);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sap = String(body.sap_number ?? "").trim();
  if (!sap) {
    return NextResponse.json({ ok: false, error: "missing_sap_number" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("sika_catalog")
    .update({ active: false })
    .eq("sap_number", sap);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
