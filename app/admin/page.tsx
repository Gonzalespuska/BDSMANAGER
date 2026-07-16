import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Eye,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { AdminHealthBanner } from "./admin-health-banner";
import { LeadStatsPanel } from "./lead-stats-panel";

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

  // Note: lead stats sa fetchujú client-side v LeadStatsPanel (dynamický
  // time window switcher 1d/7d/30d/všetko). Preto tu už žiadny lead count.
  void admin; // used by admin sections below only

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
      desc: "Všetko na jednom mieste: Realizačné systémy · Podklady/Call skripty · Kontent shotlist · Tímy · Objednávky · Sklad · Realne dáta · Meta OAuth setup · firemné údaje · doprava · mestá · Sika katalóg · zľavy.",
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

      {/* SyncHealthWidget odstranený 2026-07-15 — false-positive alarm
          UI je nezmyselný keď je celý cron zdravý. Monitoring zostáva
          na ntfy.sh push. */}

      {/* LEADY — client-side widget s time window switcher.
          User 2026-07-15: „toto ma byt jedna bublina ktora ta linkne na
          vsetky leady, a dole iba rozdelene proste 51 web 62 meta atd
          nemusi tam byt link... nech sa to tu da menit ze 1d 7d 30d atd". */}
      <LeadStatsPanel />

      {/* Tím sekcia je skrytá — user 2026-07-15: „toto skry do tim
          sekcie". Karta „Tím" v sections grid (nižšie) linkne na
          /admin/agents kde vidí obchodákov / obhliadkárov / realizátorov
          rozdelene s možnosťou editovať permissions. */}

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

