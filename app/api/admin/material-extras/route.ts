export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRUD pre extra materiály (custom položky v Cenníku materiálov).
 * Zatiaľ ich generator CP nepoužíva — sú tam pre postupov realizátorov
 * a interný cenník.
 */

const STEPS = ["uprava", "penetracia", "farebny", "lak", "ine"] as const;
const FLOORS = ["jednofarebna", "chipsova", "mramorova", "metalicka"] as const;

async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me) return { err: "unauthenticated" as const };
  if (me.role !== "admin") return { err: "forbidden" as const };
  return { err: null };
}

export async function GET() {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("material_extras")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthenticated" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = ((body.name as string) ?? "").trim();
  const step = (body.step as string) ?? "";
  const floor_types = Array.isArray(body.floor_types) ? (body.floor_types as string[]) : [];
  if (!name || !STEPS.includes(step as (typeof STEPS)[number])) {
    return NextResponse.json({ ok: false, error: "missing_or_invalid_fields" }, { status: 400 });
  }
  if (floor_types.some((f) => !FLOORS.includes(f as (typeof FLOORS)[number]))) {
    return NextResponse.json({ ok: false, error: "invalid_floor_type" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("material_extras")
    .insert({
      name,
      step,
      floor_types,
      price_per_sqm: body.price_per_sqm != null ? Number(body.price_per_sqm) : null,
      cost_per_sqm: body.cost_per_sqm != null ? Number(body.cost_per_sqm) : null,
      consumption_kg_per_sqm:
        body.consumption_kg_per_sqm != null ? Number(body.consumption_kg_per_sqm) : null,
      notes: (body.notes as string) ?? null,
      active: body.active === false ? false : true,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthenticated" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "name",
    "step",
    "floor_types",
    "price_per_sqm",
    "cost_per_sqm",
    "consumption_kg_per_sqm",
    "notes",
    "active",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("material_extras").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthenticated" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("material_extras").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
