export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Po každej zmene v realization_systems invaliduj cache pre všetky
 * stránky ktoré čítajú tie dáta — realizátor okamžite vidí nový postup,
 * obchodák nový systém pri priraďovaní, admin fresh list.
 * User 2026-07-12: „ked ako admin submitnem tak sa to posle vsetkym".
 */
function bustCache() {
  try {
    revalidatePath("/admin/systems", "page");
    revalidatePath("/admin/nastavenia", "page");
    revalidatePath("/realizacie", "layout");
    revalidatePath("/agent", "layout");
    revalidatePath("/obhliadnute", "page");
  } catch {
    /* revalidatePath môže padnúť v edge runtime — best effort */
  }
}

/**
 * GET /api/admin/systems
 *   → { systems: [{ id, code, label, description, floor_type, binder,
 *                    sort_order, active, procedure_steps, products: [...] }, …] }
 *
 * POST /api/admin/systems  (create system)
 *   Body: { code, label, description?, floor_type, binder?, sort_order?,
 *           active?, procedure_steps?: [{step,title,note}] }
 *
 * PATCH /api/admin/systems  (update system)
 *   Body: { id, ...fields }
 *
 * DELETE /api/admin/systems  (deactivate system)
 *   Body: { id }
 *
 * User 2026-07-11:
 *   "tento system sa bude dat definovat aj v admine budu mat pomenovanie
 *    napr. 264 a tam bude penetrak, finalny nater, popripade lak ak tak
 *    ide a vyplnim tam spotrebu a na zaklade toho bude urcovat kolko
 *    sudov potreubjem podla m2".
 */

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { user: null, err: "unauthorized" as const };
  if (user.role !== "admin") return { user: null, err: "forbidden" as const };
  return { user, err: null };
}

export async function GET() {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const admin = createAdminClient();
  const [{ data: systems }, { data: products }] = await Promise.all([
    admin
      .from("realization_systems")
      .select("*")
      .order("sort_order", { ascending: true }),
    admin
      .from("realization_system_products")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);
  const bySystem = new Map<string, unknown[]>();
  for (const p of products ?? []) {
    const id = (p as { system_id: string }).system_id;
    if (!bySystem.has(id)) bySystem.set(id, []);
    bySystem.get(id)!.push(p);
  }
  const merged = (systems ?? []).map((s) => ({
    ...s,
    products: bySystem.get((s as { id: string }).id) ?? [],
  }));
  return NextResponse.json({ ok: true, systems: merged });
}

export async function POST(request: NextRequest) {
  const { user, err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const code = ((body.code as string) ?? "").trim();
  const label = ((body.label as string) ?? "").trim();
  const floorType = body.floor_type as string;
  if (!code || !label || !floorType) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("realization_systems")
    .insert({
      code,
      label,
      description: (body.description as string) ?? null,
      floor_type: floorType,
      binder: (body.binder as string) ?? null,
      sort_order: (body.sort_order as number) ?? 100,
      active: body.active === false ? false : true,
      procedure_steps: (body.procedure_steps as unknown) ?? [],
      responsibility_steps: (body.responsibility_steps as unknown) ?? [],
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  bustCache();
  return NextResponse.json({ ok: true, system: data, propagated: true });
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
    "code",
    "label",
    "description",
    "floor_type",
    "binder",
    "sort_order",
    "active",
    "procedure_steps",
    "responsibility_steps",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("realization_systems").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  bustCache();
  return NextResponse.json({ ok: true, propagated: true });
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
  // Deaktivujeme (soft delete) — nikdy hard delete lebo leady na to viažu
  const { error } = await admin
    .from("realization_systems")
    .update({ active: false })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  bustCache();
  return NextResponse.json({ ok: true, propagated: true });
}
