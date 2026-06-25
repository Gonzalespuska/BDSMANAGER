"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Self-management server actions (pre profile menu).
 *
 * setMyPauseAction:
 *   - paused=true  → users.capacity = 0 (auto-assign trigger ho preskočí)
 *   - paused=false → users.capacity = 5 (default)
 * Použije sa z profile menu, jednoduchý "ja sa pauzujem".
 */
export async function setMyPauseAction(
  paused: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (user.id === "dev-user") {
    return { ok: false, error: "dev fallback user — peter z DB nenájdený" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ capacity: paused ? 0 : 5 })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agent");
  revalidatePath("/agent/team");
  revalidatePath("/workload");
  return { ok: true };
}
