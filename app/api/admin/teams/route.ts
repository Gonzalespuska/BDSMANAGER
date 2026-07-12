export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CRUD pre realization_teams.
 *
 * GET   → { teams: [{id, name, members: [{id, name, email}]}] }
 * POST  → { name, description? } → vytvorí tím
 * PATCH → { id, name?, description?, active? } → upraví tím
 * DELETE→ { id } → deaktivuje (soft delete)
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
  const [{ data: teams, error: tErr }, { data: members }] = await Promise.all([
    admin
      .from("realization_teams")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    admin
      .from("realization_team_members")
      .select("team_id, user_id, sort_order, users:user_id (id, name, email, role)")
      .order("sort_order", { ascending: true }),
  ]);
  if (tErr) {
    return NextResponse.json({ ok: false, error: tErr.message, teams: [] });
  }
  const byTeam = new Map<string, Array<{ id: string; name: string; email: string }>>();
  for (const m of members ?? []) {
    const teamId = (m as { team_id: string }).team_id;
    const u = (m as { users: { id: string; name: string | null; email: string } | null }).users;
    if (!u) continue;
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    byTeam.get(teamId)!.push({
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
    });
  }
  const withMembers = (teams ?? []).map((t) => ({
    ...t,
    members: byTeam.get((t as { id: string }).id) ?? [],
  }));
  return NextResponse.json({ ok: true, teams: withMembers });
}

export async function POST(request: NextRequest) {
  const { user, err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = ((body.name as string) ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("realization_teams")
    .insert({
      name,
      description: (body.description as string) ?? null,
      home_city: (body.home_city as string) ?? null,
      created_by: user!.id,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, team: data });
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
  for (const k of ["name", "description", "active", "home_city"]) {
    if (k in body) patch[k] = body[k];
  }
  const admin = createAdminClient();
  const { error } = await admin.from("realization_teams").update(patch).eq("id", id);
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
  const { error } = await admin.from("realization_teams").update({ active: false }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
