import { redirect } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Hammer,
  Phone,
  Wrench,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /podklady — Podklady + tréning pre celý tím.
 * User 2026-07-14: „daj podklady in building pre kazdeho — obchodaci FAQ +
 * callscripty · obhliadkari script + FAQ + testy · realizacni tim postup
 * po systémoch (napr. 264+chips) so spotrebou detailne".
 *
 * Aktuálne: sekcie sú kostry (IN BUILDING). Obsah admin doplní cez
 * /admin/podklady + /admin/systems ako dozreje.
 */
export default async function PodkladyPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  // Default sekcia podľa role — obchodák vidí OBCHOD, obhliadkár OBHLIADKY, atď.
  // Admin vidí prvú (OBCHOD) alebo si prepne cez ?role=…
  const defaultRole =
    user.role === "obhliadky"
      ? "obhliadky"
      : user.role === "realizacie"
        ? "realizacie"
        : "obchod";
  const activeRole = sp.role ?? defaultRole;

  const TABS: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    tint: string;
  }> = [
    { id: "obchod", label: "📞 Obchod", icon: <Phone className="w-4 h-4" />, tint: "sky" },
    {
      id: "obhliadky",
      label: "🔍 Obhliadka",
      icon: <ClipboardList className="w-4 h-4" />,
      tint: "violet",
    },
    {
      id: "realizacie",
      label: "🔨 Realizácie",
      icon: <Hammer className="w-4 h-4" />,
      tint: "emerald",
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-sky-500" aria-hidden />
          Podklady & Tréning
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Materiály pre celý tím — call skripty, FAQ, postupy realizácie po
          systémoch. Roluj/klikni tab podľa svojej role.
        </p>
      </header>

      {/* Role tabs — horizontálny scroll na mobile */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 flex-nowrap sm:flex-wrap">
        {TABS.map((t) => {
          const active = activeRole === t.id;
          return (
            <a
              key={t.id}
              href={`/podklady?role=${t.id}`}
              className={
                "shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-colors " +
                (active
                  ? t.tint === "sky"
                    ? "bg-sky-500 text-white shadow-sm"
                    : t.tint === "violet"
                      ? "bg-violet-500 text-white shadow-sm"
                      : "bg-emerald-500 text-white shadow-sm"
                  : "bg-background border-2 border-slate-200 text-slate-700 hover:bg-slate-100")
              }
            >
              {t.icon}
              {t.label}
            </a>
          );
        })}
      </div>

      {/* Obsah podľa aktívnej role */}
      {activeRole === "obchod" && <ObchodSection />}
      {activeRole === "obhliadky" && <ObhliadkySection />}
      {activeRole === "realizacie" && <RealizacieSection />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// OBCHOD
// ────────────────────────────────────────────────────────────────────────
function ObchodSection() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="📋 Call skripty"
        desc="Ako volať zákazníka podľa typu podlahy + priestoru — mramorový dom / chipsová firma / jednofarebná garáž. Otvárajú sa priamo z lead karty."
        status="in-building"
        note="Skripty sa nastavujú v /admin/podklady. Obchodák ich potom vidí ako popup na leade cez tlačidlo Callscript."
      />
      <SectionCardBig
        title="❓ FAQ — základ ktorý musí obchodák vedieť"
        status="in-building"
      >
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc pl-5">
          <li>Ako sa líšia jednotlivé typy podláh (jednofarebná, chipsová, mramorová, metalická)</li>
          <li>Rozdiel epoxid vs polyuretán (UV odolnosť, elastičnosť, cena)</li>
          <li>Ako reagovať na námietku „drahé" (porovnanie s dlažbou, životnosť 15+ rokov)</li>
          <li>Aký priestor sa hodí pre aký systém (garáž / hala / interiér / balkón)</li>
          <li>Za ako dlho vieme prísť na obhliadku a čo obhliadka obnáša</li>
          <li>Termíny realizácie od podpisu CP</li>
          <li>Záruka, servis, reklamačné podmienky</li>
        </ul>
      </SectionCardBig>
      <SectionCard
        title="🎓 Onboarding video / tréning"
        desc="Krátke videá pre nových obchodníkov — ako viesť hovor, ako reagovať na typické objekcie."
        status="in-building"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// OBHLIADKY
// ────────────────────────────────────────────────────────────────────────
function ObhliadkySection() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="🗣 Script na rozprávanie sa so zákazníkom"
        desc="Ako viesť obhliadku profesionálne — od predstavenia po odovzdanie CP. Čo sa pýtať, čo NEsľubovať, ako uzavrieť."
        status="in-building"
      />
      <SectionCardBig
        title="❓ FAQ pre obhliadkárov"
        status="in-building"
      >
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc pl-5">
          <li>Ako správne odmerať plochu (m²) — zaokrúhľovanie, výnimky (schody, sokle)</li>
          <li>Kedy je podklad nevyhovujúci a treba to zákazníkovi povedať</li>
          <li>Ako komunikovať cenu ak sa výrazne líši od orientačnej CP</li>
          <li>Čo urobiť ak zákazník tlačí na termín a nemáme</li>
          <li>Aký systém odporučiť pre garáž vs interiér vs priemysel</li>
        </ul>
      </SectionCardBig>
      <SectionCardBig
        title="🔬 Ako vykonávať testy — DETAIL"
        status="in-building"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TestCard
            title="🔨 Odtrhová skúška (pull-off test)"
            steps={[
              "Príprava terče — pripevni oceľové kruhy na podklad epoxidovým lepidlom (napr. 2K epox 24h vytvrdnutie)",
              "Zapoj mechanický odtrhomer (pull-off gauge) na terč",
              "Postupne aplikuj silu kým sa terč odtrhne",
              "Zapíš MPa hodnotu (min 1,5 MPa pre podlahu, ideál 2,0+)",
            ]}
          />
          <TestCard
            title="💧 Meranie vlhkosti (CM prístroj)"
            steps={[
              "Odober vzorku podkladu (odsekni kúsok cca 50g z hĺbky 2-3cm)",
              "Rozdrv na jemný prášok (kladivom v igelitovom vrecku)",
              "Vlož do CM meracieho zariadenia s karbidovou ampulou",
              "Pretras 2-3 minúty, odčítaj CM % (max 4 % pre epox, max 3 % pre PU)",
            ]}
          />
          <TestCard
            title="🌡 Teplomer podkladu (dotykový)"
            steps={[
              "Priloc infračervený teplomer na povrch podkladu (10-15 cm)",
              "Zmerať na 3-5 miestach, spriemerovať",
              "Podklad musí byť 8-30 °C (ideál 15-25 °C)",
              "Zapíš hodnotu + porovnaj s rosným bodom (min 3°C nad)",
            ]}
          />
          <TestCard
            title="💨 Relatívna vlhkosť vzduchu"
            steps={[
              "Digitálny hygrometer nechaj 5 min stabilizovať v priestore",
              "Zapíš RH% + teplotu vzduchu",
              "Max 75 % pre epox, max 70 % pre PU",
              "Vypočítaj rosný bod (kalkulačka v aplikácii)",
            ]}
          />
        </div>
      </SectionCardBig>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// REALIZÁCIE
// ────────────────────────────────────────────────────────────────────────
function RealizacieSection() {
  const SYSTEMS = [
    {
      code: "264 + Chips",
      floor: "Chipsová",
      steps: [
        { step: "1. Diamantové vybrúsenie", detail: "Diamantová brúska, zrno 30/40. Odstráň nesúdržné časti. Postupne v pásoch, okraje ručne." },
        { step: "2. Zošívanie prasklín", detail: "Prasklín > 1 mm vyrezať flexou, zošiť oceľovými spojkami každých 20-25 cm, zaliať Sikadur-30 + kremičitý piesok." },
        { step: "3. Priemyselné vysávanie", detail: "HEPA vysávač, celý priestor v pásoch. Následne micro-fibra utierka." },
        { step: "4. Penetrácia Sikafloor-150 Plus", detail: "Spotreba 0,50 kg/m². Zmieš zložku A+B (min. 3 min miešačkou 300 ot/min). Naneste valčekom krížovo. Otvorená doba ~30 min. Sušenie 12–24h." },
        { step: "5. Vybrúsenie penetrácie", detail: "Jemné zrno 80–120. Odstráň hroty, ale neprebrús na podklad." },
        { step: "6. Vysávanie", detail: "Znovu HEPA + micro-fibra." },
        { step: "7. Farebná vrstva Sikafloor-264 Plus RAL", detail: "Spotreba 1,40 kg/m² (2 vrstvy). Zmieš A+B+pigment, naneste stierkou/valčekom. Otvorená doba 25 min pri 20°C." },
        { step: "8. Rozsyp chipsov", detail: "Ihneď (kým je vrstva mokrá) rovnomerne rozsyp chipsy z výšky 1,5–2 m. Full-broadcast, 100% pokrytie. Spotreba ~0,20 kg/m²." },
        { step: "9. Vytvrdnutie 24h", detail: "Nechaj plne vytvrdnúť. Nechodiť po vrstve." },
        { step: "10. Odsatie prebytočných chipsov", detail: "Priemyselný vysávač. Zbytočné chipsy sa dajú znovu použiť." },
        { step: "11. Zbrúsenie prečnievajúcich chipsov", detail: "Jemné zrno 80–120. Vyrovnať povrch, aby lak sadol rovnomerne." },
        { step: "12. Kontrola + vysávanie", detail: "Skontrolovať že chipsy sedia, HEPA vysávanie prachu." },
        { step: "13. Vrchný lak (voliteľné)", detail: "Ak chce zákazník + protišmyk: Topstone EP22 Plus číra alebo Sika TC-442W clear, spotreba 0,15 kg/m² v 2 vrstvách." },
        { step: "14. Finálne vytvrdnutie", detail: "Pochôdznosť po 24h, plná záťaž po 7 dňoch." },
      ],
    },
    {
      code: "3000 Polyuretán",
      floor: "Jednofarebná PU",
      steps: [
        { step: "1. Diamantové vybrúsenie", detail: "Zrno 30/40. Otvor póry pre penetráciu." },
        { step: "2. Zošívanie prasklín", detail: "Sikadur-30 + oceľové spojky." },
        { step: "3. Vysávanie", detail: "HEPA." },
        { step: "4. Penetrácia Sikafloor-01 Primer (PU-kompatibilný)", detail: "Spotreba 0,35 kg/m². Naneste valčekom." },
        { step: "5. Sušenie 12h + brúsenie penetrácie", detail: "Zrno 80–120." },
        { step: "6. Vysávanie", detail: "HEPA + utierka." },
        { step: "7. Farebná vrstva Sikafloor-3000 RAL", detail: "Spotreba 1,30 kg/m². Zmieš A+B. Naneste stierkou alebo valčekom. Krížové odvzdušnenie ihličkovým valčekom." },
        { step: "8. Vytvrdnutie 24h", detail: "Bezprašné prostredie." },
        { step: "9. Vrchný lak Sikafloor-3310", detail: "Spotreba 0,20 kg/m². 1 vrstva stačí, matný alebo lesklý povrch." },
        { step: "10. Finálne vytvrdnutie", detail: "Pochôdznosť 24h, plná záťaž 7 dní." },
      ],
    },
    {
      code: "264 Plus Epoxid",
      floor: "Jednofarebná Epoxid",
      steps: [
        { step: "1. Vybrúsenie + zošívanie + vysávanie", detail: "Rovnaké ako pri 264+Chips (kroky 1-3)." },
        { step: "2. Penetrácia Sikafloor-150 Plus", detail: "0,50 kg/m², sušenie 12h." },
        { step: "3. Brúsenie + vysávanie", detail: "Jemné zrno + HEPA." },
        { step: "4. Farebná vrstva Sikafloor-264 Plus RAL", detail: "1,40 kg/m² v 2 vrstvách. 24h medzi vrstvami." },
        { step: "5. Vrchný lak (voliteľné) Sikafloor-304W Matt", detail: "0,18 kg/m², matný povrch. Voliteľné." },
      ],
    },
    {
      code: "EP11 + EP22 Metalická",
      floor: "Metalická",
      steps: [
        { step: "1. Vybrúsenie + zošívanie + vysávanie", detail: "Perfektný podklad — hocijaké nerovnosti prejdú skrz metalický efekt." },
        { step: "2. Penetrácia Topstone EP02 RAL 7035", detail: "0,93 kg/m² v 2 vrstvách. Farba báze pre efekt." },
        { step: "3. Vytvrdnutie 24h + kontrola", detail: "Musí byť perfektne rovné." },
        { step: "4. Farebná vrstva Topstone EP11 Metalic BA", detail: "1,22 kg/m². Nanáša sa stierkou s pigmentom, potom rotačné pohyby pre 3D efekt. Mixovanie pigmentov = umenie." },
        { step: "5. Vytvrdnutie 24h", detail: "Bezprašné." },
        { step: "6. Vrchný lak Topstone EP22 Plus číra", detail: "1,19 kg/m² total (2 vrstvy). UV stabilita." },
      ],
    },
    {
      code: "Mramor Topstone",
      floor: "Mramorová",
      steps: [
        { step: "1. Podklad", detail: "Ako pri metalickej — perfektná príprava." },
        { step: "2. Penetrácia Topstone EP02 RAL", detail: "0,93 kg/m² v 2 vrstvách." },
        { step: "3. Farebná mramorová vrstva Topstone EP11", detail: "1,22 kg/m². Aplikuje sa liatinovou stierkou vo viacerých farbách naraz, potom rozmiešava do mramorového vzoru." },
        { step: "4. Vytvrdnutie + vrchný lak Topstone EP22 Plus číra", detail: "Číry lak pre lesk a UV ochranu, 1,19 kg/m² total." },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
        <div className="text-sm font-black text-emerald-900 inline-flex items-center gap-2">
          🔨 Systémy realizácie
          <span className="text-[10px] uppercase tracking-wider font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
            🚧 in building
          </span>
        </div>
        <p className="text-xs text-emerald-800/80 mt-1">
          Detailné postupy pre každý systém. Realizátor si otvorí systém
          ktorý má priradený, pozrie kroky + spotreby. Postupy edituje admin
          v /admin/systems.
        </p>
      </div>

      {SYSTEMS.map((sys) => (
        <details
          key={sys.code}
          className="rounded-2xl border-2 border-slate-200 bg-white overflow-hidden group"
        >
          <summary className="px-4 py-3 cursor-pointer hover:bg-slate-50 flex items-center gap-3 select-none">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
              {sys.code.substring(0, 4).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-base leading-tight">
                {sys.code}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {sys.floor} · {sys.steps.length} krokov · klikni pre detail
              </div>
            </div>
            <div className="text-slate-400 group-open:rotate-180 transition-transform">
              ▾
            </div>
          </summary>
          <ol className="border-t divide-y">
            {sys.steps.map((s, i) => (
              <li key={i} className="px-4 py-3 flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm text-slate-900">
                    {s.step}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    {s.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function SectionCard({
  title,
  desc,
  status,
  note,
}: {
  title: string;
  desc: string;
  status: "in-building" | "live";
  note?: string;
}) {
  return (
    <section className="rounded-2xl border-2 border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-base font-black inline-flex items-center gap-2 flex-wrap">
            {title}
            {status === "in-building" && (
              <span className="text-[10px] uppercase tracking-wider font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
                🚧 in building
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1 leading-snug">{desc}</p>
          {note && (
            <p className="text-[11px] text-slate-500 mt-2 italic">{note}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionCardBig({
  title,
  status,
  children,
}: {
  title: string;
  status: "in-building" | "live";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3">
      <div className="text-base font-black inline-flex items-center gap-2 flex-wrap">
        {title}
        {status === "in-building" && (
          <span className="text-[10px] uppercase tracking-wider font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
            🚧 in building
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function TestCard({
  title,
  steps,
}: {
  title: string;
  steps: string[];
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="font-black text-sm text-violet-900">{title}</div>
      <ol className="mt-2 space-y-1 list-decimal pl-5 text-xs text-slate-700">
        {steps.map((s, i) => (
          <li key={i} className="leading-snug">
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Wrench nepoužité — príprava pre budúce rozšírenie
void Wrench;
