"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

export async function addCalendarNoteAction(
  date: string, // ISO YYYY-MM-DD
  body: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user" };
  }

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (trimmed.length > 2000) return { ok: false, error: "too_long" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "invalid_date" };
  }

  const admin = createAdminClient();
  // Prvý pokus so stĺpcom `kind` (existuje po migrácii 07_calendar_events_extend).
  let { data, error } = await admin
    .from("calendar_notes")
    .insert({ user_id: user.id, date, body: trimmed, kind: "note" })
    .select("id")
    .single();

  // Fallback pre DB bez migrácie 07 — nemá stĺpec kind. Skús bez neho.
  if (error && /column .*kind.* does not exist/i.test(error.message)) {
    const retry = await admin
      .from("calendar_notes")
      .insert({ user_id: user.id, date, body: trimmed })
      .select("id")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    const msg = error?.message ?? "failed";
    console.error("[addCalendarNoteAction]", msg);
    return { ok: false, error: msg };
  }

  revalidatePath("/calendar");
  return { ok: true, id: data.id };
}

/**
 * Pridá Hovor / Meeting event do kalendára.
 */
export async function addCalendarEventAction(input: {
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM (lokálny čas)
  kind: "call" | "meeting";
  contact_name: string;
  body: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "invalid_date" };
  }
  const contact = input.contact_name.trim();
  if (!contact) return { ok: false, error: "missing_contact" };
  const body = (input.body ?? "").trim() || `${input.kind === "call" ? "Hovor" : "Meeting"} — ${contact}`;
  if (body.length > 2000) return { ok: false, error: "too_long" };

  let startsAt: string | null = null;
  if (input.time && /^\d{2}:\d{2}$/.test(input.time)) {
    // Local-time → ISO. Browser sa stará o TZ pri zadaní; storeujeme ISO.
    const [h, m] = input.time.split(":");
    const d = new Date(`${input.date}T${h}:${m}:00`);
    startsAt = d.toISOString();
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_notes")
    .insert({
      user_id: user.id,
      date: input.date,
      body,
      kind: input.kind,
      contact_name: contact,
      starts_at: startsAt,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "failed" };
  revalidatePath("/calendar");
  return { ok: true, id: data.id };
}

export async function deleteCalendarNoteAction(
  noteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") return { ok: false, error: "dev fallback user" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("calendar_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

/**
 * Edituje existujúcu kalendárnu poznámku.
 */
export async function updateCalendarNoteAction(
  noteId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") return { ok: false, error: "dev fallback user" };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (trimmed.length > 2000) return { ok: false, error: "too_long" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("calendar_notes")
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}
