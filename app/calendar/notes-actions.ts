"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

export type NotePayload = {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  updated_at: string;
};

export async function createNoteAction(): Promise<
  { ok: true; note: NotePayload } | { ok: false; error: string }
> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") return { ok: false, error: "dev fallback user" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notes")
    .insert({ user_id: user.id, body: "Nová poznámka" })
    .select("id, title, body, pinned, updated_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "failed" };

  revalidatePath("/calendar");
  return { ok: true, note: data as NotePayload };
}

export async function updateNoteAction(
  noteId: string,
  patch: { title?: string | null; body?: string; pinned?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") return { ok: false, error: "dev fallback user" };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ("title" in patch) update.title = patch.title?.trim() || null;
  if ("body" in patch) {
    const body = (patch.body ?? "").trim();
    if (!body) return { ok: false, error: "empty body" };
    if (body.length > 20000) return { ok: false, error: "too long" };
    update.body = body;
  }
  if ("pinned" in patch) update.pinned = !!patch.pinned;

  const admin = createAdminClient();
  const { error } = await admin
    .from("notes")
    .update(update)
    .eq("id", noteId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteNoteAction(
  noteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") return { ok: false, error: "dev fallback user" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}
