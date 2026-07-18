export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRUD pre realization_system_products (komponenty systému —
 * primer, binder, topcoat, chip, other).
 *
 * User 2026-07-11:
 *   "napr. 264 a tam bude penetrak, finalny nater, popripade lak ak tak
 *    ide a vyplnim tam spotrebu a na zakalde toho bude urcovat kolko
 *    sudov potreubjem podla m2".
 */

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { user: null, err: "unauthorized" as const };
  if (user.role !== "admin") return { user: null, err: "forbidden" as const };
  return { user, err: null };
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const systemId = body.system_id as string;
  const productRole = body.product_role as string;
  const sku = ((body.sku as string) ?? "").trim();
  const label = ((body.label as string) ?? "").trim();
  const consumption = Number(body.consumption_per_m2);
  const unitSize = Number(body.unit_size_kg);
  if (!systemId || !productRole || !sku || !label || !consumption || !unitSize) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("realization_system_products")
    .insert({
      system_id: systemId,
      product_role: productRole,
      sku,
      label,
      consumption_per_m2: consumption,
      unit_size_kg: unitSize,
      unit_label: (body.unit_label as string) ?? "sud",
      sort_order: (body.sort_order as number) ?? 100,
      price_per_unit:
        typeof body.price_per_unit === "number"
          ? body.price_per_unit
          : body.price_per_unit == null
            ? null
            : Number(body.price_per_unit),
      // Phase 2 spec 2026-07-18: pocet_vrstiev + volitelna + rezerva_percent
      pocet_vrstiev:
        typeof body.pocet_vrstiev === "number" && body.pocet_vrstiev >= 1
          ? Math.min(Math.floor(body.pocet_vrstiev), 10)
          : 1,
      volitelna: body.volitelna === true,
      rezerva_percent:
        typeof body.rezerva_percent === "number" &&
        body.rezerva_percent >= 0 &&
        body.rezerva_percent <= 100
          ? body.rezerva_percent
          : 8,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, product: data });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const k of [
    "product_role",
    "sku",
    "label",
    "consumption_per_m2",
    "unit_size_kg",
    "unit_label",
    "sort_order",
    "price_per_unit",
    "pocet_vrstiev",
    "volitelna",
    "rezerva_percent",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("realization_system_products")
    .update(patch)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("realization_system_products")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
