import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Team workload helpers — pre /agent/team admin page.
 *
 * Capacity model:
 *   - users.capacity (0-10):
 *     0  = pauzovaný (auto-assign ho preskočí)
 *     5  = default
 *     10 = top performer (bude dostávať 2× viac leadov ako capacity=5)
 *
 *   - Auto-assign trigger volí usera s najnižším COUNT(active leads) / capacity.
 *     Takže ak Peter má 10 leadov a cap=5 (ratio 2.0), a Anna má 8 leadov
 *     a cap=10 (ratio 0.8), nový lead pôjde Anne.
 *
 * Inactivity:
 *   - users.last_active_at sa update-ne pri každom getCurrentAppUser() call
 *     (throttle 5min).
 *   - inactive_hours > 48 = ⚠️ alert
 */

export type AgentRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
  capacity: number;
  active_leads: number;
  total_leads: number;
  last_active_at: string | null;
  inactive_hours: number | null; // null ak nikdy nebol aktívny
  inactive_flag: boolean; // true ak inactive_hours >= 48
  created_at: string;
};

export async function getTeamWorkload(): Promise<AgentRow[]> {
  const admin = createAdminClient();

  // Fetch users + lead counts in two queries
  const { data: users } = await admin
    .from("users")
    .select("id, email, name, role, active, capacity, last_active_at, created_at")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (!users || users.length === 0) return [];

  const ids = users.map((u) => u.id);

  // Active leads = status NOT IN (won, lost, archived)
  const { data: activeLeadCounts } = await admin
    .from("leads")
    .select("assigned_to, status")
    .in("assigned_to", ids);

  const activeMap = new Map<string, number>();
  const totalMap = new Map<string, number>();
  for (const l of activeLeadCounts ?? []) {
    if (!l.assigned_to) continue;
    totalMap.set(l.assigned_to, (totalMap.get(l.assigned_to) ?? 0) + 1);
    if (!["won", "lost", "archived"].includes(l.status)) {
      activeMap.set(l.assigned_to, (activeMap.get(l.assigned_to) ?? 0) + 1);
    }
  }

  const now = Date.now();
  return users.map((u): AgentRow => {
    let inactive_hours: number | null = null;
    if (u.last_active_at) {
      inactive_hours =
        (now - new Date(u.last_active_at).getTime()) / (1000 * 60 * 60);
    }
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role as "admin" | "user",
      active: u.active,
      capacity: u.capacity ?? 5,
      active_leads: activeMap.get(u.id) ?? 0,
      total_leads: totalMap.get(u.id) ?? 0,
      last_active_at: u.last_active_at,
      inactive_hours,
      inactive_flag: u.role === "user" && (inactive_hours ?? 999) >= 48,
      created_at: u.created_at,
    };
  });
}

/**
 * "Pred X" formátovanie pre last_active_at — minute granularity.
 */
export function formatInactive(hoursOrNull: number | null): string {
  if (hoursOrNull === null) return "ešte nikdy";
  if (hoursOrNull < 1 / 60) return "pred chvíľou";
  if (hoursOrNull < 1) {
    const m = Math.round(hoursOrNull * 60);
    return `pred ${m} min`;
  }
  if (hoursOrNull < 24) {
    const h = Math.floor(hoursOrNull);
    const m = Math.round((hoursOrNull - h) * 60);
    if (m === 0) return `pred ${h} h`;
    return `pred ${h}h ${m}min`;
  }
  const d = Math.floor(hoursOrNull / 24);
  const h = Math.floor(hoursOrNull % 24);
  return d === 1
    ? `pred 1 dňom ${h}h`
    : `pred ${d}d ${h}h`;
}
