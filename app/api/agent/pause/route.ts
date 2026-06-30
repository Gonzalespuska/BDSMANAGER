export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/agent/pause
 *
 * Self-pauznutie / obnovenie príjmu leadov.
 * Body: { paused: boolean }
 * Response: { ok: true, capacity: number } alebo { ok: false, error }
 */
export async function POST(request: NextRequest) {
  let body: { paused?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.id === "dev-user") {
    return NextResponse.json(
      { ok: false, error: "dev fallback user" },
      { status: 400 },
    );
  }

  const paused = body.paused === true;
  const nextCapacity = paused ? 0 : 5;

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update({ capacity: nextCapacity })
      .eq("id", user.id);

    if (error) {
      console.error("[agent/pause] update failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, capacity: nextCapacity });
  } catch (e) {
    console.error("[agent/pause] exception:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
