import { redirect } from "next/navigation";
import { AlertCircle, Users } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { getTeamWorkload, formatInactive } from "@/lib/team";
import { CapacityControl, ActiveToggle } from "./client-controls";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /agent/team — admin-only Team workload + inactivity dashboard.
 *
 * Zobrazuje:
 *   - Každého obchodníka v jednom riadku
 *   - Capacity slider (0-10) — drag = save inline
 *   - Aktuálne load (active / capacity = ratio)
 *   - Posledná aktivita (pred Xh)
 *   - ⚠️ inactive badge ak > 48h
 *
 * V dev móde (peter=user) je page prístupná pre testovanie — len v prode RBAC.
 */
export default async function TeamPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  // V prode admin-only. V dev necháme aj usera prejsť (pre test).
  if (process.env.NODE_ENV === "production" && me.role !== "admin") {
    redirect("/agent");
  }

  const agents = await getTeamWorkload();
  const inactiveCount = agents.filter((a) => a.inactive_flag).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-sky-500" aria-hidden />
          Tím{" "}
          <span className="text-sky-500">({agents.length})</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vyťaženie a aktivita obchodníkov. Capacity 0–10 určuje koľko leadov dostane (0 = pauzovaný, 5 = default, 10 = top performer).
        </p>
      </header>

      {inactiveCount > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            <h3 className="font-bold text-amber-900 dark:text-amber-200">
              {inactiveCount}{" "}
              {inactiveCount === 1 ? "obchodník neaktívny" : "obchodníci neaktívni"} viac ako 48 hodín
            </h3>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Skontroluj že sú v poriadku. Ak na trvalo, prepni ich na inactive.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-bold">Obchodník</th>
              <th className="px-4 py-3 font-bold text-center">Capacity</th>
              <th className="px-4 py-3 font-bold text-center">Load (aktívne)</th>
              <th className="px-4 py-3 font-bold text-center">Spolu</th>
              <th className="px-4 py-3 font-bold">Posledná aktivita</th>
              <th className="px-4 py-3 font-bold text-center">Aktívny</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const ratio =
                a.capacity > 0 ? a.active_leads / a.capacity : Infinity;
              const ratioPct = Math.min(100, Math.round(ratio * 50)); // 100% = ratio 2.0
              const ratioColor =
                ratio >= 1.5
                  ? "bg-red-500"
                  : ratio >= 1
                    ? "bg-amber-500"
                    : "bg-emerald-500";
              return (
                <tr
                  key={a.id}
                  className="border-t last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.email}
                      {a.role === "admin" && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold uppercase tracking-wider">
                          admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.role === "user" ? (
                      <CapacityControl
                        userId={a.id}
                        initial={a.capacity}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <div className="font-bold">
                        {a.active_leads}
                        {a.capacity > 0 && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            / {a.capacity}
                          </span>
                        )}
                      </div>
                      {a.capacity > 0 && (
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${ratioColor} transition-all`}
                            style={{ width: `${ratioPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {a.total_leads}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          a.inactive_flag
                            ? "text-amber-700 dark:text-amber-400 font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {formatInactive(a.inactive_hours)}
                      </span>
                      {a.inactive_flag && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">
                          <AlertCircle className="w-3 h-3" aria-hidden />
                          48h+
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ActiveToggle userId={a.id} initial={a.active} />
                  </td>
                </tr>
              );
            })}
            {agents.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Žiadni obchodníci. Pridaj prvého cez Admin → Team.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
