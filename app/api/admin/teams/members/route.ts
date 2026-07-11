export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Manažment členov tímu — pridať / odobrať / preusporiadať.
 *
 * POST   → { team_id, user_id }                → pridá člena
 * DELETE → { team_id, user_id }                → odoberie člena
 */

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return { err: "unauthorized" as const };
  if (user.role !== "admin") return { err: "forbidden" as const };
  return { err: null };
}

export async function POST(request: NextRequest) {
  const { err } = await requireAdmin();
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: err === "unauthorized" ? 401 : 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const teamId = body.team_id as string;
  const userId = body.user_id as string;
  if (!teamId || !userId) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();

  // Overiť že user má rolu realizacie/admin
  const { data: usr } = await admin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!usr) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }
  if (usr.role !== "realizacie" && usr.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "user_wrong_role: iba realizacie/admin môžu byť v tíme" },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("realization_team_members")
    .insert({ team_id: teamId, user_id: userId })
    .select("*")
    .maybeSingle();
  if (error && !error.message.includes("duplicate")) {
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
  const teamId = body.team_id as string;
  const userId = body.user_id as string;
  if (!teamId || !userId) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("realization_team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
