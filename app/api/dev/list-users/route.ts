export const runtime = "edge";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled", { status: 403 });
  }
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("users")
    .select("id, email, name, role, active, created_at")
    .order("created_at", { ascending: true });
  return NextResponse.json({ count: data?.length, users: data, error: error?.message });
}
