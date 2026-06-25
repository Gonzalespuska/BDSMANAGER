"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
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

  // Načítaj lead pre SLA vyhodnotenie
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sla_deadline, sla_status, status, phone_revealed_at")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return { ok: false, error: "not_found" };
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

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      phone_revealed_at: nowIso,
      phone_revealed_by: user.id,
      status: lead.status === "new" ? "phone_revealed" : lead.status,
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
 * Server Action — agent klikol "NEDVÍHA" tlačidlo (call_attempts++).
 * Logika nasleduje spec:
 *   1× → next_callback_at = NOW + sla_callback_hours
 *   2× → next_callback_at = NOW + sla_callback_hours
 *   3× → status = 'archived' + notifikácia (TODO email)
 */
export async function recordMissedCallAction(
  leadId: string,
): Promise<{ ok: true; archived: boolean } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Načítaj lead + settings
  const [
    { data: lead, error: leadError },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, call_attempts, status")
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("sla_callback_hours, sla_max_attempts")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (leadError || !lead) return { ok: false, error: "not_found" };

  const callbackHours = settings?.sla_callback_hours ?? 6;
  const maxAttempts = settings?.sla_max_attempts ?? 3;
  const newAttempts = lead.call_attempts + 1;

  const isArchived = newAttempts >= maxAttempts;

  const update: Record<string, unknown> = {
    call_attempts: newAttempts,
    status: isArchived ? "archived" : "no_answer",
    last_activity_at: nowIso,
  };

  if (!isArchived) {
    const next = new Date(now.getTime() + callbackHours * 60 * 60 * 1000);
    update.next_callback_at = next.toISOString();
  } else {
    update.next_callback_at = null;
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(update)
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
      archived: isArchived,
    },
  });

  // ⚠️ TODO funkčnosť dorobíme keď bude Resend + SMS provider live:
  //   - SMS: cez Twilio / Vonage / iný SK provider
  //   - Email: cez Resend (template "po 3 neúspechoch sa nám neozvali")
  // Zatiaľ len logujeme do lead_activities aby admin videl že trigger zapol.
  if (isArchived) {
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      user_id: user.id,
      type: "auto_archive_notify",
      data: {
        reason: `${newAttempts}× neúspešný pokus`,
        sms_sent: false, // bude true keď nasadíme SMS API
        email_sent: false, // bude true keď nastavíme Resend template
        TODO: "Pripojiť Resend + SMS pre auto-notifikáciu zákazníka",
      },
    });
    console.warn(
      `[recordMissedCall] Lead ${leadId} archivovaný po ${newAttempts}× pokusoch — SMS+Email placeholder loggnuté, treba pripojiť provider.`,
    );
  }

  revalidatePath("/agent");
  revalidatePath("/admin");
  return { ok: true, archived: isArchived };
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

  // Načítame existing data, vložíme agent_note, uložíme späť
  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("data")
    .eq("id", leadId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!existing) return { ok: false, error: "not_found" };

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
