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
        <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
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
      <section className="rounded-2xl border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-black uppercase tracking-widest text-sky-900">
            🔧 Sub-moduly (klikni pre editáciu)
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <SubmoduleTile
            href="/admin/systems"
            title="Realizačné systémy"
            desc="Definuj 264, 3000, TopStone… + spotreba kg/m² + postup krokov + knižnica krokov."
            Icon={Hammer}
            tint="emerald"
          />
          <SubmoduleTile
            href="/admin/podklady"
            title="Podklady"
            desc="Všetky materiály pre tím — Call scripty (interaktívne scenáre), Kontent shotlist (foto/video), Sales tips, protokoly, cenníky. Rozdeľujú sa podľa role."
            Icon={GraduationCap}
            tint="violet"
          />
          <SubmoduleTile
            href="/admin/cennik-materialov"
            title="Cenník materiálov"
            desc="Prepis €/m² pre 18 materiálov ktoré generátor CP používa (jednofarebná / chipsová / mramorová / metalická). Prázdne = default z kódu."
            Icon={Palette}
            tint="violet"
          />
          <SubmoduleTile
            href="/admin/generator-nastavenia"
            title="Nastavenia Generátora CP"
            desc="Defaultné systémy per typ podlahy (Sikafloor 264 / TopStopne…), množstevné zľavy tiers, materiálové markupy per rola."
            Icon={Settings2}
            tint="sky"
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
            href="/admin/sklad"
            title="Skladové zásoby"
            desc="Aktuálny stav materiálu na sklade. Realizátor pri tlači sa auto-odpočíta."
            Icon={Warehouse}
            tint="orange"
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
  const bgMap: Record<string, string> = {
    emerald: "border-emerald-300 bg-emerald-50 hover:border-emerald-500 hover:bg-emerald-100/70",
    violet: "border-violet-300 bg-violet-50 hover:border-violet-500 hover:bg-violet-100/70",
    fuchsia: "border-fuchsia-300 bg-fuchsia-50 hover:border-fuchsia-500 hover:bg-fuchsia-100/70",
    orange: "border-orange-300 bg-orange-50 hover:border-orange-500 hover:bg-orange-100/70",
    amber: "border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-amber-100/70",
    sky: "border-sky-300 bg-sky-50 hover:border-sky-500 hover:bg-sky-100/70",
  };
  const iconMap: Record<string, string> = {
    emerald: "text-emerald-700 bg-emerald-100",
    violet: "text-violet-700 bg-violet-100",
    fuchsia: "text-fuchsia-700 bg-fuchsia-100",
    orange: "text-orange-700 bg-orange-100",
    amber: "text-amber-700 bg-amber-100",
    sky: "text-sky-700 bg-sky-100",
  };
  return (
    <Link
      href={href}
      className={
        "group relative rounded-xl border-2 p-3 transition-all hover:shadow-md flex items-start gap-3 " +
        bgMap[tint]
      }
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconMap[tint]}`}>
        <Icon className="w-4 h-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-black text-sm inline-flex items-center gap-2 flex-wrap">
          {title}
          {badge && (
            <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0 text-[9px] font-black uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
          {desc}
        </div>
      </div>
      <div className="text-lg font-black opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
        →
      </div>
    </Link>
  );
}
