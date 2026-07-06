export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/lead/note  — rýchla cesta na uloženie inline poznámky.
 *
 * Predtým to bol Next.js server action ktorý:
 *   1. čítal data zo DB (SELECT)
 *   2. updatel data (UPDATE)
 *   3. insertol audit log (INSERT, awaited)
 *   4. revalidatePath("/agent") + ("/admin") — full route re-render
 *
 * Tu robíme JEDEN UPDATE s Postgres JSONB merge operátorom — žiadne SELECT.
 * Audit log je fire-and-forget. Žiadny revalidatePath — client si urobí
 * router.refresh() iba ak chce.
 *
 * Body: { lead_id: string, note: string }
 */
export async function POST(request: NextRequest) {
  let body: {
    lead_id?: string;
    note?: string;
    /** ISO datetime — obchodák si nastaví pripomienku. Ak set, uloží office_reminder. */
    reminder_at?: string | null;
  };
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

  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const note = (body.note ?? "").trim();
  // Length-limit prevencia DoS — note je v JSONB data, max 4KB
  if (note.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "note_too_long" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // OWNERSHIP: lead patrí mne alebo som admin
  const { data: ownerCheck } = await admin
    .from("leads")
    .select("assigned_to")
    .eq("id", body.lead_id)
    .maybeSingle();
  if (!ownerCheck) {
    return NextResponse.json(
      { ok: false, error: "lead_not_found" },
      { status: 404 },
    );
  }
  if (ownerCheck.assigned_to !== user.id && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_not_your_lead" },
      { status: 403 },
    );
  }

  try {
    // 1 roundtrip: JSONB merge via RPC `update_lead_note`. Ak RPC neexistuje,
    // fallback na klasický UPDATE s read-modify-write.
    const { error } = await admin.rpc("update_lead_note", {
      p_lead_id: body.lead_id,
      p_note: note || null,
      p_now: nowIso,
    });

    if (error) {
      // Fallback path — staré projekty bez RPC
      const { data: existing } = await admin
        .from("leads")
        .select("data")
        .eq("id", body.lead_id)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json(
          { ok: false, error: "not_found" },
          { status: 404 },
        );
      }
      const currentData = (existing.data ?? {}) as Record<string, unknown>;
      const newData = { ...currentData };
      if (note) newData.agent_note = note;
      else delete newData.agent_note;

      const { error: updateError } = await admin
        .from("leads")
        .update({ data: newData, last_activity_at: nowIso })
        .eq("id", body.lead_id);
      if (updateError) {
        // Log full DB error server-side; vrátime generic message bez schema details
        console.error("[lead/note] DB update failed:", updateError.message);
        return NextResponse.json(
          { ok: false, error: "db_error" },
          { status: 500 },
        );
      }
    }

    // Fire-and-forget audit log (nečakáme na response — speed wins)
    admin
      .from("lead_activities")
      .insert({
        lead_id: body.lead_id,
        user_id: user.id,
        type: "note_added",
        data: {
          note: note || null,
          source: "inline",
          reminder_at: body.reminder_at ?? null,
        },
      })
      .then(() => {})
      .catch((e) => console.warn("[note] audit log failed:", e));

    // Pripomienka — ak obchodák zvolil čas, uložíme do office_reminders.
    // Cieľ pripomienky = lead.assigned_to (obchodák ktorý vlastní lead).
    // Ak nemá vlastníka, padne na user.id (autora poznámky).
    if (body.reminder_at && note) {
      const rDate = new Date(body.reminder_at);
      if (!isNaN(rDate.getTime()) && rDate.getTime() > Date.now() - 60_000) {
        const targetUserId = ownerCheck.assigned_to ?? user.id;
        admin
          .from("office_reminders")
          .insert({
            user_id: targetUserId,
            lead_id: body.lead_id,
            note: note,
            remind_at: rDate.toISOString(),
            remind_date: rDate.toISOString().slice(0, 10),
            note_kind: "lead_note",
          })
          .then((r) => {
            if (r.error) console.warn("[note] reminder save failed:", r.error.message);
          })
          .catch((e) => console.warn("[note] reminder save exception:", e));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
