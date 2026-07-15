export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  const testKey = `debug.test_${Date.now()}`;

  // 1. Read count BEFORE
  const { count: before } = await admin
    .from("app_settings")
    .select("*", { count: "exact", head: true });

  // 2. Insert one row
  const { error: insErr } = await admin
    .from("app_settings")
    .insert({
      key: testKey,
      value: "TEST_VALUE",
      label: "Test",
      description: "Debug row",
    });

  // 3. Read count AFTER
  const { count: after } = await admin
    .from("app_settings")
    .select("*", { count: "exact", head: true });

  // 4. Read our specific row
  const { data: our, error: selErr } = await admin
    .from("app_settings")
    .select("*")
    .eq("key", testKey)
    .maybeSingle();

  // 5. Read all keys
  const { data: allKeys } = await admin
    .from("app_settings")
    .select("key")
    .order("key");

  return NextResponse.json({
    ok: true,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    test_key: testKey,
    count_before: before,
    count_after: after,
    insert_error: insErr?.message ?? null,
    select_error: selErr?.message ?? null,
    our_row_found: !!our,
    total_rows: allKeys?.length ?? 0,
    all_keys: (allKeys ?? []).map((r) => r.key),
  });
}
