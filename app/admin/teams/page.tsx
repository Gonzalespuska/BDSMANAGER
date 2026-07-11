import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { TeamsAdmin } from "./teams-admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/teams — správa realizačných tímov.
 *
 * User 2026-07-11:
 *   "zadefinujeme si timi v adminovi a tie mena z timov tam budes
 *    doplnat popripade pridaj moznost ked vyberas tim ho editnut".
 */
export default async function TeamsAdminPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const admin = createAdminClient();
  let teams: Array<Record<string, unknown>> = [];
  let realizators: Array<{ id: string; name: string; email: string }> = [];
  let dbReady = true;
  try {
    const [{ data: t, error: tErr }, { data: mems }, { data: users }] =
      await Promise.all([
        admin
          .from("realization_teams")
          .select("*")
          .eq("active", true)
          .order("name", { ascending: true }),
        admin
          .from("realization_team_members")
          .select("team_id, user_id"),
        admin
          .from("users")
          .select("id, name, email, role")
          .in("role", ["realizacie", "admin"])
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);
    if (tErr) dbReady = false;
    teams = (t ?? []) as Array<Record<string, unknown>>;
    const memsByTeam = new Map<string, string[]>();
    for (const m of mems ?? []) {
      const tid = (m as { team_id: string }).team_id;
      const uid = (m as { user_id: string }).user_id;
      if (!memsByTeam.has(tid)) memsByTeam.set(tid, []);
      memsByTeam.get(tid)!.push(uid);
    }
    const userMap = new Map(
      (users ?? []).map((u) => [
        (u as { id: string }).id,
        {
          id: (u as { id: string }).id,
          name: (u as { name: string | null; email: string }).name ??
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
    dbReady = false;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">
            Realizačné tímy
          </h1>
          <p className="text-sm text-muted-foreground">
            Definuj tímy realizatorov. Pri priraďovaní realizácie si obchodák
            vyberie tím — kroky sa auto-rozdelia rovnomerne po členoch (na
            protokol Zodpovednosť). Ak tím má 1 člena, protokol netreba.
          </p>
        </div>
      </header>

      {!dbReady && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="font-black text-amber-900 mb-1">
            ⚠ DB migrácia nie je spustená
          </div>
          <div className="text-sm text-amber-900">
            Spusti{" "}
            <code className="bg-amber-100 px-1 rounded">
              supabase/33_realization_teams.sql
            </code>{" "}
            v Supabase Dashboard SQL Editore.
          </div>
        </div>
      )}

      {dbReady && (
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
    </div>
  );
}
