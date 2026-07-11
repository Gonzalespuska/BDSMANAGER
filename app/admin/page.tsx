import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Eye,
  GraduationCap,
  Hammer,
  Package,
  Share2,
  Settings,
  TrendingUp,
  UserPlus,
  Users,
  Warehouse,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * /admin — Dashboard pre admina. Quick stats + odkazy na podsekcie.
 *
 * Postupne sa pridajú:
 *   - /admin/agents     ✅ správa agentov (add/edit/deactivate)
 *   - /admin/materials  🚧 cenník + sadzby (zatiaľ v kóde)
 *   - /admin/settings   🚧 globálne (marže, doprava, min objednávka)
 *   - /admin/audit      🚧 audit log
 */
export default async function AdminDashboard() {
  // Quick stats
  const admin = createAdminClient();

  const iso30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [
    { count: agentsCount },
    { count: meta30d },
    { count: totalLeads },
  ] = await Promise.all([
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
      .eq("role", "obchod"),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("source_type", ["facebook", "instagram"])
      .gte("created_at", iso30d),
    admin.from("leads").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    {
      label: "Aktívni obchodníci",
      value: agentsCount ?? 0,
      icon: Users,
      color: "sky",
    },
    {
      label: "Leady z Mety (30d)",
      value: meta30d ?? 0,
      icon: Share2,
      color: "indigo",
    },
    {
      label: "Leady celkovo",
      value: totalLeads ?? 0,
      icon: TrendingUp,
      color: "amber",
    },
  ];

  const sections: Array<{
    href: string;
    title: string;
    desc: string;
    icon: typeof Users;
    badge?: string;
    disabled?: boolean;
  }> = [
    {
      href: "/admin/prehlad",
      title: "Prehľad — supervision",
      desc: "Realtime — posledné leady, obhliadky aj realizácie na jednom screene. Nový lead sa objaví hore hneď ako príde (web/Meta/Google).",
      icon: Eye,
      badge: "🔴 live",
    },
    {
      href: "/admin/uloha",
      title: "Priradiť úlohu tímu",
      desc: "Napíš čo má kto spraviť + kedy. Notifikácia sa mu objaví v zvončeku od zvoleného dátumu (napr. „Zavolať Petrovi späť 12.7.\").",
      icon: Bell,
    },
    {
      href: "/admin/agents",
      title: "Tím",
      desc: "Pridať obchodníkov / obhliadkárov / realizačný tím, sledovať aktivitu. Klik na meno → detail + permissions.",
      icon: UserPlus,
    },
    {
      href: "/admin/systems",
      title: "Realizačné systémy",
      desc: "Definuj systémy (264, 3000, TopStopne…), ich komponenty (primer, živica, lak) so spotrebou v kg/m² a veľkosťou balenia. Uprav postupy krokov pre realizatora.",
      icon: Hammer,
    },
    {
      href: "/admin/podklady",
      title: "Podklady — Call skripty",
      desc: "Edituj call scripty pre obchodákov podľa typu podlahy + priestoru (mramor-dom, chipsová-firma…). Obchodáci ich otvoria priamo na leade.",
      icon: GraduationCap,
    },
    {
      href: "/admin/objednavky",
      title: "Objednávky materiálu",
      desc: "Generuj objednávkové tabuľky pre Siku / Topstone (SAP # + názov + balenie + ks → PDF).",
      icon: Package,
      badge: "🚧 In building",
    },
    {
      href: "/admin/sklad",
      title: "Skladové zásoby",
      desc: "Aktuálny stav materiálu na sklade (Sika/Topstone). Ručne pridávaj po prijatí, alert pri nízkom stave. Realizátor pri tlači tlačiva sa auto-odpočíta.",
      icon: Warehouse,
    },
    {
      href: "/admin/settings",
      title: "Nastavenia",
      desc: "Materiály & cenník generátora, marže, DPH, doprava, min. objednávka.",
      icon: Settings,
      badge: "🚧 In building",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Správa tímu, cenníkov a celkového nastavenia Epoxidovo CRM.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border bg-background p-4 flex items-start justify-between gap-3"
          >
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                {label}
              </div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums">
                {value}
              </div>
            </div>
            <Icon className="w-6 h-6 text-muted-foreground/60" aria-hidden />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ href, title, desc, icon: Icon, badge, disabled }) => {
          const isInBuilding = badge?.toLowerCase().includes("building");
          const isLive = badge?.toLowerCase().includes("live");
          if (disabled) {
            return (
              <div
                key={href}
                className="rounded-xl border bg-muted/30 p-4 opacity-60 cursor-not-allowed"
              >
                <SectionCardInner
                  title={title}
                  desc={desc}
                  Icon={Icon}
                  badge={badge}
                  disabled
                />
              </div>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={
                "group relative rounded-xl border-2 bg-background p-4 transition-all hover:shadow-md " +
                (isInBuilding
                  ? "border-amber-200 hover:border-amber-400 hover:bg-amber-50/40"
                  : isLive
                    ? "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/40"
                    : "border-slate-200 hover:border-sky-300 hover:bg-sky-50/40")
              }
            >
              <SectionCardInner
                title={title}
                desc={desc}
                Icon={Icon}
                badge={badge}
                isInBuilding={isInBuilding}
                isLive={isLive}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SectionCardInner({
  title,
  desc,
  Icon,
  badge,
  disabled,
  isInBuilding,
  isLive,
}: {
  title: string;
  desc: string;
  Icon: typeof Users;
  badge?: string;
  disabled?: boolean;
  isInBuilding?: boolean;
  isLive?: boolean;
}) {
  const iconColor = disabled
    ? "text-muted-foreground"
    : isInBuilding
      ? "text-amber-600"
      : isLive
        ? "text-emerald-600"
        : "text-sky-600";
  const badgeClass = isInBuilding
    ? "bg-amber-100 text-amber-800 border border-amber-300"
    : isLive
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
      : "bg-muted text-muted-foreground";
  const arrowColor = isInBuilding
    ? "group-hover:text-amber-700"
    : isLive
      ? "group-hover:text-emerald-700"
      : "group-hover:text-sky-600";
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Icon className={"w-5 h-5 " + iconColor} aria-hidden />
        {badge && (
          <span
            className={
              "text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded " +
              badgeClass
            }
          >
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 text-base font-extrabold tracking-tight inline-flex items-center gap-1">
        {title}
        {!disabled && (
          <ArrowRight
            className={
              "w-3.5 h-3.5 text-muted-foreground transition-all group-hover:translate-x-0.5 " +
              arrowColor
            }
            aria-hidden
          />
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{desc}</p>
    </>
  );
}

