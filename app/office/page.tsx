import { redirect } from "next/navigation";
import { Headphones, Mic, ListChecks, StickyNote } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { RemindersSection } from "@/components/office/reminders-section";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /office — Office manager workspace (vo výstavbe).
 *
 * Plánované features (podľa pôvodnej idey):
 *   • Voice-to-task — mikrofón → nahovorí task → AI ho zapíše
 *   • Todo list per office manager s prioritami + termínmi
 *   • Poznámky per zákazník / lead / obchodník
 *   • Denný pipeline: čo treba dokončiť dnes
 *   • Handoff z Obchod / Realizácie / Obhliadky — koho zavolať,
 *     komu poslať dokument, čo overiť
 *   • Integrácia s kalendárom pre plánovanie
 *
 * Access: office rola + admin (zatiaľ len admin lebo office rola neexistuje).
 */
export default async function OfficeDashboard() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Headphones className="w-6 h-6 text-amber-500" aria-hidden />
          Office manager
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Workspace pre office manažérku — task systém, poznámky, voice-to-task.
        </p>
      </header>

      {/* Pripomienky (kalendár) — funkčná sekcia. */}
      <RemindersSection />

      <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-6 space-y-4">
        <h2 className="font-bold text-amber-900 inline-flex items-center gap-2 text-lg">
          🚧 Vo výstavbe — plánované features
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={<Mic className="w-5 h-5 text-amber-700" />}
            title="Voice-to-task"
            desc="Klik na mikrofón → nahovoríš task ('Zavolať Boris Henc kvôli obhliadke') → AI ho parseuje na štruktúrovaný task s termínom a priradením."
          />
          <FeatureCard
            icon={<ListChecks className="w-5 h-5 text-amber-700" />}
            title="Daily todo pipeline"
            desc="Co treba dokončiť dnes: callbacky obchodníkov, prípomienky obhliadok, kontrola realizačných tímov, follow-up cenových ponúk."
          />
          <FeatureCard
            icon={<StickyNote className="w-5 h-5 text-amber-700" />}
            title="Poznámky per zákazník"
            desc="Rýchle poznámky viazané na lead / obchodníka / realizáciu. Vyhľadateľné, s tag-mi (urgent, sledovať, dohodnuté)."
          />
          <FeatureCard
            icon={<Headphones className="w-5 h-5 text-amber-700" />}
            title="Team handoff"
            desc="Obchodník / realizator / obhliadkar posunie task na office managera: 'Zavolať dodávateľa Sika ohľadom termínu doručenia chipsov pre zákazku X'."
          />
        </div>

        <div className="text-sm text-amber-900 pt-3 border-t border-amber-200">
          <strong>Ešte pridať do plánu:</strong>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>Faktúry / dodacie listy per zákazka</li>
            <li>Sledovanie splatnosti (kto zaplatil, kto mešká)</li>
            <li>Kontaktná kniha dodávateľov (Sika, Stavekon, doprava…)</li>
            <li>Šablóny pre bežné maily (potvrdenie termínu, follow-up)</li>
          </ul>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        💡 Tip pre rozvoj: office rola bude piaty typ usera vedľa admin/obchod/obhliadky/realizacie. V UI sa zobrazí ako amber badge.
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="inline-flex items-center gap-2 font-bold text-sm">
        {icon}
        {title}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{desc}</p>
    </div>
  );
}
