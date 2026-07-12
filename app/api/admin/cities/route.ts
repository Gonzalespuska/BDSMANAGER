export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { err: "unauthorized" as const };
  if (user.role !== "admin") return { err: "forbidden" as const };
  return { err: null, user };
}

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("city_distances")
    .select("*")
    .order("label", { ascending: true });
  return NextResponse.json({ ok: true, cities: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err)
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const label = ((body.label as string) ?? "").trim();
  const km = Number(body.km_from_hq);
  if (!label || !isFinite(km))
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const admin = createAdminClient();
  const { error } = await admin
    .from("city_distances")
    .insert({ slug, label, km_from_hq: km });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err)
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = body.slug as string;
  if (!slug) return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["label", "km_from_hq", "active"]) if (k in body) patch[k] = body[k];
  const admin = createAdminClient();
  const { error } = await admin.from("city_distances").update(patch).eq("slug", slug);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err)
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = body.slug as string;
  if (!slug) return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("city_distances").delete().eq("slug", slug);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
