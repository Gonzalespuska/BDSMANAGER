import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-assignment nových leadov obchodákom.
 *
 * User 2026-07-14:
 *   „urob z Denis Petrus a Alena Schronk normalnych obchodakov idu uz volat …
 *    nove leady co chodia nech su automaticky pridelovane aktivnym"
 *
 * ALGORITMUS (least-loaded round-robin s pause podporou):
 *   1. Vyber všetkých AKTÍVNYCH obchodákov (role='obchod', active=true).
 *   2. Vylúč tých ktorí sú self-paused (users.paused_until > NOW) — obchodák
 *      si sám nastavil „mám dovolenku / nechcem leady dočasne".
 *   3. Zoraď zostupne podľa capacity a vzostupne podľa počtu aktívnych leadov
 *      (status ∈ new, contacted, quote_sent, scheduled, needs_inspection,
 *      interested — VŠETKO čo ešte NEBOLO uzavreté ako won/lost/archived).
 *   4. Ak sú dvaja s rovnakým loadom, uprednostni toho kto má dlhšie neaktivny
 *      (fair rotation — najdlhšie nevidel nový lead ide prvý).
 *   5. Vráť jeho user_id. Ak neni žiadny obchodák aktívny, vráti null a lead
 *      ostane unassigned (bezpečný fallback).
 *
 * Používa sa v:
 *   - /api/cron/sync-epoxidovo (web leady z epoxidovo.sk)
 *   - /api/webhook/meta-leads (Facebook/Instagram Lead Ads)
 *   - /api/admin/reassign-unassigned (bulk pre existujúce unassigned)
 */
export async function pickObchodakForNewLead(
  admin: SupabaseClient,
): Promise<string | null> {
  // 1. Aktívni obchodáci — s fallbackom keď paused_until/last_lead_assigned_at
  //    stĺpce neexistujú (migrácia 41 nespustená).
  let agents: Array<Record<string, unknown>> | null = null;
  {
    const res = await admin
      .from("users")
      .select(
        "id, name, capacity, paused_until, last_active_at, last_lead_assigned_at",
      )
      .eq("role", "obchod")
      .eq("active", true);
    if (res.error && /column .* does not exist/i.test(res.error.message)) {
      // Fallback bez extra stĺpcov
      const retry = await admin
        .from("users")
        .select("id, name, capacity, last_active_at")
        .eq("role", "obchod")
        .eq("active", true);
      agents = (retry.data as Array<Record<string, unknown>>) ?? null;
    } else {
      agents = (res.data as Array<Record<string, unknown>>) ?? null;
    }
  }

  if (!agents || agents.length === 0) return null;

  const nowMs = Date.now();

  // 2. Filter self-paused
  const available = agents.filter((u) => {
    const p = (u as { paused_until: string | null }).paused_until;
    if (!p) return true;
    return new Date(p).getTime() < nowMs;
  });

  if (available.length === 0) return null;

  // 3. Zisti počet aktívnych leadov per obchodák (jeden query, aggregate).
  //    Aktívny = status NOT IN (won, lost, archived).
  const ids = available.map((u) => (u as { id: string }).id);
  const { data: leadsForCounts } = await admin
    .from("leads")
    .select("assigned_to, status")
    .in("assigned_to", ids)
    .not("status", "in", "(won,lost,archived)");

  const loadMap = new Map<string, number>();
  for (const l of leadsForCounts ?? []) {
    const uid = (l as { assigned_to: string | null }).assigned_to;
    if (!uid) continue;
    loadMap.set(uid, (loadMap.get(uid) ?? 0) + 1);
  }

  // 4. Zoraď: capacity - load (zostávajúca kapacita) DESC, potom
  //    last_lead_assigned_at ASC (najdlhšie nevidel lead ide prvý).
  const ranked = available
    .map((u) => {
      const user = u as {
        id: string;
        name: string | null;
        capacity: number;
        last_lead_assigned_at: string | null;
      };
      const load = loadMap.get(user.id) ?? 0;
      const capacity = user.capacity ?? 5;
      const remaining = capacity - load;
      const lastAssignedTs = user.last_lead_assigned_at
        ? new Date(user.last_lead_assigned_at).getTime()
        : 0;
      return {
        id: user.id,
        name: user.name,
        load,
        capacity,
        remaining,
        lastAssignedTs,
      };
    })
    // Vezmi tých ktorí ešte majú zostávajúcu kapacitu > 0, ak nikto tak
    // vezmi všetkých (over-cap ako fallback aby lead nespadol na neexistujuci).
    .sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.lastAssignedTs - b.lastAssignedTs;
    });

  const winner = ranked[0];
  if (!winner) return null;
  return winner.id;
}

/**
 * Vlož ho na lead + update last_lead_assigned_at (aby fair rotation fungovala).
 * Non-fatal: ak update zlyhá (napr. RLS), aspoň sa lead priradí.
 */
export async function assignLeadToUser(
  admin: SupabaseClient,
  leadId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  const { error: leadErr } = await admin
    .from("leads")
    .update({ assigned_to: userId, last_activity_at: nowIso })
    .eq("id", leadId);
  if (leadErr) return { ok: false, error: leadErr.message };

  // Touchni last_lead_assigned_at — non-fatal (stĺpec z migrácie 41).
  try {
    await admin
      .from("users")
      .update({ last_lead_assigned_at: nowIso })
      .eq("id", userId);
  } catch {
    /* migrácia 41 nespustená alebo iná chyba — ignoruj */
  }

  // Audit trail — non-fatal.
  try {
    await admin.from("lead_activities").insert({
      lead_id: leadId,
      user_id: userId,
      type: "auto_assigned",
      data: { assigned_at: nowIso, source: "auto_round_robin" },
    });
  } catch {
    /* ignore audit failure */
  }

  return { ok: true };
}
