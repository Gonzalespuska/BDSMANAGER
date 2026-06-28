import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { AgentsTable } from "./agents-table";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export interface AgentListRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "obchod" | "obhliadky" | "realizacie";
  active: boolean;
  capacity: number;
  auth_id: string | null;
  last_active_at: string | null;
  created_at: string;
  // Computed
  active_leads: number;
  total_leads: number;
  inactive_hours: number | null;
  inactive_flag: boolean;
}

export default async function AdminAgentsPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();

  // 1) Všetci členovia tímu okrem admina (obchod / obhliadky / realizácie).
  // Admin permissions sa upravujú v users [id] detaile cez permissions-card.
  const { data: usersRaw } = await sb
    .from("users")
    .select(
      "id, email, name, role, active, capacity, auth_id, last_active_at, created_at",
    )
    .neq("role", "admin")
    .order("created_at", { ascending: true });

  const users = (usersRaw ?? []) as Omit<
    AgentListRow,
    "active_leads" | "total_leads" | "inactive_hours" | "inactive_flag"
  >[];

  // 2) Lead counts + posledné phone_revealed_at per user
  const ids = users.map((u) => u.id);
  const activeMap = new Map<string, number>();
  const totalMap = new Map<string, number>();
  const lastRevealMap = new Map<string, string>(); // userId → ISO ts

  if (ids.length > 0) {
    const { data: leads } = await sb
      .from("leads")
      .select("assigned_to, status, phone_revealed_at, phone_revealed_by")
      .in("assigned_to", ids);

    for (const l of leads ?? []) {
      if (!l.assigned_to) continue;
      totalMap.set(l.assigned_to, (totalMap.get(l.assigned_to) ?? 0) + 1);
      if (!["won", "lost", "archived"].includes(l.status as string)) {
        activeMap.set(l.assigned_to, (activeMap.get(l.assigned_to) ?? 0) + 1);
      }
    }

    // Posledné phone_revealed_at per phone_revealed_by user — z celej tabuľky
    const { data: revealLeads } = await sb
      .from("leads")
      .select("phone_revealed_by, phone_revealed_at")
      .in("phone_revealed_by", ids)
      .not("phone_revealed_at", "is", null);

    for (const l of revealLeads ?? []) {
      const userId = l.phone_revealed_by as string | null;
      const ts = l.phone_revealed_at as string | null;
      if (!userId || !ts) continue;
      const existing = lastRevealMap.get(userId);
      if (!existing || ts > existing) lastRevealMap.set(userId, ts);
    }
  }

  const now = Date.now();
  const agents: AgentListRow[] = users.map((u) => {
    // inactive_hours = hodiny od posledného kliku "Odhaliť číslo"
    let inactive_hours: number | null = null;
    const lastReveal = lastRevealMap.get(u.id);
    if (lastReveal) {
      inactive_hours =
        (now - new Date(lastReveal).getTime()) / (1000 * 60 * 60);
    }
    // Ak nikdy neodhalil → ber created_at ako baseline (po 24h sa rozsvieti badge)
    const baseHours = inactive_hours
      ?? (now - new Date(u.created_at).getTime()) / (1000 * 60 * 60);
    return {
      ...u,
      active_leads: activeMap.get(u.id) ?? 0,
      total_leads: totalMap.get(u.id) ?? 0,
      inactive_hours,
      // 24h+ neaktívny = neodhalil žiadne číslo za posledných 24h
      inactive_flag: u.role !== "admin" && baseHours >= 24,
    };
  });

  return (
    <div className="space-y-4">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-sky-500" aria-hidden />
          Tím{" "}
          <span className="text-sky-500 tabular-nums">({agents.length})</span>
        </h1>
      </header>

      <AgentsTable initial={agents} />
    </div>
  );
}
