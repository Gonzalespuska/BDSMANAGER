export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST /api/admin/debug-cleanup — vymaže debug.test_* seed rows. */
export async function POST() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .delete()
    .like("key", "debug.test_%")
    .select("key");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0, keys: (data ?? []).map((r) => r.key) });
}
