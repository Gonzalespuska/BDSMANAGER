"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server actions pre /admin/agents.
 * Všetky vyžadujú role="admin" (vrátia { ok: false, error: "forbidden" }).
 */

async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me) return null;
  if (me.role !== "admin") return null;
  return me;
}

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────────────────
export async function createAgentAction(input: {
  name: string;
  email: string;
  phone: string;
  role: "admin" | "obchod" | "obhliadky" | "realizacie";
  capacity: number;
}): Promise<ActionResult<{ id: string; magic_link?: string }>> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "forbidden" };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const ALLOWED_ROLES = ["admin", "obchod", "obhliadky", "realizacie"] as const;
  const role = (ALLOWED_ROLES as readonly string[]).includes(input.role)
    ? input.role
    : "obchod";
  const capacity = Math.max(0, Math.min(10, Math.floor(input.capacity || 5)));

  if (!name) return { ok: false, error: "Meno je povinné" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Neplatný email" };
  }
  if (!phone) return { ok: false, error: "Telefón je povinný" };
  if (phone.replace(/\s/g, "").length < 9) {
    return { ok: false, error: "Telefón je príliš krátky" };
  }

  const sb = createAdminClient();

  // Existuje už user s týmto emailom?
  const { data: existing } = await sb
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "User s týmto emailom už existuje" };
  }

  // 1. Vytvor Supabase auth user — bez hesla, prihlasovanie cez OTP magic link.
  //    email_confirm: false → user musí klikuť na magic link.
  let authUserId: string | null = null;
  let magicLink: string | undefined;

  try {
    const { data: authUser, error: authError } = await sb.auth.admin.createUser({
      email,
      email_confirm: true, // confirmnúť hneď aby OTP fungovalo
    });

    if (authError) {
      console.warn("[createAgentAction] auth.admin.createUser failed:", authError);
      // Pokračujeme bez auth — admin musí ručne pozvať usera.
    } else if (authUser?.user) {
      authUserId = authUser.user.id;
      // Vygeneruj magic link aby ho admin mohol poslať userovi.
      try {
        const { data: linkData } = await sb.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        magicLink = linkData?.properties?.action_link;
      } catch (e) {
        console.warn("[createAgentAction] generateLink failed:", e);
      }
    }
  } catch (e) {
    console.warn("[createAgentAction] auth admin API not available:", e);
  }

  // 2. Vlož row do public.users.
  const { data: newUser, error: insertError } = await sb
    .from("users")
    .insert({
      auth_id: authUserId,
      email,
      name,
      role,
      active: true,
      capacity,
      phone,
    })
    .select("id")
    .single();

  if (insertError || !newUser) {
    return {
      ok: false,
      error: insertError?.message ?? "Vytvorenie zlyhalo",
    };
  }

  revalidatePath("/admin/agents");
  revalidatePath("/admin");
  return { ok: true, data: { id: newUser.id, magic_link: magicLink } };
}

// ────────────────────────────────────────────────────────────────────────
// UPDATE (čiastočný)
// ────────────────────────────────────────────────────────────────────────
export async function updateAgentAction(
  id: string,
  patch: {
    name?: string;
    role?: "admin" | "obchod" | "obhliadky" | "realizacie" | "skolenie";
    capacity?: number;
    active?: boolean;
    phone?: string | null;
    home_city?: string | null;
    payout_percent?: number | null;
  },
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "forbidden" };

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "Meno nemôže byť prázdne" };
    update.name = n;
  }
  if (patch.role !== undefined) {
    const ALLOWED_ROLES = ["admin", "obchod", "obhliadky", "realizacie"];
    if (!ALLOWED_ROLES.includes(patch.role)) {
      return { ok: false, error: "Neplatná rola" };
    }
    update.role = patch.role;
  }
  if (patch.capacity !== undefined) {
    const c = Math.max(0, Math.min(10, Math.floor(patch.capacity)));
    update.capacity = c;
  }
  if (patch.active !== undefined) {
    update.active = !!patch.active;
  }
  if (patch.phone !== undefined) {
    update.phone = patch.phone ? patch.phone.trim() : null;
  }
  if (patch.home_city !== undefined) {
    update.home_city = patch.home_city ? patch.home_city.trim() : null;
  }
  if (patch.payout_percent !== undefined) {
    if (patch.payout_percent === null) {
      update.payout_percent = 0;
    } else {
      const p = Math.max(0, Math.min(100, patch.payout_percent));
      if (!Number.isFinite(p)) {
        return { ok: false, error: "Neplatný payout percent" };
      }
      update.payout_percent = p;
    }
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nič na update" };
  }

  // Safety: admin nemôže sám seba degradovať na user-a (nech sa nezamkne von)
  if (
    id === me.id &&
    patch.role !== undefined &&
    patch.role !== "admin"
  ) {
    return {
      ok: false,
      error: "Nemôžeš si zmeniť rolu — len iný admin to môže urobiť.",
    };
  }
  if (id === me.id && patch.active === false) {
    return { ok: false, error: "Nemôžeš sám seba deaktivovať." };
  }

  const sb = createAdminClient();

  // Detekuj či ide o pauznutie (capacity 0) alebo deaktiváciu — v tom prípade
  // preraď netknuté leady tohto usera k aktívnym obchodákom
  const willPause =
    (patch.capacity !== undefined && patch.capacity === 0) ||
    patch.active === false;

  const { error } = await sb.from("users").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (willPause) {
    try {
      await reassignUntouchedLeads(id);
    } catch (e) {
      console.warn("[updateAgent] reassign failed:", e);
    }
  }

  revalidatePath("/admin/agents");
  revalidatePath("/admin");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// DEACTIVATE (soft delete)
// ────────────────────────────────────────────────────────────────────────
export async function deactivateAgentAction(id: string): Promise<ActionResult> {
  return updateAgentAction(id, { active: false });
}

export async function activateAgentAction(id: string): Promise<ActionResult> {
  return updateAgentAction(id, { active: true });
}

// ────────────────────────────────────────────────────────────────────────
// DELETE AGENT (úplne odstrániť — DB + Supabase auth)
// Leady sa unassignnú (assigned_to = null), nemažú sa.
// ────────────────────────────────────────────────────────────────────────
export async function deleteAgentAction(
  id: string,
): Promise<ActionResult<{ deleted_leads_unassigned: number }>> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "forbidden" };
  if (id === me.id) {
    return { ok: false, error: "Nemôžeš sám seba zmazať." };
  }

  const sb = createAdminClient();

  // 1) Načítaj agenta (kvôli auth_id)
  const { data: agent } = await sb
    .from("users")
    .select("id, auth_id, email")
    .eq("id", id)
    .maybeSingle();
  if (!agent) return { ok: false, error: "Agent neexistuje" };

  // 2) Unassign leady
  const { error: unassignErr, count } = await sb
    .from("leads")
    .update({ assigned_to: null }, { count: "exact" })
    .eq("assigned_to", id);
  if (unassignErr) {
    return {
      ok: false,
      error: `Unassign leadov zlyhal: ${unassignErr.message}`,
    };
  }

  // 3) Zmazať z public.users
  const { error: delErr } = await sb.from("users").delete().eq("id", id);
  if (delErr) {
    return { ok: false, error: `Mazanie zlyhalo: ${delErr.message}` };
  }

  // 4) Zmazať Supabase auth user (best-effort)
  if (agent.auth_id) {
    try {
      await sb.auth.admin.deleteUser(agent.auth_id as string);
    } catch (e) {
      console.warn("[deleteAgent] auth deleteUser failed (non-fatal):", e);
    }
  }

  revalidatePath("/admin/agents");
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  return { ok: true, data: { deleted_leads_unassigned: count ?? 0 } };
}

// ────────────────────────────────────────────────────────────────────────
// SEND INVITE (OTP email)
// Pošle agentovi 6-cifr OTP kód na email cez Supabase. Agent ho zadá na
// /login/verify a prihlási sa.
// ────────────────────────────────────────────────────────────────────────
export async function sendInviteAction(
  id: string,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "forbidden" };

  const sb = createAdminClient();
  const { data: user } = await sb
    .from("users")
    .select("email, active")
    .eq("id", id)
    .single();

  if (!user?.email) return { ok: false, error: "User nenájdený" };
  if (!user.active)
    return { ok: false, error: "User je deaktivovaný — najprv ho aktivuj" };

  try {
    // signInWithOtp pošle 6-cifr kód na email (Supabase SMTP)
    const { error } = await sb.auth.signInWithOtp({
      email: user.email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("rate") || lower.includes("security")) {
        return { ok: false, error: "Rate limit Supabase — skús o chvíľu znova" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Neznáma chyba",
    };
  }
}

/**
 * reassignUntouchedLeads — pri pauznutí / deaktivácii obchodáka presuň jeho
 * NETKNUTÉ leady (phone_revealed_at IS NULL, status='new') k ostatným
 * aktívnym obchodákom (round-robin distribúcia).
 */
async function reassignUntouchedLeads(pausedUserId: string): Promise<void> {
  const sb = createAdminClient();
  const { data: untouched } = await sb
    .from("leads")
    .select("id")
    .eq("assigned_to", pausedUserId)
    .is("phone_revealed_at", null)
    .eq("status", "new");
  const ids = (untouched ?? []).map((l) => l.id as string);
  if (ids.length === 0) return;

  const { data: activeAgents } = await sb
    .from("users")
    .select("id, name")
    .eq("role", "obchod")
    .eq("active", true)
    .gt("capacity", 0)
    .neq("id", pausedUserId);
  if (!activeAgents || activeAgents.length === 0) return;

  const buckets = new Map<string, string[]>();
  for (const a of activeAgents) buckets.set(a.id, []);
  ids.forEach((leadId, i) => {
    const agentId = activeAgents[i % activeAgents.length].id;
    buckets.get(agentId)!.push(leadId);
  });

  for (const [agentId, leadIds] of buckets.entries()) {
    if (leadIds.length === 0) continue;
    await sb.from("leads").update({ assigned_to: agentId }).in("id", leadIds);
  }

  // Audit log activity — každý presunutý lead
  const activityRows = Array.from(buckets.entries())
    .filter(([, ids]) => ids.length > 0)
    .flatMap(([toAgentId, leadIds]) =>
      leadIds.map((leadId) => ({
        lead_id: leadId,
        user_id: pausedUserId,
        type: "status_changed",
        data: {
          reason: "auto_reassign_on_pause",
          from_user: pausedUserId,
          to_user: toAgentId,
        },
      })),
    );
  if (activityRows.length > 0) {
    await sb.from("lead_activities").insert(activityRows);
  }
}
