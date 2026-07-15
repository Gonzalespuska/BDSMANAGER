export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET    /api/admin/procedure-step-library
 * POST   /api/admin/procedure-step-library     Body: { title, default_note?, sort_order? }
 * PATCH  /api/admin/procedure-step-library     Body: { id, title?, default_note?, sort_order?, active? }
 * DELETE /api/admin/procedure-step-library     Body: { id }
 *
 * Knižnica krokov postupu — admin si spravuje zoznam typicky-použiteľných
 * krokov (napr. „Vybrúsenie", „Zošívanie / spravovanie podkladu"). Každý
 * má DEFAULT popis. Pri tvorbe systému sa vyberajú z tohto zoznamu.
 *
 * User 2026-07-12: „pridaj toto do admina ako jednotlive body ktore mozem
 * pridavat k systemom … mozem ku tomu bodu dat popis najskor a potom
 * pridelujem uz iba".
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
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("procedure_step_library")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, steps: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  let body: {
    title?: string;
    default_note?: string;
    sort_order?: number;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "title_required" },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("procedure_step_library")
    .insert({
      title,
      default_note: body.default_note ?? "",
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 100,
      active: body.active ?? true,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, step: data });
}

export async function PATCH(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  let body: {
    id?: string;
    title?: string;
    default_note?: string;
    sort_order?: number;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.default_note === "string") patch.default_note = body.default_note;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
  if (typeof body.active === "boolean") patch.active = body.active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("procedure_step_library")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, step: data });
}

export async function DELETE(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json(
      { ok: false, error: err },
      { status: err === "unauthorized" ? 401 : 403 },
    );
  }
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("procedure_step_library")
    .delete()
    .eq("id", body.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
