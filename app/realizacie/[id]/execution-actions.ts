"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Uloží realization_execution stav do lead.data JSONB.
 * Prístup: realizátor priradený k leadu, obchodník-vlastník alebo admin.
 */
export async function saveExecutionAction(
  leadId: string,
  execution: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const sb = createAdminClient();
  const { data: lead, error } = await sb
    .from("leads")
    .select("data, realization_by, assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !lead) return { ok: false, error: "lead_not_found" };

  const canAccess =
    user.role === "admin" ||
    lead.realization_by === user.id ||
    lead.assigned_to === user.id;
  if (!canAccess) return { ok: false, error: "forbidden" };

  const currentData = (lead.data ?? {}) as Record<string, unknown>;
  const newData = { ...currentData, realization_execution: execution };

  const { error: upErr } = await sb
    .from("leads")
    .update({
      data: newData,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath(`/realizacie/${leadId}`);
  return { ok: true };
}
