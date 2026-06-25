"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Server actions pre /agent/team admin page.
 * Všetky vyžadujú role="admin" — inak vrátia { ok: false, error: "forbidden" }.
 */

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user) return null;
  if (user.role !== "admin") return null;
  return user;
}

export async function updateAgentCapacityAction(
  userId: string,
  capacity: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };

  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10) {
    return { ok: false, error: "capacity musí byť 0-10" };
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("users")
    .update({ capacity })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agent/team");
  return { ok: true };
}

export async function setAgentActiveAction(
  userId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };

  const sb = createAdminClient();
  const { error } = await sb
    .from("users")
    .update({ active })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agent/team");
  return { ok: true };
}
