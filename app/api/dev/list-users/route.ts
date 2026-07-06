export const runtime = "edge";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertDevOnly } from "@/lib/dev-guard";

export async function GET(request: Request) {
  const blocked = assertDevOnly(request);
  if (blocked) return blocked;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("users")
    .select("id, email, name, role, active, created_at")
    .order("created_at", { ascending: true });
  return NextResponse.json({ count: data?.length, users: data, error: error?.message });
}
