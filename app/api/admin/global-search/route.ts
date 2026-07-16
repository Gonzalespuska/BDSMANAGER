export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/global-search?q=lukacko
 *
 * Admin-wide search — vráti leady (ľubovoľný status, ľubovoľný obchodák)
 * + users (obchodáci / admini) matching query. Používa sa v admin
 * search modaly.
 *
 * User 2026-07-16: „toto vyhladavanie pre admina musis chapat inak
 * admin musi vediet vyhladat cokolvek ci uz lead alebo agenta alebo
 * cokolvek, chcem teraz vyhaldat ten lead misko lukacko a vidiet
 * activity log a pochopit preco ho ma andrej kolar v cp".
 *
 * Pôvodný pool search sa hľadal iba v nedotknutých leadoch → Miško
 * ktorý bol interested s odhaleným číslom sa nenašiel.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (raw.length < 2) {
    return NextResponse.json({ ok: true, leads: [], users: [] });
  }

  const admin = createAdminClient();
  // ilike pattern — case insensitive substring match. Postgres nezvládne
  // diakritiku bez extension → aspoň lowercase pre email.
  const q = raw.toLowerCase();
  const like = `%${q}%`;

  // 1) Leady — podľa mena / emailu / telefónu / lokality / poznámky
  const { data: leadsRaw } = await admin
    .from("leads")
    .select(
      "id, name, phone, email, status, source_type, source_campaign, assigned_to, created_at, last_activity_at, data",
    )
    .or(
      [
        `name.ilike.${like}`,
        `email.ilike.${like}`,
        `phone.ilike.${like}`,
      ].join(","),
    )
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(30);

  // Priprav assigned_name (jeden batch fetch)
  const assignedIds = Array.from(
    new Set(
      (leadsRaw ?? [])
        .map((l) => l.assigned_to as string | null)
        .filter(Boolean) as string[],
    ),
  );
  const userMap = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, name, email")
      .in("id", assignedIds);
    for (const u of users ?? []) {
      const uid = (u as { id: string }).id;
      const name = (u as { name: string | null; email: string }).name;
      const email = (u as { email: string }).email;
      userMap.set(uid, name || email);
    }
  }

  const leads = (leadsRaw ?? []).map((l) => ({
    id: l.id as string,
    name: (l.name as string | null) ?? null,
    phone: (l.phone as string | null) ?? null,
    email: (l.email as string | null) ?? null,
    status: l.status as string,
    source_type: l.source_type as string,
    source_campaign: (l.source_campaign as string | null) ?? null,
    assigned_to: (l.assigned_to as string | null) ?? null,
    assigned_name: l.assigned_to ? userMap.get(l.assigned_to as string) ?? null : null,
    created_at: l.created_at as string,
    last_activity_at: (l.last_activity_at as string | null) ?? null,
    lokalita:
      typeof (l.data as Record<string, unknown> | null)?.lokalita === "string"
        ? ((l.data as Record<string, unknown>).lokalita as string)
        : null,
  }));

  // 2) Users — obchodáci / admini
  const { data: usersRaw } = await admin
    .from("users")
    .select("id, name, email, role, active, capacity")
    .or([`name.ilike.${like}`, `email.ilike.${like}`].join(","))
    .limit(15);

  const users = (usersRaw ?? []).map((u) => ({
    id: (u as { id: string }).id,
    name: (u as { name: string | null }).name,
    email: (u as { email: string }).email,
    role: (u as { role: string }).role,
    active: (u as { active: boolean }).active,
    capacity: (u as { capacity: number | null }).capacity ?? null,
  }));

  return NextResponse.json({ ok: true, leads, users });
}
