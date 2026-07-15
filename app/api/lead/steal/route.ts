export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/steal
 *
 * ATOMICKÉ prevzatie leadu z „nedotknutého poolu" iného obchodáka.
 *
 * User 2026-07-15: „musi tam byt nejaka funkcia ktora zabranuje tomu
 * ze obaja naraz zrazu maju ten lead". Preto UPDATE s WHERE
 * podmienkami — DB atomický lock, nie aplikačná race.
 *
 * WHERE podmienky (musia platiť VŠETKY, ináč 0 rowcount):
 *   • lead.id = payload.lead_id
 *   • phone_revealed_at IS NULL (nikto sa ho ešte nedotkol)
 *   • status NOT IN (won, lost, archived)  (nie je uzavretý)
 *   • assigned_to != current user  (netreba stealovat od seba)
 *
 * Ak 0 rowcount → vráti:
 *   • already_yours          (už si ho medzitým vzal iný request)
 *   • already_touched        (pôvodný owner medzitým odhalil číslo)
 *   • already_closed         (medzitým sa lead uzavrel)
 *   • already_taken_by_other (iný obchodák bol o milisekundu skôr)
 *
 * Ak úspech:
 *   • assigned_to = current user
 *   • stolen_at = NOW()
 *   • stolen_from = pôvodný owner (audit)
 *   • lead_activity 'stolen' insert
 *   • navrátený owner môže reklamáciu spraviť u admina.
 *
 * Iba obchodáci a admin môžu volať.
 */
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

  let body: { lead_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  if (!body.lead_id) {
    return NextResponse.json(
      { ok: false, error: "missing_lead_id" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 1) Fetch current stav aby sme vedeli DIAGNOSTIKU pre užívateľa
  //    (prečo sa mu nepodarilo).
  const { data: current } = await admin
    .from("leads")
    .select("id, assigned_to, phone_revealed_at, status")
    .eq("id", body.lead_id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "lead_not_found" },
      { status: 404 },
    );
  }
  if (current.assigned_to === user.id) {
    return NextResponse.json(
      { ok: false, error: "already_yours" },
      { status: 409 },
    );
  }
  if (current.phone_revealed_at !== null) {
    return NextResponse.json(
      { ok: false, error: "already_touched" },
      { status: 409 },
    );
  }
  if (["won", "lost", "archived"].includes(current.status as string)) {
    return NextResponse.json(
      { ok: false, error: "already_closed" },
      { status: 409 },
    );
  }

  // 2) ATOMICKÉ UPDATE — WHERE zabráni race. Ak medzi bodmi 1 a 2 niekto
  //    telefón odhalil alebo lead zavrel, tento UPDATE neupraví žiadny
  //    riadok a my vieme prečo (znova fetchneme stav a povieme userovi).
  const nowIso = new Date().toISOString();
  const prevOwner = current.assigned_to;

  const { data: updated, error: upErr } = await admin
    .from("leads")
    .update({
      assigned_to: user.id,
      stolen_at: nowIso,
      stolen_from: prevOwner,
      last_activity_at: nowIso,
    })
    .eq("id", body.lead_id)
    .is("phone_revealed_at", null)
    .not("status", "in", "(won,lost,archived)")
    .neq("assigned_to", user.id) // race: niekto medzitým vzal
    .select("id, assigned_to")
    .maybeSingle();

  if (upErr) {
    return NextResponse.json(
      { ok: false, error: "update_failed", message: upErr.message },
      { status: 500 },
    );
  }
  if (!updated) {
    // 0 rowcount → re-fetch aby sme povedali user prečo
    const { data: after } = await admin
      .from("leads")
      .select("assigned_to, phone_revealed_at, status")
      .eq("id", body.lead_id)
      .maybeSingle();
    if (after?.phone_revealed_at)
      return NextResponse.json(
        { ok: false, error: "already_touched" },
        { status: 409 },
      );
    if (after && ["won", "lost", "archived"].includes(after.status as string))
      return NextResponse.json(
        { ok: false, error: "already_closed" },
        { status: 409 },
      );
    if (after?.assigned_to && after.assigned_to !== prevOwner)
      return NextResponse.json(
        { ok: false, error: "already_taken_by_other" },
        { status: 409 },
      );
    return NextResponse.json(
      { ok: false, error: "conflict_unknown" },
      { status: 409 },
    );
  }

  // 3) Audit log — kto vzal, komu, kedy.
  try {
    await admin.from("lead_activities").insert({
      lead_id: body.lead_id,
      user_id: user.id,
      type: "stolen",
      data: {
        from_user_id: prevOwner,
        at: nowIso,
      },
    });
  } catch (e) {
    console.warn("[lead/steal] activity log failed:", e);
  }

  return NextResponse.json({ ok: true, stolen_from: prevOwner });
}
