export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { err: "unauthorized" as const };
  if (user.role !== "admin") return { err: "forbidden" as const };
  return { err: null };
}

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin.from("sika_catalog").select("*").order("name");
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sap = ((body.sap_number as string) ?? "").trim();
  const name = ((body.name as string) ?? "").trim();
  if (!sap || !name) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("sika_catalog").insert({
    sap_number: sap,
    name,
    packaging: (body.packaging as string) ?? "",
    packaging_kg: (body.packaging_kg as number) ?? null,
    default_cost_eur: (body.default_cost_eur as number) ?? null,
    category: (body.category as string) ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sap = body.sap_number as string;
  if (!sap) return NextResponse.json({ ok: false, error: "missing_sap" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["name", "packaging", "packaging_kg", "default_cost_eur", "category", "active"])
    if (k in body) patch[k] = body[k];
  const admin = createAdminClient();
  const { error } = await admin.from("sika_catalog").update(patch).eq("sap_number", sap);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sap = body.sap_number as string;
  if (!sap) return NextResponse.json({ ok: false, error: "missing_sap" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("sika_catalog").delete().eq("sap_number", sap);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
