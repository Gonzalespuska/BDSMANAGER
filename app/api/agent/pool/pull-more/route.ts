export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/agent/pool/pull-more
 *
 * User 2026-07-16: „urob manualne tlacdilo v pripade ze obchodakovi
 * dojdu nove leady ze vsetky obvolal tak stlaci to a prida mu to xy
 * leadov z poolu ktore su nedotknute takze ich zobere niekomu inemu,
 * dajme tomu 5 leadov za kazde stlacenie a nech to bere plosne ze
 * zobere kazdemu obchodakovi 1 nie jednemu 5".
 *
 * Distribuovaný pull:
 *   1. Nájde všetky untouched leady (phone_revealed_at IS NULL,
 *      status NOT IN won/lost/archived) IBA od OSTATNÝCH aktívnych
 *      obchodákov (nie tých čo som ja).
 *   2. Zoradí podľa created_at ASC (najstarší untouched prvý — LRU).
 *   3. Round-robin cez ownerov: 1 lead z každého owner-a, potom druhý
 *      cyklus, atď. — kým nemám `count` leadov (default 5) alebo
 *      žiadne ďalšie nie sú dostupné.
 *   4. Atomicky prepíše assigned_to = ja pre tieto leady.
 *
 * Response: { ok: true, transferred: number, breakdown: [{from_name, count}] }
 *
 * Body: { count?: number } — default 5, max 20.
 */
const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "role_denied" },
      { status: 403 },
    );
  }

  let body: { count?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* body is optional */
  }
  const wantCount = Math.min(
    MAX_COUNT,
    Math.max(1, Math.floor(body.count ?? DEFAULT_COUNT)),
  );

  const admin = createAdminClient();

  // 1) Untouched leady od OSTATNÝCH aktívnych obchodákov, oldest first.
  const { data: candidates } = await admin
    .from("leads")
    .select("id, name, assigned_to, created_at")
    .is("phone_revealed_at", null)
    .not("status", "in", "(won,lost,archived)")
    .not("assigned_to", "is", null)
    .neq("assigned_to", user.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      transferred: 0,
      breakdown: [],
      message: "Žiadne nedotknuté leady u kolegov na prevzatie.",
    });
  }

  // 2) Metadáta ownerov (kvôli breakdown názvom).
  // User 2026-07-16: „ked stlacim tak to nefunguje... napise ze niesu
  // zaidni aktivny kolegovia oprav to nech to dovoli". Pôvodne sme
  // vyžadovali active=true + role=obchod. Teraz iba blokujeme realizatori
  // (ich leady sú vo fáze realizácie, nesmú sa kradnúť) a paused (vacation
  // = respekt). Deaktivovaní / admin-owned / obhliadkári — všetci ok
  // na prevzatie ich untouched leadov.
  const ownerIds = Array.from(
    new Set(candidates.map((c) => c.assigned_to as string)),
  );
  const { data: owners } = await admin
    .from("users")
    .select("id, name, email, role, active, paused_until")
    .in("id", ownerIds);
  const nowIso = new Date().toISOString();
  const eligibleOwners = new Map<string, { name: string }>();
  for (const o of owners ?? []) {
    const paused =
      o.paused_until && (o.paused_until as string) > nowIso;
    // Realizator je na stavbe — jeho leady zostávajú v pipeline.
    // Paused (vacation) — nesahať.
    if (o.role === "realizacie" || paused) continue;
    eligibleOwners.set(o.id as string, {
      name: (o.name as string) || (o.email as string) || "kolega",
    });
  }
  const eligible = candidates.filter((c) =>
    eligibleOwners.has(c.assigned_to as string),
  );
  if (eligible.length === 0) {
    return NextResponse.json({
      ok: true,
      transferred: 0,
      breakdown: [],
      message:
        "Žiadne nedotknuté leady k prevzatiu (všetky sú u realizátorov alebo obchodákov na dovolenke).",
    });
  }

  // 3) Round-robin selection — 1 na owner-a per cyklus, oldest first.
  const byOwner = new Map<string, typeof eligible>();
  for (const c of eligible) {
    const arr = byOwner.get(c.assigned_to as string) ?? [];
    arr.push(c);
    byOwner.set(c.assigned_to as string, arr);
  }
  const ownerQueue = Array.from(byOwner.keys());
  const picked: Array<{ id: string; from_id: string; name: string }> = [];
  let cycle = 0;
  while (picked.length < wantCount) {
    let anyPickedThisCycle = false;
    for (const oid of ownerQueue) {
      if (picked.length >= wantCount) break;
      const arr = byOwner.get(oid)!;
      if (arr.length > cycle) {
        const c = arr[cycle];
        picked.push({
          id: c.id as string,
          from_id: c.assigned_to as string,
          name: (c.name as string) || "bez mena",
        });
        anyPickedThisCycle = true;
      }
    }
    if (!anyPickedThisCycle) break; // vyčerpaný pool
    cycle++;
  }

  if (picked.length === 0) {
    return NextResponse.json({
      ok: true,
      transferred: 0,
      breakdown: [],
      message: "Nič na prevzatie.",
    });
  }

  // 4) Atomicky prepíšeme assigned_to = user.id (batch update).
  //    Bezpečnostné WHERE — leady sú stále untouched. Ak medzitým
  //    niektorý bol dotknutý, ostatné prejdú v poriadku.
  const idsToTake = picked.map((p) => p.id);
  const { data: updated, error: upErr } = await admin
    .from("leads")
    .update({
      assigned_to: user.id,
      stolen_at: new Date().toISOString(),
      // stolen_from ostáva pôvodný — batch update to nevie po id-ovo,
      // audit sa uloží iba v lead_activities.
      last_activity_at: new Date().toISOString(),
    })
    .in("id", idsToTake)
    .is("phone_revealed_at", null)
    .not("status", "in", "(won,lost,archived)")
    .select("id, assigned_to");
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: "update_failed", detail: upErr.message },
      { status: 500 },
    );
  }
  const actuallyTakenIds = new Set(
    (updated ?? []).map((r) => r.id as string),
  );
  const actuallyTaken = picked.filter((p) => actuallyTakenIds.has(p.id));

  // 5) Audit log per lead (best-effort).
  try {
    await admin.from("lead_activities").insert(
      actuallyTaken.map((p) => ({
        lead_id: p.id,
        user_id: user.id,
        type: "pool_pull_more",
        data: { from_user_id: p.from_id, batch: true },
      })),
    );
  } catch (e) {
    console.warn("[pull-more] activity log failed:", e);
  }

  // 6) Breakdown na frontend — koľko od koho.
  const perOwner = new Map<string, number>();
  for (const p of actuallyTaken) {
    perOwner.set(p.from_id, (perOwner.get(p.from_id) ?? 0) + 1);
  }
  const breakdown = Array.from(perOwner.entries()).map(([oid, cnt]) => ({
    from_name: eligibleOwners.get(oid)?.name ?? "kolega",
    count: cnt,
  }));

  return NextResponse.json({
    ok: true,
    transferred: actuallyTaken.length,
    requested: wantCount,
    breakdown,
  });
}
