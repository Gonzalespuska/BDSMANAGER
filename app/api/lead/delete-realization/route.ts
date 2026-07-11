export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/delete-realization
 * Body: { lead_id, reason }
 *
 * Obchodák zruší priradenú realizáciu. Lead sa vráti do 'quote_sent'
 * (Finálna CP), aby ju mohol znovu priradiť s novým dátumom/realizatorom.
 *
 * User: "obchodak moze mazat realizacie ale nech to chodi adminovi ako
 * osobitne upozornenie ze to vymazal a nech tam je aj dovod vymazania".
 *
 * Kroky:
 *   1. Reset lead: status='quote_sent', realization_by=null, realization_at=null
 *   2. Zmaz relevantne calendar_notes (kind='meeting' s realiz body)
 *   3. Insert do office_reminders → admin dostane notifikaciu
 *   4. Audit log lead_activities
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_wrong_role" },
      { status: 403 },
    );
  }

  let body: { lead_id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const leadId = body.lead_id;
  const reason = (body.reason ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "missing_reason" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Načítaj lead pre audit
  const { data: lead } = await admin
    .from("leads")
    .select("id, name, realization_by, realization_at, assigned_to, status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }

  // Reset — vráti sa do Finálna CP aby ju obchodák mohol znovu priradiť
  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("leads")
    .update({
      status: "quote_sent",
      realization_by: null,
      realization_at: null,
      last_activity_at: nowIso,
    })
    .eq("id", leadId);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: `db_update: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Zmaz calendar_notes o realizácii
  await admin
    .from("calendar_notes")
    .delete()
    .eq("lead_id", leadId)
    .like("body", "%realiz%");

  // Nájdi adminov — každý dostane oznámenie
  const { data: admins } = await admin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);

  // Insert office_reminders pre každého admina — objaví sa ako 'admin_task'
  // v /notifikacie zvončeku
  const reminderRows = (admins ?? []).map((a) => ({
    user_id: a.id as string,
    lead_id: leadId,
    note: `⚠ Realizácia zrušená obchodákom (${user.name ?? user.email}) — klient „${lead.name}": ${reason}`,
    note_kind: "lead_note",
    remind_date: nowIso.slice(0, 10),
    remind_at: nowIso,
  }));
  if (reminderRows.length > 0) {
    await admin.from("office_reminders").insert(reminderRows);
  }

  // Audit log
  admin
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      user_id: user.id,
      type: "realization_cancelled",
      data: {
        reason,
        previous_realization_by: lead.realization_by,
        previous_realization_at: lead.realization_at,
      },
    })
    .then(() => {});

  return NextResponse.json({ ok: true });
}
