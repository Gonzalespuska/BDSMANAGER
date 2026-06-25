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
  const { data, error } = await admin
    .from("calendar_notes")
    .insert({ user_id: user.id, date, body: trimmed })
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
