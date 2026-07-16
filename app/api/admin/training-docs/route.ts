export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRUD pre /admin/podklady — general knowledge base pre všetky role.
 *
 * User 2026-07-16: „chcem ako admin nahodit manualne podklady, rozne ci
 * uz su to call scripty, gen knowladge pre obchodakov alebo script pre
 * obhliadkara alebo potom postupy na jednotlive systemy pre realizatorov".
 *
 * GET  — list (admin all, ostatní: filter by role + active)
 * POST — create (admin only)
 * PATCH — update (admin only)
 * DELETE — delete (admin only, hard delete)
 */
const ROLES = ["obchod", "obhliadky", "realizacie", "admin", "vsetci"] as const;

async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me) return { user: null, err: "unauthenticated" as const };
  if (me.role !== "admin") return { user: null, err: "forbidden" as const };
  return { user: me, err: null };
}

export async function GET(request: NextRequest) {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const url = request.nextUrl;
  const role = url.searchParams.get("role"); // filter podľa target_role
  const includeInactive = me.role === "admin" && url.searchParams.get("all") === "1";

  let q = admin.from("training_docs").select("*");
  if (role) q = q.in("target_role", [role, "vsetci"]);
  else if (me.role !== "admin") q = q.in("target_role", [me.role, "vsetci"]);
  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, docs: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, docs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthenticated" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = ((body.title as string) ?? "").trim();
  const target_role = (body.target_role as string) ?? "vsetci";
  if (!title) {
    return NextResponse.json({ ok: false, error: "missing_title" }, { status: 400 });
  }
  if (!ROLES.includes(target_role as (typeof ROLES)[number])) {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_docs")
    .insert({
      title,
      body_md: (body.body_md as string) ?? "",
      target_role,
      category: (body.category as string) ?? "obecne",
      sort_order: (body.sort_order as number) ?? 100,
      active: body.active === false ? false : true,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, doc: data });
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
  for (const k of ["title", "body_md", "target_role", "category", "sort_order", "active"]) {
    if (k in body) patch[k] = body[k];
  }
  if (
    patch.target_role &&
    !ROLES.includes(patch.target_role as (typeof ROLES)[number])
  ) {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("training_docs").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
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
  const { error } = await admin.from("training_docs").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
