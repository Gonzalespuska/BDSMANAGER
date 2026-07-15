import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/realne-data — Analytické dáta z dokončených realizácií.
 *
 * User 2026-07-12: „pridaj do admina sekciu Realne data tam budu data z
 * dokoncenych objednavon najma casi za ktore stihli kolko a kolko m2 …
 * chcem z toho dostat napr to ze do buducna budem vediet vypocitat cca
 * kolko bude trvat 60m garaz alebo 100m byt". A následne: „daj tie data
 * in construction nech to je osobitna kategoria v admine".
 *
 * TODO (roadmap — plánované polia po dohode s userom):
 *  Základ zákazky:
 *    - Dátum realizácie, Typ objektu (byt/garáž/hala/schody/exteriér)
 *    - Systém (264 chips / 3000FX / PU / metalická…)
 *    - Plocha m² · Sokel áno/nie + výška · Členitosť
 *    - Obvod m · Poschodie · Prístup (nosenie/voda/elektrina)
 *    - Stav podkladu (nový betón / starý / mastný / popraskaný)
 *  Ľudia:
 *    - Počet realizátorov · Tím
 *  Podmienky v deň realizácie:
 *    - Teplota podkladu · vzduchu · vlhkosť · RH · rosný bod
 *  Časy po fázach (čistý čas + počet ľudí):
 *    - Brúsenie · Zošívanie+vysávanie · Penetrácia · Farebná+chipsy
 *    - Brúsenie chipsov · Lak · Čakacie doby medzi fázami
 *  Materiál plán vs. skutočnosť
 *  Kvalita/problémy — admin ich píše ručne (reklamácie, čo sa pokazilo)
 *
 * Výstup: predikčný model — daj m² + systém + typ objektu → očakávaný čas
 * v hodinách ± odchýlka. Napr. 60 m² garáž systém 264 → 6,5h ± 1h.
 */
export default async function RealneDataPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-emerald-700 mb-3 px-2 py-1 rounded-md hover:bg-emerald-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2 flex-wrap">
          📊 Realne dáta
          <span className="rounded-full bg-amber-100 text-amber-900 border-2 border-amber-300 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider">
            🚧 In building
          </span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Analytické dáta z dokončených realizácií — čas fáz, spotreba
          materiálu, reklamácie. Cieľ: pri novej zákazke automaticky
          predpovedať kedy tím skončí a či stihne 2 zákazky v jeden deň.
        </p>
      </header>

      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-6 text-center space-y-3">
        <BarChart3 className="w-12 h-12 text-amber-500 mx-auto" aria-hidden />
        <div className="text-lg font-black text-amber-900">
          Modul je vo výstavbe
        </div>
        <p className="text-sm text-amber-800 max-w-lg mx-auto">
          Dizajn schémy je hotový. Po dohode s userom sa najprv postaví
          formulár pre realizatora aby po dokončení zákazky zapisoval časy
          fáz a spotrebu, potom dashboard s agregátmi pre admina.
        </p>
      </div>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-black">Plánovaný dataset</div>
        <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-5">
          <li>Základ: dátum · typ objektu · systém · plocha m² · sokel</li>
          <li>Podmienky: teplota podkladu/vzduchu · vlhkosť · RH · rosný bod</li>
          <li>Ľudia: počet realizatorov · tím</li>
          <li>
            Časy po fázach: brúsenie · zošívanie · penetrácia · farebná ·
            chipsy · lak · čakacie doby
          </li>
          <li>Materiál: plán vs. skutočnosť</li>
          <li>Kvalita: reklamácie · čo sa pokazilo (admin píše ručne)</li>
        </ul>
        <div className="text-[10px] text-slate-500 italic pt-1">
          Cieľ modelu: nová zákazka 60 m² garáž systém 264 → očakávaný čas
          6,5 h ± 1 h → tím môže vziať aj druhú v ten deň.
        </div>
      </section>
    </div>
  );
}
