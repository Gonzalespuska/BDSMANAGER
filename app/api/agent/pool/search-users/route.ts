export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agent/pool/search-users?q=…&role=…
 *
 * Hľadá používateľov (obchodáci, obhliadkari, realizátori, admin) podľa
 * mena / emailu. Voliteľný `role` filter zúži výsledky. Pre PoolSearchDrawer.
 *
 * User 2026-07-15: „vedla dam dropdown ze obchodaci tak tam najde napr
 * profil mojho obchodaka, atd viac veci nech to vie vyhladat".
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", items: [] },
      { status: 401 },
    );
  }
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "role_denied", items: [] },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const roleFilter = (url.searchParams.get("role") ?? "").toLowerCase();
  if (q.length < 1) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const admin = createAdminClient();

  const escaped = q.replace(/[,%]/g, " ").trim();
  let query = admin
    .from("users")
    .select("id, name, email, role, active, avatar_url, phone")
    .or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
    .order("name", { ascending: true })
    .limit(15);
  if (
    roleFilter === "obchod" ||
    roleFilter === "obhliadky" ||
    roleFilter === "realizacie" ||
    roleFilter === "admin" ||
    roleFilter === "office" ||
    roleFilter === "skolenie"
  ) {
    query = query.eq("role", roleFilter);
  }
  const { data: rows } = await query;

  return NextResponse.json({
    ok: true,
    items: (rows ?? []).map((u) => ({
      id: u.id as string,
      name: (u.name as string) || (u.email as string),
      email: u.email as string,
      role: (u.role as string) ?? "user",
      active: !!u.active,
      avatar_url: (u.avatar_url as string | null) ?? null,
      phone: (u.phone as string | null) ?? null,
    })),
  });
}
