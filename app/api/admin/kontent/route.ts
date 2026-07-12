export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRUD pre content_shotlist_templates.
 *
 * GET (autentifikovaný) — vráti active shots pre realizatorské UI + admin.
 * POST/PATCH/DELETE — iba admin.
 */
async function requireAuth() {
  const user = await getCurrentAppUser();
  if (!user) return { user: null, err: "unauthorized" as const };
  return { user, err: null };
}
async function requireAdmin() {
  const { user, err } = await requireAuth();
  if (err) return { user: null, err };
  if (user!.role !== "admin") return { user: null, err: "forbidden" as const };
  return { user, err: null };
}

export async function GET() {
  const { err } = await requireAuth();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_shotlist_templates")
    .select("*")
    .order("phase", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, shots: [] });
  }
  return NextResponse.json({ ok: true, shots: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const shotKey = ((body.shot_key as string) ?? "").trim();
  const phase = body.phase as string;
  const title = ((body.title as string) ?? "").trim();
  const kind = body.kind as string;
  if (!shotKey || !phase || !title || !kind) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_shotlist_templates")
    .insert({
      shot_key: shotKey,
      phase,
      title,
      description: (body.description as string) ?? "",
      tips: (body.tips as unknown) ?? [],
      kind,
      orientation: (body.orientation as string) ?? "any",
      duration_sec: (body.duration_sec as number) ?? null,
      required: body.required === true,
      floor_types: (body.floor_types as string[]) ?? null,
      icon: (body.icon as string) ?? "📷",
      sort_order: (body.sort_order as number) ?? 100,
      active: body.active === false ? false : true,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, shot: data });
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "shot_key",
    "phase",
    "title",
    "description",
    "tips",
    "kind",
    "orientation",
    "duration_sec",
    "required",
    "floor_types",
    "icon",
    "sort_order",
    "active",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("content_shotlist_templates")
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
    .from("content_shotlist_templates")
    .update({ active: false })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
