export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { err: "unauthorized" as const, user: null };
  if (user.role !== "admin") return { err: "forbidden" as const, user: null };
  return { err: null, user };
}

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin.from("custom_materials").select("*").order("sort_order");
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err, user } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = ((body.slug as string) ?? "").trim();
  const label = ((body.label as string) ?? "").trim();
  if (!slug || !label) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("custom_materials").insert({
    slug,
    label,
    category: (body.category as string) ?? null,
    price_per_sqm: (body.price_per_sqm as number) ?? null,
    price_per_unit: (body.price_per_unit as number) ?? null,
    unit_label: (body.unit_label as string) ?? null,
    optional: body.optional === true,
    default_enabled: body.default_enabled !== false,
    hidden_in_pdf: body.hidden_in_pdf === true,
    sort_order: (body.sort_order as number) ?? 100,
    created_by: user!.id,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["label", "category", "price_per_sqm", "price_per_unit", "unit_label", "optional", "default_enabled", "hidden_in_pdf", "sort_order", "active"])
    if (k in body) patch[k] = body[k];
  const admin = createAdminClient();
  const { error } = await admin.from("custom_materials").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("custom_materials").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
