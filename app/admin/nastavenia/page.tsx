import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Hammer,
  GraduationCap,
  Package,
  Palette,
  Settings2,
  Share2,
  Warehouse,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { NastaveniaClient } from "./nastavenia-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/nastavenia — mega admin dashboard so všetkými nastaveniami CRM.
 * User 2026-07-12: „musim mat funkcny admin kde viem ovladat celu stranku".
 *
 * Taby:
 *   1. Firma — IČO/DIČ/PDF footer/e-mail brand
 *   2. Doprava — sadzby + rezerva + rýchlosť
 *   3. Mestá — vzdialenosti od HQ (CRUD)
 *   4. Sika katalóg — SAP produkty (CRUD)
 *   5. Vlastné materiály — pridané položky do cenníka
 *   6. Zľavy — množstevné thresholds
 *   7. Skolenie — training moduly
 */
export default async function NastaveniaAdminPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const admin = createAdminClient();
  const [
    settingsRes,
    citiesRes,
    sikaRes,
    trainingRes,
    materialsRes,
  ] = await Promise.all([
    admin.from("app_settings").select("key, value, label, description").order("key"),
    admin.from("city_distances").select("*").order("label"),
    admin.from("sika_catalog").select("*").order("name"),
    admin.from("training_modules").select("*").order("sort_order"),
    admin.from("custom_materials").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
          <Settings2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">Nastavenia CRM</h1>
          <p className="text-sm text-muted-foreground">
            Všetko na jednom mieste — sub-moduly hore + firemné údaje, doprava,
            mestá, Sika katalóg, zľavy a školenie nižšie.
          </p>
        </div>
      </header>

      {/* Sub-moduly — user 2026-07-12: „vsetko toto uz musi admin vediet
          ovladat manualne cez admina takze make sure to vsetko funguje".
          Realizačné systémy, Podklady, Kontent, Tímy, Objednávky, Sklad,
          Realne dáta — priamy prístup ku každému. */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
            Sub-moduly · klikni pre editáciu
          </div>
        </div>
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SubmoduleTile
            href="/admin/generator-nastavenia"
            title="Nastavenia Generátora CP"
            desc="Defaultné systémy per typ podlahy (Sikafloor 264 / TopStopne…), Cenník materiálov, Realizačné systémy, množstevné zľavy, Firma + Doprava."
            Icon={Settings2}
            tint="sky"
          />
          <SubmoduleTile
            href="/admin/sklad"
            title="Skladové zásoby"
            desc="Aktuálny stav materiálu na sklade. Realizátor pri tlači sa auto-odpočíta."
            Icon={Warehouse}
            tint="orange"
            badge="🚧 In build"
          />
          <SubmoduleTile
            href="/admin/objednavky"
            title="Objednávky materiálu"
            desc="Generuj objednávkové tabuľky pre Siku / Topstone."
            Icon={Package}
            tint="orange"
            badge="🚧 In build"
          />
          <SubmoduleTile
            href="/admin/realne-data"
            title="Realne dáta"
            desc="Analytika z dokončených realizácií — časy fáz, spotreba, problémy."
            Icon={BarChart3}
            tint="amber"
            badge="🚧 In build"
          />
          <SubmoduleTile
            href="/admin/podklady"
            title="Podklady"
            desc="Všetky materiály pre tím — Call scripty (interaktívne scenáre), Kontent shotlist (foto/video), Sales tips, protokoly, cenníky. Rozdeľujú sa podľa role."
            Icon={GraduationCap}
            tint="violet"
            badge="🚧 In build"
          />
          <SubmoduleTile
            href="/admin/meta-setup"
            title="Meta OAuth setup"
            desc="Step-by-step: nastavenie System User Access Token pre Meta (FB/IG) tak aby nikdy nevypršal. Fix pre 'graph_me_accounts_failed' + META_PAGE_IDS bypass."
            Icon={Share2}
            tint="violet"
            badge="🔧 fix"
          />
        </div>
      </section>

      <NastaveniaClient
        settings={(settingsRes.data ?? []) as Array<{ key: string; value: unknown; label: string; description: string }>}
        cities={(citiesRes.data ?? []) as Array<{ slug: string; label: string; km_from_hq: number; active: boolean }>}
        sika={(sikaRes.data ?? []) as Array<{ sap_number: string; name: string; packaging: string; packaging_kg: number | null; category: string | null; active: boolean }>}
        training={(trainingRes.data ?? []) as Array<{ id: string; title: string; description: string | null; kind: string; media_url: string | null; duration_min: number | null; role_target: string[]; required: boolean; active: boolean }>}
        materials={(materialsRes.data ?? []) as Array<{ id: string; slug: string; label: string; category: string | null; price_per_sqm: number | null; price_per_unit: number | null; unit_label: string | null; active: boolean }>}
      />
    </div>
  );
}

function SubmoduleTile({
  href,
  title,
  desc,
  Icon,
  tint,
  badge,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: typeof Settings2;
  tint: "emerald" | "violet" | "fuchsia" | "orange" | "amber" | "sky";
  badge?: string;
}) {
  // Dark-first redesign — všetky tiles majú rovnaký neutrálny slate card,
  // farebný tint sa vyskytuje LEN v ikonke (accent, nie background wash).
  // User 2026-07-18: „NENI PEKNY TEN DARK THEME... TA FIALOVA ZLTA, NEDA SA
  // CITAT". Solid neutral background + high-contrast text.
  const iconMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/60",
    fuchsia: "text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-100 dark:bg-fuchsia-950/60",
    orange: "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60",
    sky: "text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/60",
  };
  const isFix = badge?.toLowerCase().includes("fix");
  return (
    <Link
      href={href}
      className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 md:p-6 min-h-[140px] transition-all hover:border-sky-400 dark:hover:border-sky-600 hover:shadow-md dark:hover:bg-slate-900 flex items-start gap-4"
    >
      <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center shrink-0 ${iconMap[tint]}`}>
        <Icon className="w-6 h-6 md:w-7 md:h-7" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-black text-base md:text-lg inline-flex items-center gap-2 flex-wrap text-slate-900 dark:text-slate-100">
          {title}
          {badge && (
            <span
              className={
                "rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider " +
                (isFix
                  ? "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700")
              }
            >
              {badge}
            </span>
          )}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
          {desc}
        </div>
      </div>
      <div className="text-2xl font-black text-slate-400 dark:text-slate-600 group-hover:text-sky-500 dark:group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all shrink-0">
        →
      </div>
    </Link>
  );
}
