import { redirect } from "next/navigation";
import Link from "next/link";
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

  // Načítaj leady na obhliadku — priorita: needs_inspection (nový status,
  // vyžaduje DB migration 10). Fallback: scheduled/interested pre admin
  // ak migration ešte nebola spustená.
  const sb = createAdminClient();

  // needs_inspection filter podľa role — obhliadkar iba svoje, admin všetko
  const baseQuery = sb
    .from("leads")
    .select("*")
    .eq("status", "needs_inspection")
    .order("inspection_at", { ascending: false })
    .limit(50);
  const scopedQuery =
    user.role === "admin" ? baseQuery : baseQuery.eq("inspection_by", user.id);

  const { data: leadsRaw, error: needsErr } = await scopedQuery;

  // Fallback pre pre-migration DB — ak needs_inspection status neexistuje
  // v CHECK constraint, aspoň zobrazíme legacy scheduled leady
  let fallbackLeads: Lead[] = [];
  if ((needsErr || (leadsRaw?.length ?? 0) === 0) && user.role === "admin") {
    const { data } = await sb
      .from("leads")
      .select("*")
      .in("status", ["scheduled", "interested"])
      .order("last_activity_at", { ascending: false })
      .limit(20);
    fallbackLeads = (data ?? []) as Lead[];
  }

  const leads = ((leadsRaw ?? []) as Lead[]).length > 0
    ? (leadsRaw as Lead[])
    : fallbackLeads;
  const scheduled = leads.filter((l) => l.status === "needs_inspection" || l.status === "scheduled");
  const interested = leads.filter((l) => l.status === "interested");
  const showLegacyProxy = fallbackLeads.length > 0 && (leadsRaw?.length ?? 0) === 0;

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

      {/* Pre-migration proxy warning */}
      {showLegacyProxy && (
        <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-900">
          🚧 <strong>DB migrácia 10_role_handoff.sql ešte nebola spustená</strong> — zobrazujem legacy proxy (scheduled + interested statusy). Po spustení migrácie sa tu ukážu iba tie, ktoré ti obchodník explicitne posunul cez tlačítko "Poslať na obhliadku".
        </div>
      )}

      {/* Lead list — clickable → detail */}
      {leads.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Otvorené obhliadky ({leads.length})
          </h2>
          <ul className="space-y-2">
            {leads.map((l) => {
              const data = (l.data ?? {}) as Record<string, string>;
              return (
                <li key={l.id}>
                  <Link
                    href={`/obhliadky/${l.id}`}
                    className="block rounded-xl border-2 border-violet-200 bg-violet-50/40 p-4 hover:bg-violet-50/70 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-bold text-base">{l.name}</div>
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-1">
                          {data.lokalita && <span>📍 {data.lokalita}</span>}
                          {data.plocha && <span>~{data.plocha} m²</span>}
                          {data.typ_podlahy && <span>· {data.typ_podlahy}</span>}
                          {l.phone && <span>· 📞 {l.phone}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {l.status === "needs_inspection" && (
                          <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[10px] font-bold uppercase tracking-wider">
                            NA OBHLIADKU
                          </span>
                        )}
                        {l.status === "scheduled" && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold uppercase tracking-wider">
                            📅 NAPLÁNOVANÉ
                          </span>
                        )}
                        {l.status === "interested" && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                            ✅ ZÁUJEM
                          </span>
                        )}
                        {l.next_callback_at && (
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(l.next_callback_at).toLocaleString("sk-SK", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
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
