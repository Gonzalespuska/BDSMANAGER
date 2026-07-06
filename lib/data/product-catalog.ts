/**
 * Cenník materiálov pre režim "Iba materiál + doprava".
 *
 * Náklady (`cost_per_package`, `cost_per_kg`) sú vrátane DPH. Predajná cena
 * sa počíta s maržou `MARZA_MATERIAL` (35 %).
 *
 * Zdroje:
 *   - SIKA — slovenský oficiálny cenník Q2 2026 (vrátane SK DPH)
 *   - TOPSTONE / BETON-ACE — CZ cenník, vrátane CZ DPH (prepočítané)
 */

import type { FloorType } from "./materials";

export type ProductBrand = "sika" | "topstone" | "betonace" | "stavekon";

/**
 * Pozícia produktu v aplikačnom systéme:
 *   - main      → hlavný (farebný/finálny) náter — krok 1
 *   - primer    → penetrácia — krok 2, viaže sa na konkrétny hlavný náter
 *   - topcoat   → vrchný lak/ochrana — krok 3, voliteľný
 *   - additive  → doplnok (piesok, čistič, nivelizačná stierka, chipsy)
 */
export type ProductRole = "main" | "primer" | "topcoat" | "additive";

export interface Product {
  id: string;
  brand: ProductBrand;
  name: string;
  /** Veľkosť 1 balenia v kg, alebo null ak sa predáva na kg. */
  package_size_kg: number | null;
  /** Cena nákladu za 1 balenie (€, vrát. DPH). Null ak iba bulk-kg cena. */
  cost_per_package: number | null;
  /** Cena nákladu za 1 kg (€, vrát. DPH). Vždy nastavené pre dopočet. */
  cost_per_kg: number;
  /** Voľba jednotky predaja v UI: "package" = balenia, "kg" = na kg. */
  sell_by: "package" | "kg";
  /** Voliteľná poznámka — TODO, ODHAD a pod. */
  note?: string;
  /**
   * Typy podlahy, pre ktoré sa tento produkt používa. Ak je prázdne, zobrazí
   * sa pri každom type podlahy (univerzálny — napr. primer, čistič, posyp).
   */
  floor_types?: FloorType[];
  /** Pozícia v technologickom systéme — main/primer/topcoat/additive. */
  role: ProductRole;
  /**
   * Pre PRIMER a TOPCOAT — zoznam `id` hlavných náterov s ktorými je
   * kompatibilný. Ak je prázdne / undefined → univerzálne (kompatibilný so
   * všetkými hlavnými natermi).
   */
  compatible_with?: string[];
  /** Krátky technický popis (1 veta) — zobrazí sa pod menom produktu. */
  desc?: string;
}

// ────────────────────────────────────────────────────────────────────────
// SIKA — slovenský cenník
// ────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────
// Sika typológia produktov (na základe Sika Cenník Flooring 2026 + TDS):
//
//   PENETRÁCIA (primer):
//     - Sikafloor-150 / 150 Plus — epoxidový samonivel + primer pod 264/2510
//     - Sikafloor-151           — multifunkčný (primer + výlevka)
//     - Sikafloor-156 / 161     — štandardné 2K epoxidové primery
//     - Sika-01 Primer          — univerzálny primer
//     - Sika-03 Primer          — heavy-duty (vlhký betón, chemická odolnosť)
//
//   HLAVNÝ NÁTER (farebný/funkčný):
//     - Sikafloor-264 / 264 Plus       — najpredávanejší 2K epoxid (priemysel/garáže)
//     - Sikafloor-261W / 2510W         — vodou-riediteľné epoxidy
//     - Sikafloor-3310                 — chemická odolnosť
//     - Sikafloor-3000 / 3000FX        — polyuretán (pružnosť, UV)
//     - Sikafloor-359 / 360 / 376 / 378 — ostatné PU systémy
//
//   VRCHNÝ LAK (clear / sealer):
//     - Sikafloor-3306W (nahradil 304W Matt) — PU vodou-riediteľný mat lak
//     - Sikafloor-TC 442W / TC 446W          — transparent PU laky
//     - Sikafloor-3304W / 3305W              — pastelové/clear PU laky
//
//   DOPLNKY:
//     - Sikafloor Level-30, 432 DecoCem ... — cementové stierky/leveling
//     - Sika CLN 50                          — čistič nástrojov
//     - Kremičitý piesok                     — posyp
// ────────────────────────────────────────────────────────────────────────

const SIKA: Product[] = [
  // ═══ PENETRÁCIE (krok 2) ════════════════════════════════════════════
  // Sikafloor-150 — epoxidový primer + výlevka 1.5–5 mm (z cenníka Level systems)
  {
    id: "sika-150plus-25",
    brand: "sika",
    name: "Sikafloor-150 Plus (25 kg)",
    desc: "2K epoxidový primer + samonivel — pod 264, 264 Plus, 2510W",
    package_size_kg: 25,
    cost_per_package: 363,
    cost_per_kg: 14.55,
    sell_by: "package",
    role: "primer",
    floor_types: ["jednofarebna", "chipsova", "mramorova", "metalicka"],
    // Univerzálny primer pre SIKA epoxidové hlavné nátery
    compatible_with: [
      "sika-264plus-kg",
      "sika-264-30",
      "sika-2510w-20",
      "sika-261w-20",
      "sika-3310-kg",
      "ba-ep02-rals-25",
      "ba-ep11-metalic-20",
    ],
  },
  {
    id: "sika-150plus-10",
    brand: "sika",
    name: "Sikafloor-150 Plus (10 kg)",
    desc: "2K epoxidový primer + samonivel — menšie balenie",
    package_size_kg: 10,
    cost_per_package: 182,
    cost_per_kg: 18.2,
    sell_by: "package",
    role: "primer",
    floor_types: ["jednofarebna", "chipsova", "mramorova", "metalicka"],
    compatible_with: [
      "sika-264plus-kg",
      "sika-264-30",
      "sika-2510w-20",
      "sika-261w-20",
      "sika-3310-kg",
      "ba-ep02-rals-25",
      "ba-ep11-metalic-20",
    ],
  },
  // Sikafloor-151 — multifunkčný epoxid (primer + výlevka), reclassified per Sika TDS
  {
    id: "sika-151-30",
    brand: "sika",
    name: "Sikafloor-151",
    desc: "Multifunkčný 2K epoxidový primer + výlevka",
    package_size_kg: 30,
    cost_per_package: 272,
    cost_per_kg: 9.1,
    sell_by: "package",
    role: "primer",
    floor_types: ["jednofarebna", "chipsova", "mramorova", "metalicka"],
    compatible_with: [
      "sika-264plus-kg",
      "sika-264-30",
      "sika-2510w-20",
      "sika-261w-20",
      "ba-ep02-rals-25",
      "ba-ep11-metalic-20",
    ],
  },
  {
    id: "sika-01-primer-10",
    brand: "sika",
    name: "Sika-01 Primer",
    desc: "1K MS-polymér primer — POZOR: NIE JE kompatibilný s EP nátermi (iba pre PU systémy)",
    package_size_kg: 10,
    cost_per_package: 61,
    cost_per_kg: 6.15,
    sell_by: "package",
    role: "primer",
    // MS-polymér NEPOUŽÍVAŤ pod EP hlavný náter (user explicitne požaduje).
    // Kompatibilný iba s polyuretánovými nátermi (Sikafloor-3xxx PU rada).
    compatible_with: [
      "sika-3310-kg",
      "sika-3000-20",
      "sika-3000fx-20",
    ],
  },
  {
    id: "sika-03-primer-10",
    brand: "sika",
    name: "Sika-03 Primer",
    desc: "2K epoxidový primer pre vlhký podklad + chemicky odolné systémy",
    package_size_kg: 10,
    cost_per_package: 68,
    cost_per_kg: 6.8,
    sell_by: "package",
    role: "primer",
    compatible_with: [
      "sika-3310-kg",
      "sika-3000-20",
      "sika-3000fx-20",
      "ba-ep11-metalic-20",
    ],
  },

  // ═══ HLAVNÉ NÁTERY (krok 1) ═════════════════════════════════════════
  // Sikafloor-264 + 264 Plus (najpredávanejšie epoxidy)
  {
    id: "sika-264plus-kg",
    brand: "sika",
    name: "Sikafloor-264 Plus",
    desc: "2K epoxid pre priemysel + garáže (vylepšená 264 — vyšší lesk + odolnosť)",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 11.0,
    sell_by: "kg",
    role: "main",
    floor_types: ["jednofarebna", "chipsova", "mramorova"],
  },
  {
    id: "sika-264-30",
    brand: "sika",
    name: "Sikafloor-264 (30 kg)",
    desc: "Štandardný 2K epoxid — RAL 7032/7035 báza",
    package_size_kg: 30,
    // TODO: potvrdiť cenu — odhad podľa Sika cenník 2026 (~5,30 €/kg base)
    cost_per_package: 159,
    cost_per_kg: 5.3,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "main",
    floor_types: ["jednofarebna", "chipsova"],
  },
  // Sikafloor-2510W (vodou-riediteľný epoxid)
  {
    id: "sika-2510w-20",
    brand: "sika",
    name: "Sikafloor-2510W (20 kg)",
    desc: "Vodou-riediteľný epoxid — nízka emisia VOC, interiér",
    package_size_kg: 20,
    // TODO: potvrdiť cenu — odhad ~7,40 €/kg z cenníka
    cost_per_package: 148,
    cost_per_kg: 7.4,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "main",
    floor_types: ["jednofarebna"],
  },
  // Sikafloor-261W (vodou-riediteľný)
  {
    id: "sika-261w-20",
    brand: "sika",
    name: "Sikafloor-261W (20 kg)",
    desc: "Vodou-riediteľný 2K epoxid — interiéry s vyšším zaťažením",
    package_size_kg: 20,
    cost_per_package: 278,
    cost_per_kg: 13.9,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "main",
    floor_types: ["jednofarebna"],
  },
  // Sikafloor-3310 (chemická odolnosť)
  {
    id: "sika-3310-kg",
    brand: "sika",
    name: "Sikafloor-3310",
    desc: "Chemicky + mechanicky odolný epoxid — food industry / labs",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 13.5,
    sell_by: "kg",
    role: "main",
    floor_types: ["jednofarebna"],
  },
  // Polyuretánové
  {
    id: "sika-3000-20",
    brand: "sika",
    name: "Sikafloor-3000 (20 kg)",
    desc: "Polyuretán — pružnosť, vyšší komfort, UV stabilita",
    package_size_kg: 20,
    cost_per_package: 416,
    cost_per_kg: 20.8,
    sell_by: "package",
    role: "main",
    floor_types: ["jednofarebna"],
  },
  {
    id: "sika-3000fx-20",
    brand: "sika",
    name: "Sikafloor-3000FX (20 kg)",
    desc: "Polyuretán s flexibilitou — preklenutie trhlín do 0,8 mm",
    package_size_kg: 20,
    cost_per_package: 462,
    cost_per_kg: 23.1,
    sell_by: "package",
    role: "main",
    floor_types: ["jednofarebna"],
  },

  // ═══ VRCHNÉ LAKY (krok 3, voliteľné) ════════════════════════════════
  // Pôvodný 304W Matt nahrádza 3306W per cenník 2026
  {
    id: "sika-3306w-15",
    brand: "sika",
    name: "Sikafloor-3306W (14,98 kg)",
    desc: "PU mat lak — POZOR: pre metalicú/mramorovú používame Topstone EP22, tento iba pre jednofarebnú/chipsovú",
    package_size_kg: 14.98,
    cost_per_package: 300,
    cost_per_kg: 20.0,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "topcoat",
    // User explicit: pri metalickej + mramorovej sa dáva Topstone EP22 Plus,
    // NIE Sika PU lak. Sika PU je iba pre jednofarebné + chipsové.
    compatible_with: [
      "sika-264plus-kg",
      "sika-264-30",
      "sika-2510w-20",
      "sika-261w-20",
      "sika-3310-kg",
    ],
  },
  {
    id: "sika-tc442w-10",
    brand: "sika",
    name: "Sikafloor-TC 442W (10 kg)",
    desc: "Transparent PU lak — iba jednofarebná/chipsová (pre metalicú/mramorovú je Topstone EP22)",
    package_size_kg: 10,
    cost_per_package: 215,
    cost_per_kg: 21.5,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "topcoat",
    compatible_with: [
      "sika-264plus-kg",
      "sika-264-30",
      "sika-2510w-20",
      "sika-261w-20",
    ],
  },
  {
    id: "sika-tc446w-10",
    brand: "sika",
    name: "Sikafloor-TC 446W (10 kg)",
    desc: "Transparent PU lak — iba jednofarebná/chipsová (pre metalicú/mramorovú je Topstone EP22)",
    package_size_kg: 10,
    cost_per_package: 230,
    cost_per_kg: 23.0,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "topcoat",
    compatible_with: [
      "sika-264plus-kg",
      "sika-264-30",
      "sika-2510w-20",
      "sika-261w-20",
    ],
  },

  // ═══ DOPLNKY (samonivelácie, čistič, posyp) ═════════════════════════
  {
    id: "sika-level-30-25",
    brand: "sika",
    name: "Sikafloor Level-30 (25 kg)",
    desc: "Cementová samonivelačná stierka 4–30 mm (40 MPa)",
    package_size_kg: 25,
    cost_per_package: 46,
    cost_per_kg: 1.85,
    sell_by: "package",
    role: "additive",
  },
  {
    id: "sika-decocem-grey-25",
    brand: "sika",
    name: "Sikafloor-432 DecoCem Natural Grey (25 kg)",
    desc: "Dekoratívna cementová stierka 3–30 mm — exposed concrete look",
    package_size_kg: 25,
    cost_per_package: 75,
    cost_per_kg: 3.0,
    sell_by: "package",
    note: "TODO potvrdiť cenu",
    role: "additive",
  },
  // Tmel/lepidlo na zošitie statických trhlín (s carbon/oceľovým spínačom)
  {
    id: "sika-sikadur-30",
    brand: "sika",
    name: "Sikadur-30",
    desc: "2K epoxidový tmel na zošívanie prasklín (statické)",
    package_size_kg: 6, // štandardné balenie podľa Sika
    cost_per_package: null,
    cost_per_kg: 0,
    sell_by: "package",
    note: "TODO cenu doplniť",
    role: "additive",
  },
  {
    id: "sika-cln50-5l",
    brand: "sika",
    name: "Sika CLN 50 (5 L)",
    desc: "Čistič nástrojov — riedidlo pre epoxidy/PU",
    package_size_kg: 5,
    cost_per_package: 109,
    cost_per_kg: 21.8,
    sell_by: "package",
    role: "additive",
  },
  {
    id: "kremicity-piesok-kg",
    brand: "sika",
    name: "Kremičitý piesok (na kg)",
    desc: "Posyp pre protišmyk, chipsové / mramorové systémy",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 2.3,
    sell_by: "kg",
    note: "TODO potvrdiť cenu",
    role: "additive",
    floor_types: ["chipsova", "mramorova"],
  },
];

// ────────────────────────────────────────────────────────────────────────
// TOPSTONE / BETON-ACE — CZ ceny (vrátane CZ DPH)
// ────────────────────────────────────────────────────────────────────────
const TOPSTONE: Product[] = [
  // ═══ HLAVNÉ NÁTERY ════════════════════════════════════════════════════
  {
    id: "ba-ep11-metalic-20",
    brand: "betonace",
    name: "EP11 Metalic BA (Topstone)",
    // Rovnaká metalická báza sa používa pre metalickú aj mramorovú podlahu —
    // podľa faktúry od Betonace. Pre mramor sa navrch aplikujú farebné pole
    // v inom RAL odtieni, ale samotná báza je tá istá.
    desc: "Metalická báza pre metalickú aj mramorovú podlahu (top stupeň)",
    package_size_kg: 20,
    cost_per_package: 662,
    cost_per_kg: 33.0,
    sell_by: "package",
    role: "main",
    floor_types: ["metalicka", "mramorova"],
  },
  // ═══ VRCHNÝ LAK ══════════════════════════════════════════════════════
  {
    id: "ba-ep22plus-20",
    brand: "betonace",
    name: "EP22 Plus číra",
    desc: "Číry epoxidový lak pre mramor / metalic / chips",
    package_size_kg: 20,
    cost_per_package: 378,
    cost_per_kg: 18.9,
    sell_by: "package",
    role: "topcoat",
    compatible_with: ["ba-ep11-metalic-20", "ba-ep02-rals-25"],
  },
  // ═══ DOPLNKY ═════════════════════════════════════════════════════════
  {
    id: "stavekon-chipy-kg",
    brand: "stavekon",
    name: "Chipy STAVEKON",
    desc: "Farebné PVC vločky — chipsový systém",
    package_size_kg: null,
    // TODO: potvrdiť cenu — chýbajú údaje od dodávateľa
    cost_per_package: null,
    cost_per_kg: 0,
    sell_by: "kg",
    note: "TODO doplniť cenu",
    role: "additive",
    floor_types: ["chipsova"],
  },
];

export const PRODUCT_CATALOG: Product[] = [...SIKA, ...TOPSTONE];

export const BRAND_LABELS: Record<ProductBrand, string> = {
  sika: "Sika",
  topstone: "Topstone",
  betonace: "Beton-Ace",
  stavekon: "Stavekon",
};
