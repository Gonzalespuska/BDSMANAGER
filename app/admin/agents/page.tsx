import Link from "next/link";
import { ArrowLeft, Hammer, Users } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { AgentsTable } from "./agents-table";
import { TeamsAdmin } from "../teams/teams-admin";

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

  // 1) Všetci členovia tímu — vrátane adminov.
  // User 2026-07-16: „vravi ze tento user uz existuje ale nevidim ho tam".
  // Predtým sme filtrovali .neq('role','admin') a admini boli neviditeľní
  // pre admin list → error „User existuje" pri pokuse ho znova vytvoriť.
  const { data: usersRaw } = await sb
    .from("users")
    .select(
      "id, email, name, role, active, capacity, auth_id, last_active_at, created_at",
    )
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

  // ─── Realizačné tímy (embedded pod Tím) ────────────────────────────
  // User 2026-07-12: „dole pod tuto kategiriu tim daj realizacne timi
  // a tam mozem vytvarat realizacne timi a vsetko to co sme spominali
  // miesto kde sidlia na vypocet cesty atd proste tu sa to bude robit".
  let teams: Array<Record<string, unknown>> = [];
  let realizators: Array<{ id: string; name: string; email: string }> = [];
  let teamsDbReady = true;
  try {
    const [{ data: t, error: tErr }, { data: mems }, { data: rUsers }] =
      await Promise.all([
        sb.from("realization_teams").select("*").eq("active", true).order("name"),
        sb.from("realization_team_members").select("team_id, user_id"),
        sb
          .from("users")
          .select("id, name, email, role")
          .in("role", ["realizacie", "admin"])
          .eq("active", true)
          .order("name"),
      ]);
    if (tErr) teamsDbReady = false;
    teams = (t ?? []) as Array<Record<string, unknown>>;
    const memsByTeam = new Map<string, string[]>();
    for (const m of mems ?? []) {
      const tid = (m as { team_id: string }).team_id;
      const uid = (m as { user_id: string }).user_id;
      if (!memsByTeam.has(tid)) memsByTeam.set(tid, []);
      memsByTeam.get(tid)!.push(uid);
    }
    const userMap = new Map(
      (rUsers ?? []).map((u) => [
        (u as { id: string }).id,
        {
          id: (u as { id: string }).id,
          name:
            (u as { name: string | null; email: string }).name ??
            (u as { email: string }).email,
          email: (u as { email: string }).email,
        },
      ]),
    );
    realizators = Array.from(userMap.values());
    teams = teams.map((tm) => ({
      ...tm,
      members: (memsByTeam.get((tm as { id: string }).id) ?? [])
        .map((uid) => userMap.get(uid))
        .filter(Boolean),
    }));
  } catch {
    teamsDbReady = false;
  }

  return (
    <div className="space-y-6">
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

      {/* Realizačné tímy — CRUD s home_city pre výpočet cesty */}
      <section className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
        <header className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Hammer className="w-5 h-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-emerald-900">
              Realizačné tímy{" "}
              <span className="text-emerald-600 tabular-nums text-sm">
                ({teams.length})
              </span>
            </h2>
            <p className="text-xs text-emerald-800/80 mt-0.5">
              Vytvor tímy realizatorov, priraď členov a nastav mesto sídla —
              CRM z toho vypočíta koľko im bude trvať cesta na zákazku.
            </p>
          </div>
        </header>
        {!teamsDbReady ? (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            ⚠ Tabuľka <code className="bg-amber-100 px-1 rounded">realization_teams</code>{" "}
            neexistuje. Spusti migráciu{" "}
            <code className="bg-amber-100 px-1 rounded">
              supabase/33_realization_teams.sql
            </code>{" "}
            v Supabase SQL editore.
          </div>
        ) : (
          <TeamsAdmin
            initialTeams={
              teams as Array<{
                id: string;
                name: string;
                description: string | null;
                members: Array<{ id: string; name: string; email: string }>;
              }>
            }
            realizators={realizators}
          />
        )}
      </section>
    </div>
  );
}
