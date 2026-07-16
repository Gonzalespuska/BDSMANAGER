export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/team
 *
 * Admin-only — vráti kompletný zoznam členov tímu (obchod / obhliadky /
 * realizacie / admin). Použité v RoleViewDropdown submenu — user hoveruje
 * cez „Obchod" 800ms → uvidí konkrétnych obchodákov a môže rovno
 * impersonovať jednotlivca (žiadny detour cez /admin/agents).
 *
 * User 2026-07-16: „ked podrzim na obchod neviem sekundu a pol tak mi
 * ukaze konkretnych obchodakov a rovanko relizacie obhliadky chapes ze
 * sa rychlejsie dostanem na daneho obchdaka ak chcem previrew jeho
 * profilu".
 */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, name, email, role, active")
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, users: [] },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    users: (data ?? []).map((u) => ({
      id: u.id as string,
      name: (u.name as string | null) ?? null,
      email: u.email as string,
      role: u.role as string,
      active: (u.active as boolean) ?? true,
    })),
  });
}
