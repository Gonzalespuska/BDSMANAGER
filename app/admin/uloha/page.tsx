import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewTaskForm } from "./new-task-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/uloha — admin priradí úlohu ktorémukoľvek userovi.
 * Úloha sa uloží do `office_reminders` (user_id = target), a v `notifications`
 * bell target usera sa objaví od `remind_date`.
 */
export default async function AdminNewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sp = await searchParams;
  const success = sp.ok === "1";
  const errorMsg = sp.err;

  const admin = createAdminClient();
  const { data: users } = await admin
    .from("users")
    .select("id, email, name, role")
    .eq("active", true)
    .order("name", { ascending: true });

  const [{ data: activeReminders }, { count: totalActive }] = await Promise.all([
    admin
      .from("office_reminders")
      .select("id, note, remind_date, user_id, created_at")
      .is("dismissed_at", null)
      .order("remind_date", { ascending: true })
      .limit(30),
    admin
      .from("office_reminders")
      .select("*", { count: "exact", head: true })
      .is("dismissed_at", null),
  ]);

  const userMap = new Map<string, { name: string; role: string }>();
  for (const u of users ?? []) {
    userMap.set(u.id, { name: u.name || u.email, role: u.role });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Bell className="w-6 h-6 text-amber-500" aria-hidden />
          Priradiť úlohu tímu
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Zvoľ človeka, dátum a napíš čo má spraviť. Notifikácia sa mu objaví
          v jeho zvončeku vpravo hore od zvoleného dátumu — kým neklikne
          „Hotovo".
        </p>
      </header>

      {success && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✅ Úloha bola priradená. Notifikácia sa objaví u zvoleného usera.
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          ❌ {errorMsg}
        </div>
      )}

      <NewTaskForm users={users ?? []} />

      <section className="rounded-2xl border bg-background overflow-hidden">
        <header className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <h2 className="font-bold inline-flex items-center gap-2">
            📋 Aktívne úlohy{" "}
            <span className="text-muted-foreground font-normal text-sm">
              ({totalActive ?? 0})
            </span>
          </h2>
        </header>
        {(activeReminders?.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground italic">
            Zatiaľ žiadne aktívne úlohy.
          </div>
        ) : (
          <div className="divide-y">
            {activeReminders!.map((r) => {
              const u = userMap.get(r.user_id);
              return (
                <div
                  key={r.id}
                  className="px-4 py-3 flex items-start gap-3 text-sm hover:bg-muted/30"
                >
                  <div className="min-w-[80px] text-xs text-muted-foreground tabular-nums font-semibold">
                    {new Date(r.remind_date).toLocaleDateString("sk-SK", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r.note}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Pre:{" "}
                      <span className="font-semibold text-sky-700">
                        {u?.name ?? "?"}
                      </span>
                      {u && (
                        <span className="ml-1 text-[10px] uppercase tracking-wider bg-slate-100 text-slate-700 px-1 py-0.5 rounded font-bold">
                          {u.role}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
