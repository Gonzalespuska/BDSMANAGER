export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DEBUG endpoint — vráti raw obsah app_settings + počet.
 * User 2026-07-12: „ty kokot nejde to". Zisťujem prečo /admin/nastavenia
 * hlási „Žiadne nastavenia" keď health check hovorí že tabuľka má 11 riadkov.
 */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("app_settings")
    .select("key, value, label, description", { count: "exact" })
    .order("key");

  return NextResponse.json({
    ok: !error,
    count,
    error: error?.message ?? null,
    rows_returned: data?.length ?? 0,
    keys: (data ?? []).map((r) => r.key),
    firma_keys: (data ?? [])
      .filter((r) =>
        r.key.startsWith("company.") ||
        r.key.startsWith("pdf.") ||
        r.key.startsWith("email."),
      )
      .map((r) => r.key),
    transport_keys: (data ?? [])
      .filter((r) => r.key.startsWith("transport."))
      .map((r) => r.key),
    sample_first_3: (data ?? []).slice(0, 3),
  });
}
