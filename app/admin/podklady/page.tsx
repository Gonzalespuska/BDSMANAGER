import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { CallScriptsAdmin } from "./call-scripts-admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/podklady — správa Podkladov (call scripty).
 *
 * User 2026-07-11:
 *   "chcem callscripty obchodakom pridat do podkladov takze to tiez musi
 *    mat admin moznost editovat v admine".
 */
export default async function PodkladyAdminPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const admin = createAdminClient();
  let scripts: Array<Record<string, unknown>> = [];
  let dbReady = true;
  try {
    const { data, error } = await admin
      .from("call_scripts")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) dbReady = false;
    scripts = (data ?? []) as Array<Record<string, unknown>>;
  } catch {
    dbReady = false;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">
            Podklady — Call skripty
          </h1>
          <p className="text-sm text-muted-foreground">
            Obchodáci majú pri leade tlačidlo „📞 Callscript" — otvorí sa im
            skript podľa typu podlahy + priestoru (mramor-dom, chipsová-firma,
            atď.). Tu ich vieš editovať, pridávať a odstraňovať.
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
              supabase/31_call_scripts_and_procedures.sql
            </code>{" "}
            v Supabase Dashboard SQL Editore.
          </div>
        </div>
      )}

      {dbReady && (
        <CallScriptsAdmin
          initialScripts={
            scripts as Array<{
              id: string;
              label: string;
              description: string | null;
              floor_type: string | null;
              space: string | null;
              body: string;
              sort_order: number;
              active: boolean;
            }>
          }
        />
      )}
    </div>
  );
}
