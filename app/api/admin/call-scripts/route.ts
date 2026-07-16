export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRUD pre call_scripts.
 *
 * User 2026-07-11:
 *   "chcem callscripty obchodakom pridat do podkladov takze to tiez musi
 *    mat admin moznost editovat v admine … vzdy podla typu podlahy je
 *    call script su viazane cize mramorova interier dom ma iny call
 *    script ako mramorova garaz a podobne".
 *
 * GET: list all (aj obchodák môže volať pre výber scriptu)
 * POST/PATCH/DELETE: iba admin
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

export async function GET(request: NextRequest) {
  const { user, err } = await requireAuth();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: 401 });
  }
  const includeAll =
    user!.role === "admin" && request.nextUrl.searchParams.get("all") === "1";
  const admin = createAdminClient();
  const query = admin.from("call_scripts").select("*");
  if (!includeAll) query.eq("active", true);
  const { data, error } = await query.order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, scripts: [] });
  }
  return NextResponse.json({ ok: true, scripts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const label = ((body.label as string) ?? "").trim();
  const bodyText = ((body.body as string) ?? "").trim();
  if (!label || !bodyText) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("call_scripts")
    .insert({
      label,
      description: (body.description as string) ?? null,
      floor_type: (body.floor_type as string) || null,
      space: (body.space as string) || null,
      body: bodyText,
      steps: Array.isArray(body.steps) ? body.steps : null,
      sort_order: (body.sort_order as number) ?? 100,
      active: body.active === false ? false : true,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, script: data });
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
  for (const k of ["label", "description", "floor_type", "space", "body", "steps", "sort_order", "active"]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("call_scripts").update(patch).eq("id", id);
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
  const hard = body.hard === true || body.hard === "true";
  const { error } = hard
    ? await admin.from("call_scripts").delete().eq("id", id)
    : await admin.from("call_scripts").update({ active: false }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
