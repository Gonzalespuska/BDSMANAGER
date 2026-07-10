/**
 * Procedure Guides — návody ako realizátor postupuje pri konkrétnom systéme.
 *
 * Každý typ podlahy × priestor (garáž, byt, interiér, hala) má vlastný
 * podrobný postup — kroky, časy schnutia, tipy, upozornenia.
 *
 * Používa sa v /realizacie/[id] Postup karta: matcher() vyberie prvý guide
 * ktorý sa hodí na `typ_podlahy + priestor` z lead.data.
 *
 * Zatiaľ definované systémy:
 *   ✅ chipsová garáž (Sikafloor-151 + 264 Plus + chipsy)
 *   ⏳ mramorová interiér (Topstone EP02 + EP11 + EP22 Plus)  — TODO
 *   ⏳ metalická (Topstone EP11 metalic)  — TODO
 *   ⏳ jednofarebná PU (Sikafloor-3000 + 3310)  — TODO
 *   ⏳ jednofarebná epoxid (Sikafloor-264 Plus)  — TODO
 *   ⏳ antistatická ESD (Sikafloor-262AS N)  — TODO
 */

export interface ProcedureStep {
  /** Krátky nadpis kroku, napr. "Diamantové brúsenie" */
  title: string;
  /** Podrobný popis — čo presne robiť, akým náradím */
  description: string;
  /** Doplnkové tipy (bullet list) — good-to-know */
  tips?: string[];
  /** Kritické upozornenia (bullet list) — čo NESMIE nastať */
  warnings?: string[];
  /** Materiál potrebný pre tento krok */
  materials?: string[];
  /** Odhadovaný čas v minútach */
  duration_min?: number;
  /** Ak sa pred ďalším krokom čaká na vytvrdnutie — hodiny */
  wait_hours_after?: number;
}

export interface ProcedureGuide {
  id: string;
  title: string;
  /** Podnadpis + zoznam materiálov v systéme */
  subtitle: string;
  material_system: string;
  /** Selekcia — vráti true ak sa hodí na daný lead */
  matcher: (typPodlahy: string | null, priestor: string | null) => boolean;
  /** Úvod — jedno-2 vety kontext o čo ide */
  intro: string;
  /** Kroky v poradí */
  steps: ProcedureStep[];
  /** Celkový čas trvania zákazky (hodnota + jednotka) */
  total_time: string;
}

function normalize(s: string | null): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
function includes(s: string | null, ...needles: string[]): boolean {
  const n = normalize(s);
  return needles.some((x) => n.includes(x));
}

// ═══════════════════════════════════════════════════════════════════════
// GUIDE 1 — CHIPSOVÁ GARÁŽ (Sikafloor-151 + 264 Plus + Chipsy)
// ═══════════════════════════════════════════════════════════════════════

const CHIPS_GARAZ: ProcedureGuide = {
  id: "chips-garaz-151-264",
  title: "Chipsová podlaha — Garáž",
  subtitle: "Systém 151 + 264 Plus + Chipsy",
  material_system:
    "Sikafloor-151 (primer / scratch coat) + Sikafloor-264 Plus (farebná báza) + Chipsy (dekoratívna posypka)",
  matcher: (typ, priestor) =>
    includes(typ, "chips") && includes(priestor, "garáž", "garaz", "vjazd"),
  intro:
    "Klasická garážová chipsová podlaha. Cieľ: robustná epoxidová podlaha s farebnou bázou a full-broadcast chipsmi pre protišmykový + dekoratívny efekt. Vhodné do 1 auta ~25 m², 2 áut ~42 m², 3 áut ~65 m².",
  total_time: "3 dni (2 pracovné + 1 vytvrdnutie)",
  steps: [
    {
      title: "1. Príprava priestoru",
      description:
        "Vypratať garáž kompletne (auto von, veci nabok). Pozametať hrubú špinu, olej odmastiť s Sika CLN 50 (alebo iný odmastňovač) a nechať zaschnúť. Zakryť dvere fóliou, olepiť sokel/stenu papierovou páskou aby náter neprešiel.",
      tips: [
        "Steny olepiť do výšky ~10 cm — pri broadcast chipsov padnú aj na sokel",
        "Ak je v garáži kanál/vpust, prekryť páskou a fóliou aby náter neupchal odtok",
      ],
      materials: ["Fólia na kraje", "Páska papierová", "Sika CLN 50 alebo odmastňovač", "Vrecia na smeti 120L"],
      duration_min: 45,
    },
    {
      title: "2. Diamantové brúsenie podkladu",
      description:
        "Diamantové kotúče na veľkej Hilti brúske (alebo trojuholníková do rohov). Obrúsiť celú plochu do zdravého betónu — odstrániť starú farbu, cementové mlieko, olejové škvrny. Cieľ: matný, otvorený pórový betón s odtrhovou pevnosťou ≥ 1,5 MPa.",
      tips: [
        "Kotúče: diamant 30/40 zrnitosť na hrubé brúsenie, potom 60 na finalnee vyhladenie",
        "Rohy urobiť trojuholníkovou bruskou — veľká sa tam nezmestí",
        "Nabijaká podlaha sa nedá epoxidovať — treba viac brúsiť alebo zrenovovať",
      ],
      warnings: [
        "PRACHOVKA + MASKA! Kremičitý prach je karcinogén. Vysávač s HEPA filtrom napojený na brúsku.",
        "Ak sa pod brúsením objaví mokrý pás → nedokončiť! Musí sa najprv riešiť vlhkosť.",
      ],
      materials: [
        "Brúska Hilti / veľká + kotúče diamant",
        "Brúska trojuholník (rohy)",
        "Vysávač priemyselný + HEPA filter",
        "Spike shoes (aby si nešliapal do prachu)",
      ],
      duration_min: 180,
    },
    {
      title: "3. Vysávanie do detailu",
      description:
        "Priemyselný vysávač po celom podklade — najmä po obvode, v rohoch, kotorých sa napĺňal prach. Podklad musí byť ABSOLÚTNE bez prachu, inak sa penetrácia nechytí.",
      tips: [
        "Nastavce: široký na plochu, štrbinový do rohov",
        "Pár minút vetrať aby usadený prach na stenách spadol dolu, znova vysať",
        "Nakoniec ručne s látkovou handrou pozotierať sokel",
      ],
      duration_min: 30,
    },
    {
      title: "4. Kontrola trhlín + oprava",
      description:
        "Prejsť podklad, pozerať sa na praskliny (statické) a dilatačné škáry. Praskliny > 0,5 mm zošiť/vyplniť Sikadur-31 CF (tmelom). Ak veľká diera, vyspraviť Sikafloor-151 zmiešaným s kremičitým pieskom (1:1) ako plastmalta.",
      tips: [
        "Zošívanie: prasklinu vyklinovať 2× kolmo cez ňu (do V-tvaru), naplniť Sikadur-31, vpichnúť kovové sponky každých 10 cm",
        "Dilatačné škáry NEZAKRYŤ — musia zostať aktívne (aplikácia ich len prekryje pružným tmelom neskôr)",
      ],
      warnings: ["Sikadur-31 vytvrdzuje 4-6 h — dokončiť ešte v ten deň pred penetráciou"],
      materials: ["Sikadur-31 CF (na praskliny)", "Sikafloor-151 (na výpravy)", "Kremičitý piesok", "Špachtle rôzne"],
      duration_min: 60,
      wait_hours_after: 4,
    },
    {
      title: "5. Penetrácia Sikafloor-151",
      description:
        "Miešať A + B zložku 3 minúty pomalou vrtačkou (300 ot/min) — až kým NEZMIZNÚ šmírky. Ihneď naliať na podklad a rozotrieť STIERKOU do rovnomernej vrstvy. Spotreba 0,4–0,6 kg/m² podľa nasiakavosti podkladu.",
      tips: [
        "Ak veľmi nasiaka, aplikovať 2. vrstvu po 12 h",
        "Pri veľkých plochách rozliať pásmi a rozotierať tam-späť",
        "Teplota podlahy min +10 °C, ideálne +15 až +20 °C",
      ],
      warnings: [
        "Nemiešať viac než 1 balenie naraz — pot life 30 min pri +20 °C, kratší v teple",
        "Nikdy nepoužiť odchýlku pomeru A:B! Ak sa oddelí zvyšok, vyhoď — nevytvrdne správne",
      ],
      materials: [
        "Sikafloor-151 (30 kg balenie, 0,50 kg/m² = 1 vrece pokryje ~60 m²)",
        "Vrtačka + miešacia metla",
        "Kýble na miešanie",
        "Stierka (široká) na rozotieranie",
      ],
      duration_min: 90,
      wait_hours_after: 12,
    },
    {
      title: "6. Kontrola penetrácie",
      description:
        "Po 12 h prejsť celú plochu, skontrolovať že je penetrácia SUCHÁ (nelepí sa) a rovnomerná. Miesta kde vidno pórovitý betón (nedopadol dostatok) doplniť lokálnou 2. vrstvou — nechať zas 12 h.",
      tips: ["Prejdi bosky — nemá lepit ku pätám", "Ak lepí, čakať ďalších 6-12 h"],
      duration_min: 15,
    },
    {
      title: "7. 1. vrstva Sikafloor-264 Plus (farebná)",
      description:
        "Miešať A + B (3 min pomalou vrtačkou). Naliať pás a rozťahovať valčekom v smere jednom, potom priečne pre rovnomerné pokrytie. Spotreba 0,7 kg/m² per vrstvu (celkovo 1,4 kg/m² v 2 vrstvách).",
      tips: [
        "Použiť VALČEK s krátkym vlasom pre epoxidy (nie penový!)",
        "Postupovať smerom k dverám — nedostanem sa do slepého konca",
        "Prvý pás pri stene, potom systematicky preč od nej",
      ],
      warnings: [
        "Pot life 20 min pri +20 °C — miešať iba toľko koľko za 15 min stihneš aplikovať",
        "Nikdy nemiešať 264 Plus keď je pod +10 °C — nevytvrdne",
      ],
      materials: [
        "Sikafloor-264 Plus RAL 7032/7035 (30 kg = 1 vrece na ~40 m² pri 2 vrstvách)",
        "Valčeky (2 ks + náhradné), rukoväť",
        "Ježko (odvzdušňovací) na uvoľnenie bubliniek",
        "Kýble, miešacia metla",
      ],
      duration_min: 60,
      wait_hours_after: 12,
    },
    {
      title: "8. 2. vrstva Sikafloor-264 Plus (na mokro — pre chipsy!)",
      description:
        "TERAZ POZOR — 2. vrstvu aplikuj s očakávaním že POSYPEŠ CHIPSMI ihneď! Práca vo dvoch: jeden valčekuje, druhý IHNEĎ ZA NÍM sype chipsy v hustej vrstve.",
      tips: [
        `„Full broadcast" = chipsy sypeš tak husto, že na podlahu nedopadne žiadny farebný náter — celý povrch je chips`,
        "Sypať z výšky ~1 meter, aby chipsy padali kolmo — nezaklinia sa hranou",
        "Nekráčaj po sypanej ploche! Použiť spike shoes ak treba prejsť",
      ],
      warnings: [
        "Chipsy musia dopadnúť na MOKRÝ náter — do 5-10 minút po aplikácii, inak sa neprilepia",
        "Ak si sa poklonil a stratil rytmus, zastav aplikáciu, vypni farbu — chipsy odletia zbytočne",
      ],
      materials: [
        "Sikafloor-264 Plus (rovnaké ako v 7. kroku, 2. vrece)",
        "Chipsy 5 kg vrecia — spotreba 0,2 kg/m² pri full broadcast",
        "Spike shoes (nutné!)",
      ],
      duration_min: 90,
      wait_hours_after: 24,
    },
    {
      title: "9. Zbrúsenie voľných chipsov",
      description:
        "Po 24 h vytvrdnutí zbrúsiť VOĽNÉ chipsy (tie čo nedopadli na farbu) — jemným sieťovým brúsením alebo veľkou brúskou s jemným kotúčom. Cieľ: hladký matný povrch bez odstávajúcich chipsov.",
      tips: [
        "Brúsenie: 80-120 zrnitosť — hrubšia zle porúša chipsy",
        "Prejsť aj po rohoch (trojuholníkovou brúskou), okraj obrúsi prstom aby náter nesuchol",
      ],
      warnings: ["Ak zabrúsiš príliš hlboko, dostaneš sa na farebnú bázu — vidno flakes"],
      materials: ["Brúska prenosná + malý vysávač", "Brúska trojuholník"],
      duration_min: 90,
    },
    {
      title: "10. Vysávanie + finálna kontrola",
      description:
        "Priemyselný vysávač po celej ploche — odstrániť brúsny prach. Skontrolovať vizuál: rovnomerné pokrytie chipsov, žiadne pruhy, žiadne diery. Sfotiť 4 rohy + celkový pohľad + close-up.",
      tips: ["Ak vidíš pár holých miest, doplniť ručne štetčekom + lokálny broadcast"],
      materials: ["Vysávač priemyselný", "Handra + čistiaci prostriedok", "Vlhkomer (finálna kontrola)"],
      duration_min: 45,
    },
    {
      title: "11. Odovzdanie",
      description:
        "Odstrániť pásky, fólie, vyniesť odpad. Prevziať s klientom, ukázať finálny výsledok, poučiť ho: `Nešliapať 24 h, na plnú záťaž (auto) až po 7 dňoch`.",
      tips: [
        "Zvyšné chipsy + kúsok farby daj klientovi do vrecka — na opravy neskôr",
        "Fotky pošli obchodákovi cez /realizacie/[id] galériu",
      ],
      duration_min: 30,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// Fallback — všeobecný návod (ak nemáme match)
// ═══════════════════════════════════════════════════════════════════════

const FALLBACK: ProcedureGuide = {
  id: "fallback",
  title: "Postup pre tento systém ešte nie je pripravený",
  subtitle: "Zavolaj Peta Nogu alebo skús generický postup",
  material_system: "—",
  matcher: () => true, // musí byť posledný
  intro:
    "Pre daný typ podlahy + priestor sme ešte nedefinovali detailný návod. Postup vytvoríme spoločne pri prvej takejto zákazke. Zatiaľ postupuj podľa všeobecného schémy: príprava → brúsenie → penetrácia → farebný náter → vrchný lak.",
  total_time: "—",
  steps: [
    {
      title: "1. Príprava priestoru",
      description:
        "Vypratať, pozametať, odstrániť veci, olepiť sokel a chránené plochy.",
    },
    {
      title: "2. Diamantové brúsenie",
      description:
        "Odbrúsiť podklad do zdravého betónu. Vysať priemyselným vysávačom.",
    },
    {
      title: "3. Penetrácia",
      description:
        "Aplikovať primer podľa systému (Sikafloor-01 pri epoxide, Sikafloor-150 Plus pri PU). Nechať vytvrdnúť 12 h.",
    },
    {
      title: "4. Farebný náter",
      description:
        "Podľa typu (264 Plus pre epoxid, 3000 pre PU, EP11 Metalic pre metalickú, ...) v 1-2 vrstvách. Nechať 12 h medzi vrstvami.",
    },
    {
      title: "5. Vrchný lak / finiš",
      description:
        "Pri PU: Sikafloor-3310. Pri metalickej: Topstone EP22 Plus (2 vrstvy). Pri chipsovej: bez laku.",
    },
    {
      title: "6. Odovzdanie",
      description: "Vyčistiť, sfotiť, odovzdať klientovi.",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// Export — všetky guides v poradí (matcher() sa vyhodnocuje po poradí)
// ═══════════════════════════════════════════════════════════════════════

export const PROCEDURE_GUIDES: ProcedureGuide[] = [
  CHIPS_GARAZ,
  // TODO — pridať postupne:
  // MRAMOROVA_INTERIER (Topstone EP02+EP11+EP22)
  // METALICKA (Topstone EP11 metalic)
  // JEDNOFAREBNA_PU (Sikafloor-3000+3310)
  // JEDNOFAREBNA_EPOXID (Sikafloor-264 Plus)
  // ANTISTATICKA_ESD (Sikafloor-262AS N)
  FALLBACK,
];

/**
 * Vráti prvý guide ktorý sa hodí na daný lead. Ak žiadny explicitný nesedí,
 * vráti FALLBACK.
 */
export function findGuide(
  typPodlahy: string | null,
  priestor: string | null,
): ProcedureGuide {
  for (const g of PROCEDURE_GUIDES) {
    if (g.matcher(typPodlahy, priestor)) return g;
  }
  return FALLBACK;
}
