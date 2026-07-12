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
  const { data } = await admin
    .from("training_modules")
    .select("*")
    .order("sort_order");
  return NextResponse.json({ ok: true, modules: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err, user } = await requireAdmin();
  if (err) return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = ((body.title as string) ?? "").trim();
  const kind = body.kind as string;
  if (!title || !kind) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("training_modules").insert({
    title,
    description: (body.description as string) ?? null,
    role_target: (body.role_target as string[]) ?? [],
    kind,
    media_url: (body.media_url as string) ?? null,
    duration_min: (body.duration_min as number) ?? null,
    required: body.required === true,
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
  for (const k of ["title", "description", "role_target", "kind", "media_url", "duration_min", "required", "sort_order", "active"])
    if (k in body) patch[k] = body[k];
  const admin = createAdminClient();
  const { error } = await admin.from("training_modules").update(patch).eq("id", id);
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
  const { error } = await admin.from("training_modules").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
