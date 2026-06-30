import { redirect } from "next/navigation";
import { ClipboardList, MapPin, Calendar, CheckCircle2 } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /obhliadky — Dashboard pre obhliadkára.
 *
 * Zobrazí leady so statusom "scheduled" + interested ktoré boli postúpené
 * obchodníkmi na obhliadku. Obhliadkar prejde na adresu, zameria, vyplní
 * rozmery + fotky → výsledok pošle späť obchodníkovi.
 *
 * Access: rola "obhliadky" alebo "admin". Ostatní → redirect na ich dashboard.
 */
export default async function ObhliadkyDashboard() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  // Access guard — len obhliadky + admin
  if (user.role !== "obhliadky" && user.role !== "admin") {
    const { dashboardPathForRole } = await import("@/lib/roles");
    redirect(dashboardPathForRole(user.role));
  }

  // Načítaj leady ktoré sú na obhliadku — zatiaľ status "scheduled" alebo
  // "interested" (TODO: pridať explicit "needs_inspection" status do schémy)
  const sb = createAdminClient();
  const { data: leadsRaw } = await sb
    .from("leads")
    .select("*")
    .in("status", ["scheduled", "interested"])
    .order("next_callback_at", { ascending: true })
    .limit(50);

  const leads = (leadsRaw ?? []) as Lead[];
  const scheduled = leads.filter((l) => l.status === "scheduled");
  const interested = leads.filter((l) => l.status === "interested");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-violet-500" aria-hidden />
          Obhliadky
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Naplánované a čakajúce obhliadky pre realizačný tím. Po obhliadke
          vyplň rozmery a foto → pošle sa obchodníkovi na cenovú ponuku.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<Calendar className="w-5 h-5 text-violet-600" />}
          label="Naplánované"
          value={scheduled.length}
          tint="violet"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          label="Záujem (čaká na obhliadku)"
          value={interested.length}
          tint="emerald"
        />
        <StatCard
          icon={<MapPin className="w-5 h-5 text-sky-600" />}
          label="Spolu otvorené"
          value={leads.length}
          tint="sky"
        />
      </div>

      {/* TODO panel — kým sa nedorobí plný flow */}
      <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-5 space-y-2">
        <h2 className="font-bold text-amber-900 inline-flex items-center gap-2">
          🚧 Vo výstavbe — kostra dashboardu
        </h2>
        <p className="text-sm text-amber-800">
          Plný obhliadkársky workflow ešte nie je dokončený. Plánované:
        </p>
        <ul className="text-sm text-amber-800 list-disc ml-5 space-y-1">
          <li>
            Vlastný status <code>needs_inspection</code> v DB schéme — obchodník
            posunie lead na obhliadku jedným klikom
          </li>
          <li>
            Formulár pre obhliadkára: rozmery (m²), typ podlahy, foto upload,
            poznámky o teréne (zlý prístup, schody, znečistené, etc.)
          </li>
          <li>
            Auto-assign obhliadok najbližšiemu obhliadkárovi (alebo round-robin
            medzi nimi)
          </li>
          <li>
            Po vyplnení obhliadky → notifikácia obchodníkovi že je pripravená
            cenová ponuka
          </li>
          <li>
            Kalendár filter: obhliadkar vidí <strong>iba obhliadky</strong>,
            nie callbacky obchodníka
          </li>
        </ul>
      </div>

      {/* Provisional lead list */}
      {leads.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Otvorené leady (zatiaľ provizórne — ukáže všetky scheduled/interested)
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
                    {l.status === "scheduled" && (
                      <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-bold">
                        📅 NAPLÁNOVANÉ
                      </span>
                    )}
                    {l.status === "interested" && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        ✅ ZÁUJEM
                      </span>
                    )}
                    {l.next_callback_at && (
                      <span>
                        {new Date(l.next_callback_at).toLocaleString("sk-SK", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
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
          Žiadne otvorené obhliadky. Obchodník zatiaľ nepostúpil nič na obhliadku.
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
