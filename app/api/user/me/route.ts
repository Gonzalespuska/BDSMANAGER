import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/user/me — vráti základné info o prihlásenom userovi
 * pre použitie v client komponentoch (napr. email signature).
 *
 * Response: { id, name, email, phone } alebo 401 keď nie je auth.
 */
export async function GET() {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  // Fetch phone (nie je v getCurrentAppUser vrátane)
  let phone: string | null = null;
  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("users")
      .select("phone")
      .eq("id", me.id)
      .maybeSingle();
    phone = (data?.phone as string | null) ?? null;
  } catch {
    // ignore — phone je optional
  }
  return NextResponse.json(
    {
      id: me.id,
      name: me.name,
      email: me.email,
      phone,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
