import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Eye,
  Layers,
  Plug,
  Settings,
  TrendingUp,
  UserPlus,
  Users,
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
  const [{ count: agentsCount }, { count: activeLeads }, { count: totalLeads }] =
    await Promise.all([
      admin
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("active", true)
        .eq("role", "obchod"),
      admin
        .from("leads")
        .select("*", { count: "exact", head: true })
        .not("status", "in", "(won,lost,archived)"),
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
      label: "Otvorené leady",
      value: activeLeads ?? 0,
      icon: Activity,
      color: "emerald",
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
      desc: "Read-only audit view. Posledné leady, obhliadky aj realizácie na jednom screene. Skontroluj že tím tečie a nikde nezasekol.",
      icon: Eye,
    },
    {
      href: "/admin/agents",
      title: "Tím & Workload",
      desc: "Pridať obchodníkov / obhliadkárov / realizačný tím, sledovať aktivitu. Klik na meno → detail + permissions.",
      icon: UserPlus,
    },
    {
      href: "/admin/integracie",
      title: "Integrácie — health",
      desc: "Lead webhook zdroje (web, Meta, Google) + env vars status. Vidíš tu prečo prípadne 'leady nechodia' a ako to opraviť.",
      icon: Plug,
    },
    {
      href: "/admin/materials",
      title: "Materiály a sadzby",
      desc: "Cenník generátora ponúk — 4 typy podlahy + voliteľné operácie.",
      icon: Layers,
      badge: "🚧 čoskoro",
      disabled: true,
    },
    {
      href: "/admin/settings",
      title: "Nastavenia",
      desc: "Marže, sadzby dopravy, minimálna objednávka, DPH.",
      icon: Settings,
      badge: "🚧 čoskoro",
      disabled: true,
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
        {sections.map(({ href, title, desc, icon: Icon, badge, disabled }) =>
          disabled ? (
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
          ) : (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border bg-background p-4 transition-all hover:border-sky-300 hover:bg-sky-50/40 hover:shadow-sm"
            >
              <SectionCardInner
                title={title}
                desc={desc}
                Icon={Icon}
                badge={badge}
              />
            </Link>
          ),
        )}
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
}: {
  title: string;
  desc: string;
  Icon: typeof Users;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Icon
          className={
            "w-5 h-5 " + (disabled ? "text-muted-foreground" : "text-sky-600")
          }
          aria-hidden
        />
        {badge && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 text-base font-extrabold tracking-tight inline-flex items-center gap-1">
        {title}
        {!disabled && (
          <ArrowRight
            className="w-3.5 h-3.5 text-muted-foreground group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all"
            aria-hidden
          />
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{desc}</p>
    </>
  );
}
