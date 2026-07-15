export const runtime = "edge";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/vacation/pending
 *
 * Admin-only: vráti PENDING dovolenkové žiadosti. Používa sticky
 * admin bar (rovnaký visualizer ako reassign requests, iný farebný tint).
 */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", items: [] },
      { status: 401 },
    );
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: true, items: [] });
  }

  const admin = createAdminClient();
  const { data: reqs } = await admin
    .from("vacation_requests")
    .select("id, user_id, from_date, to_date, reason, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });

  const rows = reqs ?? [];
  if (rows.length === 0) return NextResponse.json({ ok: true, items: [] });

  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const { data: users } = await admin
    .from("users")
    .select("id, name, email, role")
    .in("id", userIds);
  const userMap = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      {
        name: (u.name as string) || (u.email as string),
        role: u.role as string,
      },
    ]),
  );

  return NextResponse.json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      user_name: userMap.get(r.user_id as string)?.name ?? "user",
      user_role: userMap.get(r.user_id as string)?.role ?? "user",
      from_date: r.from_date as string,
      to_date: r.to_date as string,
      reason: (r.reason as string | null) ?? null,
      requested_at: r.requested_at as string,
    })),
  });
}
