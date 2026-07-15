import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/lead/handover
 *
 * Body:
 *   { lead_id, target_user_id, mode: "inspection" | "realization", note? }
 *
 * Nahradzuje Server Actions handoverToInspectionAction /
 * handoverToRealizationAction — Server Actions v Cloudflare Pages
 * edge runtime nie su spolahlive (často vracaju undefined kvoli
 * revalidatePath ci ineho edge-runtime quirk).
 *
 * REST endpoint je jednoduchsi, testovatelnejsi, a garantuje ze
 * client dostane odpoved (aspon status code + telo).
 */
export async function POST(request: Request) {
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

  let body: {
    lead_id?: string;
    target_user_id?: string;
    mode?: "inspection" | "realization";
    note?: string;
    /** ISO timestamp — kedy je obhliadka/realizácia naplánovaná. */
    scheduled_at?: string;
    /** YYYY-MM-DD — dátum obhliadky, pre calendar_notes.date. */
    scheduled_date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { lead_id, target_user_id, mode, note, scheduled_at, scheduled_date } =
    body;
  if (!lead_id || !target_user_id || !mode) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  if (mode !== "inspection" && mode !== "realization") {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }

  try {
    // Používame admin client — obchádzame RLS. Ownership check robíme sami.
    const sb = createAdminClient();

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("assigned_to, status, name, data")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr) {
      console.error("[handover] leadErr:", leadErr);
      return NextResponse.json(
        { ok: false, error: `db: ${leadErr.message}` },
        { status: 500 },
      );
    }
    if (!lead) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }
    if (lead.assigned_to !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden_not_your_lead" },
        { status: 403 },
      );
    }

    // Overiť target user role
    const expectedRole = mode === "inspection" ? "obhliadky" : "realizacie";
    const { data: target, error: targetErr } = await sb
      .from("users")
      .select("id, role")
      .eq("id", target_user_id)
      .maybeSingle();
    if (targetErr) {
      console.error("[handover] targetErr:", targetErr);
      return NextResponse.json(
        { ok: false, error: `db: ${targetErr.message}` },
        { status: 500 },
      );
    }
    if (!target) {
      return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
    }
    if (target.role !== expectedRole) {
      return NextResponse.json(
        {
          ok: false,
          error: `target_wrong_role: expected ${expectedRole}, got ${target.role}`,
        },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    // Naplánovaný čas z picker-a (dátum + hodina + minúta). Ak nebolo
    // poslané, fallback na now (tak ako pôvodne).
    const scheduledIso = scheduled_at || nowIso;
    const scheduledDate =
      scheduled_date ||
      (scheduled_at ? scheduled_at.slice(0, 10) : nowIso.slice(0, 10));

    // Validácia: realizácia nemôže byť v minulosti (> 12h) — inak by ju
    // auto-transition hneď hodil do won a realizator by ju videl ako
    // dokončenú bez toho aby začal. User 2026-07-11: "dal som si
    // realizaciu z obchodaka a vyhodilo mi ju ako dokoncene".
    if (mode === "realization" && scheduled_at) {
      const scheduledMs = new Date(scheduledIso).getTime();
      const cutoffMs = Date.now() - 12 * 3600 * 1000;
      if (scheduledMs < cutoffMs) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "past_realization_date: dátum realizácie je viac ako 12h v minulosti. Vyber budúci alebo dnešný termín.",
          },
          { status: 400 },
        );
      }
    }

    // Update lead — inspection_at/realization_at je NAPLÁNOVANÝ termín,
    // nie čas kliknutia Potvrdiť. last_activity_at je čas kliknutia.
    // User 2026-07-14: „obchodakova poznamka je privatna. ak chce zdielat
    // s obhliadkarom, prida ju pri handover-i". Handover note ide do
    // lead.data.handover_note (verejná pre obhliadkára/realizátora).
    const currentData = (lead.data as Record<string, unknown> | null) ?? {};
    const dataWithNote = note
      ? {
          ...currentData,
          handover_note: note,
          handover_note_by: user.id,
          handover_note_at: nowIso,
        }
      : currentData;
    const updatePayload =
      mode === "inspection"
        ? {
            status: "needs_inspection",
            inspection_by: target_user_id,
            inspection_at: scheduledIso,
            last_activity_at: nowIso,
            ...(note ? { data: dataWithNote } : {}),
          }
        : {
            status: "in_realization",
            realization_by: target_user_id,
            realization_at: scheduledIso,
            last_activity_at: nowIso,
            ...(note ? { data: dataWithNote } : {}),
          };
    const { error: updErr } = await sb
      .from("leads")
      .update(updatePayload)
      .eq("id", lead_id);
    if (updErr) {
      console.error("[handover] updErr:", updErr);
      return NextResponse.json(
        { ok: false, error: `db_update: ${updErr.message}` },
        { status: 500 },
      );
    }

    // Activity log (best-effort)
    const activityType =
      mode === "inspection"
        ? "handed_over_to_inspection"
        : "handed_over_to_realization";
    const activityData =
      mode === "inspection"
        ? { inspector_id: target_user_id, note: note ?? null, scheduled_at: scheduledIso }
        : { realization_by: target_user_id, note: note ?? null, scheduled_at: scheduledIso };
    const { error: actErr } = await sb.from("lead_activities").insert({
      lead_id,
      user_id: user.id,
      type: activityType,
      data: activityData,
    });
    if (actErr) {
      console.error("[handover] activity insert failed:", actErr);
      // Nie fatal
    }

    // Insert calendar_note aby priradenie bolo VIDITEĽNÉ v kalendári.
    // Body obsahuje meno klienta + rozmery/lokalitu → obchodák aj cieľový
    // user vidia kontext bez toho aby museli otvárať detail leadu.
    // kind='meeting' aby obchodák aj cieľový user videli event.
    const dataObj = (lead.data ?? {}) as Record<string, string | undefined>;
    const m2 = dataObj.plocha ? ` · ${dataObj.plocha} m²` : "";
    const lokalita = dataObj.lokalita ? ` · ${dataObj.lokalita}` : "";
    const priestor = dataObj.priestor ? ` · ${dataObj.priestor}` : "";
    const clientName = lead.name ?? "Klient";
    const emoji = mode === "inspection" ? "🔍" : "🔨";
    const label = mode === "inspection" ? "Obhliadka" : "Realizácia";
    const body = `${emoji} ${label} — ${clientName}${m2}${lokalita}${priestor}`;
    const { error: calErr } = await sb.from("calendar_notes").insert({
      date: scheduledDate,
      body,
      kind: "meeting",
      starts_at: scheduledIso,
      user_id: user.id, // creator
      target_user_id, // priradený obhliadkár/realizátor
      lead_id,
      contact_name: clientName,
    });
    if (calErr) {
      console.error("[handover] calendar_note insert failed:", calErr);
      // Nie fatal — hlavne že lead update prešiel. Log kvôli diagnostike.
    }

    // Notifikácia v zvončeku pre cieľového usera (obhliadkár / realizator).
    // User 2026-07-11: "ked pridam realizaciu realizatorovi musi vybehnut
    // notifikacia zvoncek, teraz ju tam ani nema".
    //
    // Používame office_reminders (rovnaká tabuľka ako pripomienky), s
    // note_kind='lead_note' + lead_id — v /lib/notifications.ts sa
    // takéto rendrujú ako klikateľné lead-notifikácie.
    //
    // remind_at = scheduledIso (deň priradenia) - aby to vyskočilo
    // hneď a target user videl "🔨 Realizácia — Peter Múdry, piatok
    // 10.7. 08:00" v zvončeku.
    const targetName = clientName;
    const scheduledSk = new Date(scheduledIso).toLocaleString("sk-SK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const notifNote =
      mode === "inspection"
        ? `🔍 Nová obhliadka — ${targetName}${m2}${lokalita}${priestor} · ${scheduledSk}`
        : `🔨 Nová realizácia — ${targetName}${m2}${lokalita}${priestor} · ${scheduledSk}`;
    const { error: notifErr } = await sb.from("office_reminders").insert({
      user_id: target_user_id,
      lead_id,
      note: notifNote,
      note_kind: "lead_note",
      // remind_date = dnes → dostupné okamžite v zvončeku
      remind_date: nowIso.slice(0, 10),
      // remind_at = teraz → zoradenie
      remind_at: nowIso,
    });
    if (notifErr) {
      console.error("[handover] notification insert failed:", notifErr);
      // Nie fatal — banner v UI ukáže "priradené" ale zvonček bude prázdny.
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[handover] EXCEPTION:", e);
    return NextResponse.json(
      {
        ok: false,
        error: `server_exception: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 500 },
    );
  }
}
