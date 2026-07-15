export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/lead/action — unified endpoint pre rýchle akcie na leade.
 *
 * Server actions sú v edge runtime občas nespoľahlivé (response stream môže
 * vrátiť undefined → t.ok TypeError). Tento route handler obchádza problém
 * cez klasický fetch.
 *
 * Body: { lead_id, action, ...data }
 *
 * Akcie:
 *   - "missed_call"       → call_attempts++, status='no_answer', next_callback_at
 *   - "archive"           → status='archived'
 *   - "contact"           → status='phone_revealed', last_activity_at=NOW
 *   - "change_status"     → status=<new_status>, last_activity_at=NOW
 *   - "claim"             → assigned_to=current user (ak je unassigned)
 *   - "return"            → assigned_to=NULL (ak ho vlastním)
 *   - "outcome"           → status=won/lost, plus value_estimate
 */
type ActionType =
  | "missed_call"
  | "archive"
  | "contact"
  | "change_status"
  | "claim"
  | "return"
  | "outcome";

const NEXT_CALLBACK_HOURS: Record<number, number> = {
  1: 4, // 1× → 4h
  2: 24, // 2× → 24h
  3: 24, // 3× → 24h
};

export async function POST(request: NextRequest) {
  let body: {
    lead_id?: string;
    action?: ActionType;
    new_status?: string;
    won_value?: number;
    note?: string;
    /** Voliteľne pre missed_call — obchodák si vyberie kedy pripomenieme (1/3/6h). */
    reminder_hours?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body.lead_id || !body.action) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
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

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // OWNERSHIP gate: pre všetky akcie mimo "claim" musí byť lead môj alebo
  // ja som admin. "claim" má vlastnú race-safe logiku (WHERE assigned_to IS NULL).
  // "return" má vlastnú kontrolu (WHERE assigned_to = me).
  if (body.action !== "claim" && body.action !== "return") {
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
    if (
      ownerCheck.assigned_to &&
      ownerCheck.assigned_to !== user.id &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        { ok: false, error: "forbidden_not_your_lead" },
        { status: 403 },
      );
    }
  }

  // Validate change_status / outcome new_status against allowed enum
  const ALLOWED_STATUSES = [
    "new",
    "phone_revealed",
    "no_answer",
    "scheduled",
    "interested",
    "quote_sent",
    "not_interested",
    "won",
    "lost",
    "archived",
  ];
  if (
    (body.action === "change_status" || body.action === "outcome") &&
    body.new_status &&
    !ALLOWED_STATUSES.includes(body.new_status)
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_status" },
      { status: 400 },
    );
  }

  try {
    switch (body.action) {
      case "missed_call": {
        // Načítaj aktuálny call_attempts
        const { data: lead } = await admin
          .from("leads")
          .select("call_attempts")
          .eq("id", body.lead_id)
          .maybeSingle();
        if (!lead) {
          return NextResponse.json(
            { ok: false, error: "not_found" },
            { status: 404 },
          );
        }
        const attempts = (lead.call_attempts ?? 0) + 1;
        // Custom reminder z UI dropdown-u (1/3/6h) má prednosť, inak default heuristika
        const customHours =
          typeof body.reminder_hours === "number" &&
          body.reminder_hours > 0 &&
          body.reminder_hours <= 168
            ? body.reminder_hours
            : null;
        const hoursAhead = customHours ?? NEXT_CALLBACK_HOURS[attempts] ?? null;
        const nextCallback = hoursAhead
          ? new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString()
          : null;

        const { error } = await admin
          .from("leads")
          .update({
            call_attempts: attempts,
            status: "no_answer",
            next_callback_at: nextCallback,
            last_activity_at: nowIso,
          })
          .eq("id", body.lead_id);
        if (error) throw new Error(error.message);

        // ═══════════════════════════════════════════════════════════════
        // TODO — AUTO SMS PRI NEZDVIHOL (bude implementované vo fáze 2)
        // ═══════════════════════════════════════════════════════════════
        // Keď obchodák stlačí "Nezdvihol" (missed_call) → status='no_answer'
        // → PARALELNE POSLAŤ SMS klientovi Z ČÍSLA OBCHODÁKA.
        //
        // Šablóna SMS (Slovensky):
        //   "Dobrý deň, volal som Vám ohľadom cenovej ponuky epoxidových
        //   podláh (Epoxidovo). Zavolajte prosím späť keď budete voľní.
        //   Ďakujem, {agent.name} · {agent.phone}"
        //
        // Implementácia (fáza 2):
        //   1. Poskytovateľ: Twilio Programmable Messaging alebo O2 SK API
        //   2. Číslo odosielateľa = agent.phone z users tabuľky
        //   3. Uložiť SMS log do novej lead_sms_log tabuľky (timestamp,
        //      status delivered/failed, cost) pre audit
        //   4. Rate limit — max 1 SMS na lead za 24h aby sme neotravovali
        //   5. Feature flag app_settings.sms_auto_missed_call = true/false
        //      aby sa dalo vypnúť
        //   6. Odchádzajúce z čísla obchodáka: caller ID whitelist / verify
        //      pri poskytovateľovi
        //
        // Aktuálne: iba log activity — SMS neposielame.
        // ═══════════════════════════════════════════════════════════════

        admin
          .from("lead_activities")
          .insert({
            lead_id: body.lead_id,
            user_id: user.id,
            type: "call_missed",
            data: {
              attempts,
              reminder_in_hours: hoursAhead,
              reminder_at: nextCallback,
              chosen_by_user: !!customHours,
            },
          })
          .then(() => {})
          .catch(() => {});

        return NextResponse.json({
          ok: true,
          attempts,
          reminder_in_hours: hoursAhead,
        });
      }

      case "archive": {
        const { error } = await admin
          .from("leads")
          .update({ status: "archived", last_activity_at: nowIso })
          .eq("id", body.lead_id);
        if (error) throw new Error(error.message);
        admin
          .from("lead_activities")
          .insert({
            lead_id: body.lead_id,
            user_id: user.id,
            type: "status_changed",
            data: { to: "archived" },
          })
          .then(() => {})
          .catch(() => {});
        return NextResponse.json({ ok: true });
      }

      case "trash": {
        // User 2026-07-14: „novy status kos" — mrtvý lead, žiadny follow-up.
        // Nastavíme status='trash'. Ak CHECK constraint zakazuje trash value,
        // fallback na 'archived' + flag v data. Migrácia 42 CHECK rozšíri.
        const trashUpdate = await admin
          .from("leads")
          .update({
            status: "trash",
            last_activity_at: nowIso,
            assigned_to: null,
          })
          .eq("id", body.lead_id);
        if (trashUpdate.error && /check constraint|invalid input/i.test(trashUpdate.error.message)) {
          // Fallback: použi archived + flag data.trashed=true.
          const { data: cur } = await admin
            .from("leads")
            .select("data")
            .eq("id", body.lead_id)
            .maybeSingle();
          const merged = {
            ...((cur?.data as Record<string, unknown> | null) ?? {}),
            trashed: true,
            trashed_at: nowIso,
            trashed_by: user.id,
          };
          const retry = await admin
            .from("leads")
            .update({
              status: "archived",
              data: merged,
              last_activity_at: nowIso,
              assigned_to: null,
            })
            .eq("id", body.lead_id);
          if (retry.error) throw new Error(retry.error.message);
        } else if (trashUpdate.error) {
          throw new Error(trashUpdate.error.message);
        }
        admin
          .from("lead_activities")
          .insert({
            lead_id: body.lead_id,
            user_id: user.id,
            type: "status_changed",
            data: { to: "trash" },
          })
          .then(() => {})
          .catch(() => {});
        return NextResponse.json({ ok: true });
      }

      case "contact": {
        // Agent klikol "Kontakt" — zákazník zdvihol → presun do phone_revealed
        const { error } = await admin
          .from("leads")
          .update({
            status: "phone_revealed",
            last_activity_at: nowIso,
          })
          .eq("id", body.lead_id);
        if (error) throw new Error(error.message);
        admin
          .from("lead_activities")
          .insert({
            lead_id: body.lead_id,
            user_id: user.id,
            type: "call_answered",
          })
          .then(() => {})
          .catch(() => {});
        return NextResponse.json({ ok: true });
      }

      case "change_status": {
        if (!body.new_status) {
          return NextResponse.json(
            { ok: false, error: "missing_new_status" },
            { status: 400 },
          );
        }
        // ADMIN-ONLY: manuálny prechod na "won".
        // Won sa AUTO-nastaví keď realization_at prejde (agent/page.tsx
        // filter). Obchodák tento status nesmie sám nastaviť aby sa
        // predišlo nafukovaniu čísel.
        if (body.new_status === "won" && user.role !== "admin") {
          return NextResponse.json(
            {
              ok: false,
              error: "won_admin_only",
              message:
                "Status 'Won' môže nastaviť iba admin. Automaticky sa nastaví keď prejde termín realizácie.",
            },
            { status: 403 },
          );
        }
        const { error } = await admin
          .from("leads")
          .update({ status: body.new_status, last_activity_at: nowIso })
          .eq("id", body.lead_id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      case "claim": {
        // Update s WHERE assigned_to IS NULL (race-safe)
        const { data, error } = await admin
          .from("leads")
          .update({ assigned_to: user.id, last_activity_at: nowIso })
          .eq("id", body.lead_id)
          .is("assigned_to", null)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          return NextResponse.json(
            { ok: false, error: "already_claimed" },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true });
      }

      case "return": {
        const { data, error } = await admin
          .from("leads")
          .update({ assigned_to: null, last_activity_at: nowIso })
          .eq("id", body.lead_id)
          .eq("assigned_to", user.id)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          return NextResponse.json(
            { ok: false, error: "not_yours_or_not_found" },
            { status: 403 },
          );
        }
        return NextResponse.json({ ok: true });
      }

      case "outcome": {
        if (!body.new_status) {
          return NextResponse.json(
            { ok: false, error: "missing_new_status" },
            { status: 400 },
          );
        }
        const update: Record<string, unknown> = {
          status: body.new_status,
          last_activity_at: nowIso,
        };
        if (typeof body.won_value === "number" && body.won_value >= 0) {
          update.value_estimate = body.won_value;
        }
        const { error } = await admin
          .from("leads")
          .update(update)
          .eq("id", body.lead_id);
        if (error) throw new Error(error.message);
        admin
          .from("lead_activities")
          .insert({
            lead_id: body.lead_id,
            user_id: user.id,
            type: "status_changed",
            data: {
              to: body.new_status,
              note: body.note ?? null,
              value: body.won_value ?? null,
            },
          })
          .then(() => {})
          .catch(() => {});
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { ok: false, error: "unknown_action" },
          { status: 400 },
        );
    }
  } catch (e) {
    console.error(`[lead-action ${body.action}] failed:`, e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
