import { redirect } from "next/navigation";
import { Hammer, Calendar, Package, CheckCircle2 } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /realizacie — Dashboard pre realizačný tím.
 *
 * Zobrazí leady so statusom "won" alebo "quote_sent" (dohodnuté zákazky)
 * ktoré sú pripravené na realizáciu. Realizačný tím má vlastný kalendár,
 * objektový plán a materiálové výdaje.
 *
 * Access: rola "realizacie" alebo "admin". Ostatní → redirect.
 */
export default async function RealizacieDashboard() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  if (user.role !== "realizacie" && user.role !== "admin") {
    const { dashboardPathForRole } = await import("@/lib/roles");
    redirect(dashboardPathForRole(user.role));
  }

  // Načítaj leady ktoré sú "won" (dohodnuté) alebo "quote_sent" (akceptované
  // ponuky čakajúce na potvrdenie termínu).
  const sb = createAdminClient();
  const { data: leadsRaw } = await sb
    .from("leads")
    .select("*")
    .in("status", ["won", "quote_sent"])
    .order("created_at", { ascending: false })
    .limit(50);

  const leads = (leadsRaw ?? []) as Lead[];
  const inProgress = leads.filter((l) => l.status === "won");
  const pending = leads.filter((l) => l.status === "quote_sent");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Hammer className="w-6 h-6 text-emerald-500" aria-hidden />
          Realizácie
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Naplánované a prebiehajúce zákazky. Material, harmonogram, denný plán.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<Calendar className="w-5 h-5 text-emerald-600" />}
          label="Aktívne realizácie"
          value={inProgress.length}
          tint="emerald"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-violet-600" />}
          label="Čakajú na potvrdenie termínu"
          value={pending.length}
          tint="violet"
        />
        <StatCard
          icon={<Package className="w-5 h-5 text-sky-600" />}
          label="Spolu otvorené"
          value={leads.length}
          tint="sky"
        />
      </div>

      {/* TODO panel */}
      <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-5 space-y-2">
        <h2 className="font-bold text-amber-900 inline-flex items-center gap-2">
          🚧 Vo výstavbe — kostra dashboardu
        </h2>
        <p className="text-sm text-amber-800">
          Plný realizačný workflow ešte nie je dokončený. Plánované:
        </p>
        <ul className="text-sm text-amber-800 list-disc ml-5 space-y-1">
          <li>
            Vlastný status <code>in_realization</code> v DB — obchodník posunie
            zákazku zo "won" do realizácie
          </li>
          <li>
            Objektový plán: každá realizácia má harmonogram (deň 1: brúsenie,
            deň 2: penetrácia, deň 3: náter, …) generovaný z dĺžky realizácie
          </li>
          <li>
            Materiálové výdaje: prepočet kg materiálu na deň + checklist čo
            naložiť do dodávky
          </li>
          <li>
            Foto pred/po — upload do galérie pre marketing + neskoršie reklamácie
          </li>
          <li>
            Kalendár filter: realizačný tím vidí <strong>iba realizácie</strong>,
            nie obhliadky ani callbacky
          </li>
        </ul>
      </div>

      {/* Provisional lead list */}
      {leads.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Otvorené zákazky (zatiaľ provizórne — won + quote_sent)
          </h2>
          <ul className="space-y-2">
            {leads.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border bg-background p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-bold truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-1">
                    {l.status === "won" && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        🏆 DOHODNUTÉ
                      </span>
                    )}
                    {l.status === "quote_sent" && (
                      <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-bold">
                        📋 PONUKA ODOSLANÁ
                      </span>
                    )}
                    {l.value_estimate != null && (
                      <span className="font-bold text-foreground">
                        {l.value_estimate.toLocaleString("sk-SK")} €
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  TODO: detail link →
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
          Žiadne otvorené zákazky. Obchodník zatiaľ nepostúpil nič do realizácie.
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "violet" | "emerald" | "sky";
}) {
  const tintBg = {
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
    sky: "bg-sky-50 border-sky-200",
  }[tint];
  return (
    <div className={`rounded-2xl border-2 ${tintBg} p-4`}>
      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-extrabold tabular-nums mt-1.5">{value}</div>
    </div>
  );
}
