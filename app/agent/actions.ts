"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Server Action — agent klikol "Zobraziť číslo" na karte.
 *
 * Logika:
 *   1. Skontroluje že user je prihlásený
 *   2. Načíta lead a jeho sla_deadline
 *   3. Vyhodnotí SLA — porovná NOW vs deadline → met / breached
 *   4. Update lead: phone_revealed_at, phone_revealed_by, status, sla_status
 *   5. Vytvorí lead_activity type='phone_revealed'
 *   6. Revaliduje /agent stránku
 */
export async function revealPhoneAction(
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Načítaj lead pre SLA vyhodnotenie + ownership check
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sla_deadline, sla_status, status, phone_revealed_at, assigned_to")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return { ok: false, error: "not_found" };
  }

  // Defense in depth — RLS by toto malo blokovať, ale explicit check zabráni
  // privilege escalation ak by sa v budúcnosti switchol na createAdminClient.
  if (lead.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  // Ak už bol odhalený, nič nemeníme
  if (lead.phone_revealed_at) {
    return { ok: true };
  }

  // SLA vyhodnotenie
  let newSlaStatus = lead.sla_status;
  if (lead.sla_status === "pending" && lead.sla_deadline) {
    newSlaStatus = now <= new Date(lead.sla_deadline) ? "met" : "breached";
  }

  // Status sa NEMENÍ na phone_revealed — to by lead presunulo z Nové do
  // Kontakt tabu okamžite. Lead je "Kontakt" až keď agent skutočne volal
  // a klikol "Kontakt" button. Po reveal-i len logujeme čas + SLA.
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      phone_revealed_at: nowIso,
      phone_revealed_by: user.id,
      sla_status: newSlaStatus,
      last_activity_at: nowIso,
      first_contact_at: nowIso,
    })
    .eq("id", leadId);

  if (updateError) {
    console.error("[revealPhone] update failed:", updateError.message);
    return { ok: false, error: updateError.message };
  }

  // Audit log
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "phone_revealed",
    data: { sla_status: newSlaStatus, sla_deadline: lead.sla_deadline },
  });

  revalidatePath("/agent");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Server Action — agent klikol "NEDVÍHA" tlačidlo.
 * Workflow podľa spec:
 *   1× → next_callback_at = NOW + 4h
 *   2× → next_callback_at = NOW + 24h
 *   3× → next_callback_at = NOW + 24h
 *   4+× → ostáva v Nedvíha, agent manuálne klikne "Archivovať"
 *         (archiveLeadAction) keď usúdi že lead je mŕtvy.
 *
 * Auto-archive sme vypli — agent rozhoduje kedy ide do archivu, a vtedy
 * sa pošle SMS+Email follow-up zákazníkovi.
 */
const MISSED_REMINDER_HOURS: Record<number, number> = {
  1: 4,
  2: 24,
  3: 24,
};

export async function recordMissedCallAction(
  leadId: string,
): Promise<{ ok: true; attempts: number } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, call_attempts, status, assigned_to")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) return { ok: false, error: "not_found" };
  if (lead.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const newAttempts = lead.call_attempts + 1;
  const reminderHours = MISSED_REMINDER_HOURS[newAttempts] ?? 24;
  const next = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      call_attempts: newAttempts,
      status: "no_answer",
      next_callback_at: next.toISOString(),
      last_activity_at: nowIso,
    })
    .eq("id", leadId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "call_missed",
    data: {
      attempt_number: newAttempts,
      reminder_at: next.toISOString(),
      reminder_in_hours: reminderHours,
    },
  });

  revalidatePath("/agent");
  return { ok: true, attempts: newAttempts };
}

/**
 * Server Action — manuálne archivovať lead z Nedvíha (po >= 3 pokusoch).
 *
 * Spustí SMS+Email follow-up (zatiaľ placeholder — log do lead_activities
 * s TODO flagom). Po nasadení Resendu + SMS providera tu spustíme reálnu
 * notifikáciu zákazníkovi typu:
 *   "Skúšali sme sa Vám viackrát dovolať. Ak máte stále záujem, ozvite sa nám."
 */
export async function archiveLeadAction(
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: lead, error: readError } = await supabase
    .from("leads")
    .select("id, call_attempts, phone, email, name, assigned_to")
    .eq("id", leadId)
    .maybeSingle();

  if (readError || !lead) return { ok: false, error: "not_found" };

  if (lead.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "Tento lead nie je tvoj" };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      status: "archived",
      next_callback_at: null,
      last_activity_at: nowIso,
    })
    .eq("id", leadId);

  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "manually_archived",
    data: {
      attempts: lead.call_attempts,
      sms_sent: false, // bude true keď nasadíme SMS API
      email_sent: false, // bude true keď nasadíme Resend template
      target_phone: lead.phone,
      target_email: lead.email,
      TODO: "Pripojiť Resend + SMS pre auto-notifikáciu zákazníka",
    },
  });

  console.warn(
    `[archiveLead] Lead ${leadId} (${lead.name}) archivovaný — SMS+Email placeholder. Treba pripojiť provider.`,
  );

  revalidatePath("/agent");
  return { ok: true };
}

/**
 * Server Action — update status leadu + voliteľná poznámka + next_callback_at
 * (z modálu "Výsledok hovoru").
 */
export async function updateLeadOutcomeAction(formData: FormData): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const leadId = String(formData.get("lead_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const callbackAt = String(formData.get("callback_at") ?? "").trim();

  if (!leadId || !status) {
    return { ok: false, error: "missing_fields" };
  }

  const validStatuses = [
    "interested",
    "not_interested",
    "quote_sent",
    "scheduled",
    "won",
    "lost",
  ];
  if (!validStatuses.includes(status)) {
    return { ok: false, error: "invalid_status" };
  }

  const supabase = await createClient();

  // Ownership check
  const { data: ownerLead, error: ownerErr } = await supabase
    .from("leads")
    .select("assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  if (ownerErr || !ownerLead) return { ok: false, error: "not_found" };
  if (ownerLead.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    status,
    last_activity_at: nowIso,
  };

  if (status === "scheduled" && callbackAt) {
    update.next_callback_at = callbackAt;
  } else if (status !== "scheduled") {
    update.next_callback_at = null;
  }

  const { error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "status_changed",
    data: {
      new_status: status,
      note: note || null,
      callback_at: callbackAt || null,
    },
  });

  if (note) {
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      user_id: user.id,
      type: "note_added",
      data: { note },
    });
  }

  revalidatePath("/agent");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Server Action — inline status zmena z karty (status picker dropdown).
 */
export async function changeStatusInlineAction(
  leadId: string,
  newStatus: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const valid = [
    "new",
    "phone_revealed",
    "no_answer",
    "scheduled",
    "interested",
    "not_interested",
    "quote_sent",
    "won",
    "lost",
    "archived",
  ];
  if (!valid.includes(newStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  const supabase = await createClient();

  // Ownership check
  const { data: ownerLead, error: ownerErr } = await supabase
    .from("leads")
    .select("assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  if (ownerErr || !ownerLead) return { ok: false, error: "not_found" };
  if (ownerLead.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("leads")
    .update({ status: newStatus, last_activity_at: nowIso })
    .eq("id", leadId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "status_changed",
    data: { new_status: newStatus, source: "inline_picker" },
  });

  revalidatePath("/agent");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Server Action — uloží inline poznámku do `lead.data.agent_note`.
 *
 * Používame JSONB `data` namiesto novej kolumny, aby sme sa vyhli migrácii.
 * (V budúcnosti môžeme presunúť do dedikovaného `agent_notes` stĺpca.)
 */
export async function saveLeadNoteAction(
  leadId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();

  // Načítame existing data + ownership check
  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("data, assigned_to")
    .eq("id", leadId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const currentData = (existing.data ?? {}) as Record<string, unknown>;
  const newData = { ...currentData, agent_note: note.trim() || undefined };
  // Odstráň agent_note keď je prázdny string
  if (!note.trim()) delete newData.agent_note;

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("leads")
    .update({ data: newData, last_activity_at: nowIso })
    .eq("id", leadId);

  if (updateError) return { ok: false, error: updateError.message };

  // Audit log (best-effort)
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "note_added",
    data: { note: note.trim() || null, source: "inline" },
  });

  revalidatePath("/agent");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Server Action — claim unassigned lead.
 *
 * Logika:
 *   1. Skontroluje že lead je naozaj unassigned (assigned_to IS NULL).
 *   2. Atomicky update-ne assigned_to na current user.id.
 *   3. Audit log (lead_activities type=claimed).
 *   4. Revaliduje /agent.
 */
export async function claimLeadAction(
  leadId: string,
): Promise<
  | { ok: true; user_name: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user — peter z DB nenájdený" };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Atomicky claim — update s WHERE assigned_to IS NULL
  // Ak medzi tým niekto iný claimol, vráti zero rows = race lost.
  const { data: claimed, error: claimError } = await supabase
    .from("leads")
    .update({ assigned_to: user.id, last_activity_at: nowIso })
    .eq("id", leadId)
    .is("assigned_to", null)
    .select("id")
    .maybeSingle();

  if (claimError) return { ok: false, error: claimError.message };
  if (!claimed) {
    return {
      ok: false,
      error: "Lead už pridelil niekto iný (alebo neexistuje).",
    };
  }

  // Audit log
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "claimed",
    data: { by: user.email },
  });

  revalidatePath("/agent");
  return { ok: true, user_name: user.name };
}

/**
 * Server Action — vrátiť lead späť do systému (opak claim).
 *
 *   assigned_to → NULL  → lead sa znova zobrazí v "Nové" tabe iným agentom
 *   ako voľný (s ClaimBanner-om "Prevezmi").
 *
 * Audit log type='returned'.
 */
export async function returnLeadAction(
  leadId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user — peter z DB nenájdený" };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Iba môj vlastný lead môžem vrátiť (alebo admin hocijaký — TODO)
  const { data: lead, error: readError } = await supabase
    .from("leads")
    .select("assigned_to, status")
    .eq("id", leadId)
    .maybeSingle();

  if (readError || !lead) {
    return { ok: false, error: "Lead nenájdený" };
  }
  if (lead.assigned_to !== user.id && user.role !== "admin") {
    return { ok: false, error: "Tento lead nie je tvoj" };
  }

  // Reset → assigned_to = NULL, status = "new" (predvolený stav nepriradeného)
  // Ale ak je už vo finálnom stave (won/lost/archived), nevrátime ho
  if (["won", "lost", "archived"].includes(lead.status)) {
    return {
      ok: false,
      error: "Ukončené leady sa nedajú vrátiť do systému",
    };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      assigned_to: null,
      // Po vrátení status resetneme na 'new' iba ak bol vo "Volá sa"
      // (phone_revealed) — inak ostane (no_answer, scheduled, ...).
      status: lead.status === "phone_revealed" ? "new" : lead.status,
      last_activity_at: nowIso,
    })
    .eq("id", leadId);

  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "returned",
    data: { by: user.email, reason: reason ?? null },
  });

  revalidatePath("/agent");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// ROLE HANDOFF — obchodník posúva zákazku do obhliadky / realizácie
// ═══════════════════════════════════════════════════════════════════════

/**
 * Server Action — vylistuje aktívnych userov podľa role pre handoff dropdown.
 * Bez ownership checku (každý prihlásený môže vidieť zoznam kolegov).
 */
export async function listUsersByRoleAction(
  role: "obhliadky" | "realizacie",
): Promise<
  {
    ok: true;
    users: Array<{
      id: string;
      name: string;
      email: string;
      home_city: string | null;
    }>;
  }
  | { ok: false; error: string }
> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  // Skúsime načítať aj home_city; ak stĺpec ešte neexistuje (bez SQL migrácie
  // 16_user_home_city), fallback bez neho.
  const withCity = await supabase
    .from("users")
    .select("id, name, email, home_city")
    .eq("role", role)
    .eq("active", true)
    .order("name");

  if (!withCity.error) {
    return {
      ok: true,
      users: (withCity.data ?? []).map((u) => ({
        id: u.id as string,
        name: (u.name as string) || (u.email as string),
        email: u.email as string,
        home_city: (u.home_city as string | null) ?? null,
      })),
    };
  }

  // Fallback ak home_city ešte neexistuje
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("role", role)
    .eq("active", true)
    .order("name");
  if (error) return { ok: false, error: "db_error" };
  return {
    ok: true,
    users: (data ?? []).map((u) => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      home_city: null,
    })),
  };
}

/**
 * Server Action — obchodník posunie lead na obhliadku obhliadkárovi.
 * Nastaví status='needs_inspection', inspection_by=inspectorId, inspection_at=now.
 * Kontroly: iba obchodník/admin, iba ich vlastný lead.
 */
export async function handoverToInspectionAction(
  leadId: string,
  inspectorId: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user) return { ok: false, error: "unauthorized" };
    if (user.role !== "obchod" && user.role !== "admin") {
      return { ok: false, error: "forbidden_wrong_role" };
    }

    const supabase = await createClient();

    // Ownership check
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) {
      console.error("[handoverToInspection] leadErr:", leadErr);
      return { ok: false, error: `db: ${leadErr.message}` };
    }
    if (!lead) return { ok: false, error: "not_found" };
    if (lead.assigned_to !== user.id && user.role !== "admin") {
      return { ok: false, error: "forbidden_not_your_lead" };
    }

    // Overiť že inspector má rolu obhliadky
    const { data: inspector, error: inspErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", inspectorId)
      .maybeSingle();
    if (inspErr) {
      console.error("[handoverToInspection] inspErr:", inspErr);
      return { ok: false, error: `db: ${inspErr.message}` };
    }
    if (!inspector) return { ok: false, error: "inspector_not_found" };
    if (inspector.role !== "obhliadky") {
      return {
        ok: false,
        error: `invalid_inspector_role: ${inspector.role}`,
      };
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        status: "needs_inspection",
        inspection_by: inspectorId,
        inspection_at: nowIso,
        last_activity_at: nowIso,
      })
      .eq("id", leadId);
    if (updErr) {
      console.error("[handoverToInspection] updErr:", updErr);
      return { ok: false, error: `db_update: ${updErr.message}` };
    }

    const { error: actErr } = await supabase.from("lead_activities").insert({
      lead_id: leadId,
      user_id: user.id,
      type: "handed_over_to_inspection",
      data: { inspector_id: inspectorId, note: note ?? null },
    });
    if (actErr) {
      // Nie fatal — hlavne že update prešiel
      console.error("[handoverToInspection] activity insert failed:", actErr);
    }

    // revalidatePath môže hodiť v edge runtime — try/catch okolo
    try {
      revalidatePath("/agent");
      revalidatePath("/obhliadky");
    } catch (e) {
      console.error("[handoverToInspection] revalidatePath failed:", e);
    }
    return { ok: true };
  } catch (e) {
    console.error("[handoverToInspection] EXCEPTION:", e);
    return {
      ok: false,
      error: `server_exception: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
}

/**
 * Server Action — obchodník posunie dohodnutú zákazku do realizácie.
 * Status='in_realization', realization_by=teamMemberId, realization_at=now.
 */
export async function handoverToRealizationAction(
  leadId: string,
  teamMemberId: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user) return { ok: false, error: "unauthorized" };
    if (user.role !== "obchod" && user.role !== "admin") {
      return { ok: false, error: "forbidden_wrong_role" };
    }

    const supabase = await createClient();
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("assigned_to, status")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) {
      console.error("[handoverToRealization] leadErr:", leadErr);
      return { ok: false, error: `db: ${leadErr.message}` };
    }
    if (!lead) return { ok: false, error: "not_found" };
    if (lead.assigned_to !== user.id && user.role !== "admin") {
      return { ok: false, error: "forbidden_not_your_lead" };
    }

    const { data: member, error: memErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", teamMemberId)
      .maybeSingle();
    if (memErr) {
      console.error("[handoverToRealization] memErr:", memErr);
      return { ok: false, error: `db: ${memErr.message}` };
    }
    if (!member) return { ok: false, error: "member_not_found" };
    if (member.role !== "realizacie") {
      return {
        ok: false,
        error: `invalid_team_member_role: ${member.role}`,
      };
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        status: "in_realization",
        realization_by: teamMemberId,
        realization_at: nowIso,
        last_activity_at: nowIso,
      })
      .eq("id", leadId);
    if (updErr) {
      console.error("[handoverToRealization] updErr:", updErr);
      return { ok: false, error: `db_update: ${updErr.message}` };
    }

    const { error: actErr } = await supabase.from("lead_activities").insert({
      lead_id: leadId,
      user_id: user.id,
      type: "handed_over_to_realization",
      data: { realization_by: teamMemberId, note: note ?? null },
    });
    if (actErr) {
      console.error("[handoverToRealization] activity insert failed:", actErr);
    }

    try {
      revalidatePath("/agent");
      revalidatePath("/realizacie");
    } catch (e) {
      console.error("[handoverToRealization] revalidatePath failed:", e);
    }
    return { ok: true };
  } catch (e) {
    console.error("[handoverToRealization] EXCEPTION:", e);
    return {
      ok: false,
      error: `server_exception: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
}

/**
 * Server Action — realizator označí zákazku ako dokončenú (won).
 * Status → 'won', realization_completed_at = now.
 * Iba ten kto realizáciu dostal, alebo admin.
 */
export async function markRealizationDoneAction(
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (user.role !== "realizacie" && user.role !== "admin") {
    return { ok: false, error: "forbidden_wrong_role" };
  }

  const supabase = await createClient();
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("realization_by, status")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, error: "not_found" };
  if (lead.realization_by !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden_not_your_realization" };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("leads")
    .update({
      status: "won",
      realization_completed_at: nowIso,
      last_activity_at: nowIso,
    })
    .eq("id", leadId);
  if (updErr) return { ok: false, error: "db_error" };

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "realization_completed",
    data: null,
  });

  revalidatePath("/agent");
  revalidatePath("/realizacie");
  return { ok: true };
}

/**
 * Server Action — DRAFT save. Obhliadkár si v jednotlivých modaloch
 * (Testy, Zameranie) uloží čiastkový výsledok. Bez zmeny statusu, bez
 * notifikácií. Merge do existujúceho inspection_result JSONB — hodnoty
 * ktoré nepošleš zostávajú.
 *
 * Používa sa v app/obhliadky/[id]/inspection-wizard.tsx — TestsModal a
 * MeasurementModal na onSave pošlú draft, aby refresh nezmazal to čo
 * obhliadkár už vyplnil.
 */
export async function saveInspectionDraftAction(
  leadId: string,
  partial: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (user.role !== "obhliadky" && user.role !== "admin") {
    return { ok: false, error: "forbidden_wrong_role" };
  }

  // POZOR: RLS policy leads_update povoľuje UPDATE iba admin+assigned_to.
  // Obhliadkár (inspection_by) je BLOKOVANÝ → tichá 0-rows update (bez
  // errora ale nič sa neuloží → refresh vymaže "uložené" veci).
  // Preto použijeme admin klienta a auth check spravíme manuálne.
  const admin = createAdminClient();
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("inspection_by, inspection_result")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, error: "not_found" };
  if (lead.inspection_by !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden_not_your_inspection" };
  }

  const merged = {
    ...((lead.inspection_result as Record<string, unknown> | null) ?? {}),
    ...partial,
    _draft_saved_at: new Date().toISOString(),
  };

  const { error: updErr } = await admin
    .from("leads")
    .update({ inspection_result: merged })
    .eq("id", leadId);
  if (updErr) return { ok: false, error: `db_error: ${updErr.message}` };

  return { ok: true };
}

/**
 * Server Action — obhliadkar dokončí obhliadku, uloží výsledok (JSONB)
 * a lead ide na status 'interested' (pripravené na cenovú ponuku).
 * Iba priradený obhliadkar alebo admin.
 */
export async function completeInspectionAction(
  leadId: string,
  result: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (user.role !== "obhliadky" && user.role !== "admin") {
    return { ok: false, error: "forbidden_wrong_role" };
  }

  // POZOR: RLS leads_select povoľuje iba admin+assigned_to. Obhliadkár
  // (inspection_by) → 0 rows → maybeSingle vráti null → "not_found" toast.
  // Rovnako aj leads_update. Použijeme admin klienta a auth spravíme manuálne.
  const admin = createAdminClient();
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("inspection_by, status")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, error: "not_found" };
  if (lead.inspection_by !== user.id && user.role !== "admin") {
    return { ok: false, error: "forbidden_not_your_inspection" };
  }

  // Ak nie je feasible, status → lost. Inak "inspected" — obhliadka HOTOVÁ,
  // čaká na obchodáka aby si pozrel výsledky (fotky, testy, m²) a poslal
  // finálnu cenovú ponuku klientovi.
  // Predtým sa dávalo "interested" ale to preskočilo review krok obchodáka.
  const feasible = (result.feasible ?? true) === true;
  const nextStatus = feasible ? "inspected" : "lost";
  const nowIso = new Date().toISOString();

  const { error: updErr } = await admin
    .from("leads")
    .update({
      status: nextStatus,
      inspection_result: result,
      last_activity_at: nowIso,
    })
    .eq("id", leadId);
  if (updErr) return { ok: false, error: `db_error: ${updErr.message}` };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    user_id: user.id,
    type: "inspection_completed",
    data: { feasible, result },
  });

  // POZOR: revalidatePath v edge runtime na CF Pages hangol server action
  // (pozorované 2026-07-11 — DB update prebehol ale klient nedostal
  // response, overlay sa točil minútu, obchodák už videl obhliadnuté).
  // Odstránené — klient robí window.location.href a middleware nastavuje
  // Cache-Control: no-store, takže fresh render dostaneme aj tak.
  return { ok: true };
}
