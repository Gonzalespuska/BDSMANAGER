import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Eye,
  Globe,
  HardHat,
  Search as SearchIcon,
  Settings,
  Share2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { AdminHealthBanner } from "./admin-health-banner";
import { LeadDistributionPanel } from "./lead-distribution-panel";
import { SyncHealthWidget } from "./sync-health-widget";

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
  // 30-dňové okno rozdelené podľa source_type — user 2026-07-15 pýtal
  // rozbitie na Meta / Web / Google + celkový total. Každá karta je
  // klikateľná → /admin/leads?source=meta&… atď.
  const [
    { count: obchodCount },
    { count: obhliadkyCount },
    { count: realizacieCount },
    { count: meta30d },
    { count: web30d },
    { count: google30d },
    { count: totalLeads },
  ] = await Promise.all([
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
      .eq("role", "obchod"),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
      .eq("role", "obhliadky"),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
      .eq("role", "realizacie"),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("source_type", ["facebook", "instagram", "meta_form", "fb_lead_ads"])
      .gte("created_at", iso30d),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("source_type", ["web_webhook", "website", "web"])
      .gte("created_at", iso30d),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("source_type", "google")
      .gte("created_at", iso30d),
    admin.from("leads").select("*", { count: "exact", head: true }),
  ]);

  // Team stats — user 2026-07-15: „ten tim bol rozdeleni na obchodnici
  // obhlaidkari relaizatori". Každá je klikateľná → /admin/agents.
  const teamStats: Array<{
    label: string;
    value: number;
    icon: typeof Users;
    href: string;
    tint: "sky" | "violet" | "amber";
  }> = [
    {
      label: "Obchodníci",
      value: obchodCount ?? 0,
      icon: Users,
      href: "/admin/agents?role=obchod",
      tint: "sky",
    },
    {
      label: "Obhliadkari",
      value: obhliadkyCount ?? 0,
      icon: UserCheck,
      href: "/admin/agents?role=obhliadky",
      tint: "violet",
    },
    {
      label: "Realizátori",
      value: realizacieCount ?? 0,
      icon: HardHat,
      href: "/admin/agents?role=realizacie",
      tint: "amber",
    },
  ];

  // Lead stats — Meta / Web / Google (30d) + celkový počet.
  const leadStats: Array<{
    label: string;
    value: number;
    icon: typeof Users;
    href: string;
    tint: "indigo" | "sky" | "rose" | "emerald";
  }> = [
    {
      label: "Meta (30d)",
      value: meta30d ?? 0,
      icon: Share2,
      href: "/admin/leads?source=meta",
      tint: "indigo",
    },
    {
      label: "Web (30d)",
      value: web30d ?? 0,
      icon: Globe,
      href: "/admin/leads?source=web",
      tint: "sky",
    },
    {
      label: "Google (30d)",
      value: google30d ?? 0,
      icon: SearchIcon,
      href: "/admin/leads?source=google",
      tint: "rose",
    },
    {
      label: "Leady celkovo",
      value: totalLeads ?? 0,
      icon: TrendingUp,
      href: "/admin/leads",
      tint: "emerald",
    },
  ];

  // User 2026-07-12: „nech maju farbu ako tie buttons vidia aj realizatori"
  // — admin sekcie zladené s farbami realizator/obchod UI. Postup=emerald,
  // Kontent=fuchsia, Podklady/CallScripts=violet (ako CP violet button).
  const sections: Array<{
    href: string;
    title: string;
    desc: string;
    icon: typeof Users;
    badge?: string;
    disabled?: boolean;
    tint?: "emerald" | "fuchsia" | "violet" | "orange" | "sky" | "amber";
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
    // User 2026-07-12: „toto vsetko dajme do nastavenia crm, takisto to
    // nastavenia dole co je in building to spojme tam budu vsetky
    // nastavenia v jednom". Realizačné systémy, Podklady, Kontent shotlist,
    // Realizačné tímy, Objednávky, Sklad, Realne dáta, (staré) Nastavenia
    // → všetky zjednotené pod „Nastavenia CRM".
    {
      href: "/admin/nastavenia",
      title: "Nastavenia CRM",
      desc: "Všetko na jednom mieste: Realizačné systémy · Podklady/Call skripty · Kontent shotlist · Tímy · Objednávky · Sklad · Realne dáta · firemné údaje · doprava · mestá · Sika katalóg · zľavy.",
      icon: Settings,
      tint: "sky",
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

      {/* DB health check — user 2026-07-12: „ma to vsetko fungovat".
          Ukazuje ktoré migrácie sú nespustené — bez nich CRUD nemá kam
          písať a admin sub-moduly hlásia „0 items" alebo tichú chybu. */}
      <AdminHealthBanner />

      <SyncHealthWidget />

      <LeadDistributionPanel />

      {/* TÍM — split podľa role. Klik na kartu → /admin/agents s
          role filtrom (obchod / obhliadky / realizacie). */}
      <section>
        <h2 className="text-[11px] uppercase tracking-wider font-black text-muted-foreground mb-2">
          Tím
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {teamStats.map(({ label, value, icon: Icon, href, tint }) => (
            <StatCard
              key={label}
              label={label}
              value={value}
              Icon={Icon}
              href={href}
              tint={tint}
            />
          ))}
        </div>
      </section>

      {/* LEADY — split podľa source_type (30d) + celkový total.
          User 2026-07-15: „leady rozdelene na metu web a google,
          na leady celkovo sa dalo kliknut". */}
      <section>
        <h2 className="text-[11px] uppercase tracking-wider font-black text-muted-foreground mb-2">
          Leady
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {leadStats.map(({ label, value, icon: Icon, href, tint }) => (
            <StatCard
              key={label}
              label={label}
              value={value}
              Icon={Icon}
              href={href}
              tint={tint}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ href, title, desc, icon: Icon, badge, disabled, tint }) => {
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
          // Tint-based border/hover — zladené s realizator/obchod button
          // farbami (Postup=emerald, Kontent=fuchsia, Podklady=violet,
          // Inventúra=orange). Fallback na starú logiku podľa badge.
          const tintCls = tint
            ? tint === "emerald"
              ? "border-emerald-300 bg-emerald-50/30 hover:border-emerald-500 hover:bg-emerald-50/70"
              : tint === "fuchsia"
                ? "border-fuchsia-300 bg-fuchsia-50/30 hover:border-fuchsia-500 hover:bg-fuchsia-50/70"
                : tint === "violet"
                  ? "border-violet-300 bg-violet-50/30 hover:border-violet-500 hover:bg-violet-50/70"
                  : tint === "orange"
                    ? "border-orange-300 bg-orange-50/30 hover:border-orange-500 hover:bg-orange-50/70"
                    : tint === "sky"
                      ? "border-sky-300 bg-sky-50/30 hover:border-sky-500 hover:bg-sky-50/70"
                      : "border-amber-300 bg-amber-50/30 hover:border-amber-500 hover:bg-amber-50/70"
            : isInBuilding
              ? "border-amber-200 hover:border-amber-400 hover:bg-amber-50/40"
              : isLive
                ? "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/40"
                : "border-slate-200 hover:border-sky-300 hover:bg-sky-50/40";
          return (
            <Link
              key={href}
              href={href}
              className={
                "group relative rounded-xl border-2 bg-background p-4 transition-all hover:shadow-md " +
                tintCls
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

/**
 * StatCard — klikateľná stat karta pre dashboard (Tím + Leady sekcia).
 * Farebne tinted podľa role/zdroja + hover state + šípka vpravo hore
 * indikuje že je klikateľná (predtým bola static div → user zrušil).
 */
function StatCard({
  label,
  value,
  Icon,
  href,
  tint,
}: {
  label: string;
  value: number;
  Icon: typeof Users;
  href: string;
  tint: "sky" | "violet" | "amber" | "indigo" | "rose" | "emerald";
}) {
  const tintMap: Record<
    typeof tint,
    { border: string; text: string; bgHover: string; iconBg: string }
  > = {
    sky: {
      border: "border-sky-200 hover:border-sky-400",
      text: "text-sky-700",
      bgHover: "hover:bg-sky-50/60",
      iconBg: "bg-sky-100 text-sky-600",
    },
    violet: {
      border: "border-violet-200 hover:border-violet-400",
      text: "text-violet-700",
      bgHover: "hover:bg-violet-50/60",
      iconBg: "bg-violet-100 text-violet-600",
    },
    amber: {
      border: "border-amber-200 hover:border-amber-400",
      text: "text-amber-700",
      bgHover: "hover:bg-amber-50/60",
      iconBg: "bg-amber-100 text-amber-600",
    },
    indigo: {
      border: "border-indigo-200 hover:border-indigo-400",
      text: "text-indigo-700",
      bgHover: "hover:bg-indigo-50/60",
      iconBg: "bg-indigo-100 text-indigo-600",
    },
    rose: {
      border: "border-rose-200 hover:border-rose-400",
      text: "text-rose-700",
      bgHover: "hover:bg-rose-50/60",
      iconBg: "bg-rose-100 text-rose-600",
    },
    emerald: {
      border: "border-emerald-200 hover:border-emerald-400",
      text: "text-emerald-700",
      bgHover: "hover:bg-emerald-50/60",
      iconBg: "bg-emerald-100 text-emerald-600",
    },
  };
  const t = tintMap[tint];
  return (
    <Link
      href={href}
      className={`group rounded-xl border-2 bg-background p-4 flex items-start justify-between gap-3 transition-all hover:shadow-sm ${t.border} ${t.bgHover}`}
    >
      <div className="min-w-0">
        <div
          className={`text-[10px] uppercase tracking-wider font-black ${t.text} inline-flex items-center gap-1`}
        >
          {label}
          <ArrowRight
            className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
        </div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums">{value}</div>
      </div>
      <div
        className={`shrink-0 rounded-lg p-2 ${t.iconBg}`}
        aria-hidden
      >
        <Icon className="w-5 h-5" />
      </div>
    </Link>
  );
}
