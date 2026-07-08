/**
 * Cenník materiálov pre režim "Iba materiál + doprava".
 *
 * Náklady (`cost_per_package`, `cost_per_kg`) sú vrátane DPH (SK 23 %).
 * Predajná cena sa počíta s maržou `MARZA_MATERIAL` (35 %).
 *
 * Zdroje (Q3 2026 — aktualizované podľa reálnych partnerských cien):
 *   - SIKA — Peto Noga (peter@sk.sika.com) partnerský cenník + reálne faktúry
 *     (proforma 3364713 z 03.06.2026). Ceny bez DPH prepočítané × 1,23.
 *     Zdroj: .epoxidovo-sika/CENNIK-MASTER.md
 *   - TOPSTONE / BETON-ACE — faktúra 0000000352 z 01.07.2026, CZK × 25,3 CZK/EUR × 1,23
 *
 * Spotreby (podľa Sika TDS + reálnych Peto zákaziek — poznámky pri každom produkte):
 *   Sikafloor-150 Plus:  0,50 kg/m²   (penetrácia)
 *   Sikafloor-151:       0,50 kg/m²   (primer + scratch coat)
 *   Sikafloor-01 Primer: 0,35 kg/m²
 *   Sikafloor-03 Primer: 0,15 kg/m²
 *   Sikafloor-264 Plus:  1,40 kg/m²   (2 vrstvy nosná)
 *   Sikafloor-3000:      1,30 kg/m²
 *   Sikafloor-3310:      0,20 kg/m²   (top-coat)
 *   Sikafloor-304W Matt: 0,18 kg/m²
 *   Topstone EP02:       0,93 kg/m²   (2 vrstvy penetrácia)
 *   Topstone EP11 báza:  1,22 kg/m²
 *   Topstone EP22 Plus:  1,19 kg/m²   (2 vrstvy top-coat)
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
    desc: "2K epoxidový primer + samonivel — pod 264, 264 Plus, 2510W · spotreba 0,50 kg/m²",
    package_size_kg: 25,
    // Peto: 7,41 €/kg bez DPH × 1,23 = 9,11 €/kg s DPH → 228 €/bal
    cost_per_package: 228,
    cost_per_kg: 9.11,
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
    desc: "2K epoxidový primer + samonivel — menšie balenie · spotreba 0,50 kg/m² · DRAHŠIE per kg",
    package_size_kg: 10,
    // Peto: 9,60 €/kg bez DPH × 1,23 = 11,81 €/kg s DPH → 118 €/bal
    cost_per_package: 118,
    cost_per_kg: 11.81,
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
    name: "Sikafloor-151 (30 kg)",
    desc: "Multifunkčný 2K epox primer + scratch coat / výlevka · spotreba 0,50 kg/m² (0,4–0,6)",
    package_size_kg: 30,
    // Peto: 4,80 €/kg bez DPH × 1,23 = 5,90 €/kg s DPH → 177 €/bal
    cost_per_package: 177,
    cost_per_kg: 5.9,
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
    name: "Sikafloor-01 Primer (10 kg)",
    desc: "2K epoxidový primer — najekonomickejší primer pre hladké podklady · spotreba 0,35 kg/m²",
    package_size_kg: 10,
    // Peto: 3,24 €/kg bez DPH × 1,23 = 3,99 €/kg s DPH → 40 €/bal
    cost_per_package: 40,
    cost_per_kg: 3.99,
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
    name: "Sikafloor-03 Primer (10 kg)",
    desc: "2K primer pre nasiakavé podklady (sadra, cement, drevo, OSB) · spotreba 0,15 kg/m²",
    package_size_kg: 10,
    // Peto: 3,60 €/kg bez DPH × 1,23 = 4,43 €/kg s DPH → 44 €/bal
    cost_per_package: 44,
    cost_per_kg: 4.43,
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
    name: "Sikafloor-264 Plus RAL 7032/7035 (30 kg, na kg)",
    desc: "2K epoxid pre priemysel + garáže · spotreba 1,40 kg/m² (2 vrstvy)",
    package_size_kg: null,
    cost_per_package: null,
    // Peto: 5,78 €/kg bez DPH × 1,23 = 7,11 €/kg s DPH
    cost_per_kg: 7.11,
    sell_by: "kg",
    role: "main",
    floor_types: ["jednofarebna", "chipsova", "mramorova"],
  },
  {
    id: "sika-264-30",
    brand: "sika",
    name: "Sikafloor-264 Plus PASTEL (30 kg)",
    desc: "Pastelové odtiene +6 % nad RAL 7032/35 · spotreba 1,40 kg/m²",
    package_size_kg: 30,
    // Peto: 6,10 €/kg bez DPH × 1,23 = 7,50 €/kg s DPH → 225 €/bal
    cost_per_package: 225,
    cost_per_kg: 7.5,
    sell_by: "package",
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
  // Sikafloor-3310 — PU vrchný lak (NIE main, per Sika systémová schéma)
  {
    id: "sika-3310-kg",
    brand: "sika",
    name: "Sikafloor-3310 RAL 7032/7035 (20 kg, na kg)",
    desc: "PU vrchný lak k Sikafloor-3000 systému · spotreba 0,20 kg/m² (Sika TDS)",
    package_size_kg: null,
    cost_per_package: null,
    // Peto: 7,15 €/kg bez DPH × 1,23 = 8,79 €/kg s DPH
    cost_per_kg: 8.79,
    sell_by: "kg",
    role: "topcoat",
    floor_types: ["jednofarebna"],
    compatible_with: ["sika-3000-20", "sika-3000fx-20"],
  },
  // Polyuretánové
  {
    id: "sika-3000-20",
    brand: "sika",
    name: "Sikafloor-3000 RAL 7032/7035 (20 kg)",
    desc: "PU báza — pružnosť, UV stabilita · spotreba 1,30 kg/m²",
    package_size_kg: 20,
    // Peto: 11,00 €/kg bez DPH × 1,23 = 13,53 €/kg s DPH → 271 €/bal
    cost_per_package: 271,
    cost_per_kg: 13.53,
    sell_by: "package",
    role: "main",
    floor_types: ["jednofarebna"],
  },
  {
    id: "sika-3000fx-20",
    brand: "sika",
    name: "Sikafloor-3000 FX (20 kg)",
    desc: "PU s Marble/Metallic FX efektom · spotreba 1,30 kg/m²",
    package_size_kg: 20,
    // Peto cenník: 11,88 €/kg bez DPH, faktúra 12,20 €/kg bez DPH — použijeme
    // faktúrne (reálne účtované) × 1,23 = 15,01 €/kg s DPH → 300 €/bal
    cost_per_package: 300,
    cost_per_kg: 15.01,
    sell_by: "package",
    role: "main",
    floor_types: ["jednofarebna", "metalicka"],
  },

  // ═══ VRCHNÉ LAKY (krok 3, voliteľné) ════════════════════════════════
  // Pôvodný 304W Matt nahrádza 3306W per cenník 2026
  {
    id: "sika-3306w-15",
    brand: "sika",
    name: "Sikafloor-304W Matt (7,5 kg)",
    desc: "PU vodou-riediteľný mat lak (Sika 2026: 3306W = náhrada 304W) · spotreba 0,18 kg/m²",
    package_size_kg: 7.5,
    // Peto cenník: 20,48 €/kg bez DPH, faktúra 21,63 €/kg bez DPH — použijeme
    // faktúrne × 1,23 = 26,60 €/kg s DPH → 200 €/bal
    cost_per_package: 200,
    cost_per_kg: 26.6,
    sell_by: "package",
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
    name: "Sikafloor-TC 442W clear (10 kg)",
    desc: "Transparent PU lak clear · spotreba 0,15 kg/m²",
    package_size_kg: 10,
    // Peto: 19,25 €/kg bez DPH × 1,23 = 23,68 €/kg s DPH → 237 €/bal
    cost_per_package: 237,
    cost_per_kg: 23.68,
    sell_by: "package",
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
    name: "Sikafloor-TC 442W RAL 7032/7035 (10 kg)",
    desc: "Transparent PU lak farebný · spotreba 0,15 kg/m²",
    package_size_kg: 10,
    // Peto: 23,10 €/kg bez DPH × 1,23 = 28,41 €/kg s DPH → 284 €/bal
    cost_per_package: 284,
    cost_per_kg: 28.41,
    sell_by: "package",
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
    name: "Sikafloor Level-30 (25 kg vrece)",
    desc: "Cementová samonivelačná stierka 4–30 mm (40 MPa) · spotreba 1,8 kg/m²/mm",
    package_size_kg: 25,
    // Peto: 0,97 €/kg bez DPH × 1,23 = 1,19 €/kg s DPH → 30 €/vrece
    cost_per_package: 30,
    cost_per_kg: 1.19,
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
    name: "Topstone EP11 Metalic BA (20 kg sud)",
    // Rovnaká metalická báza sa používa pre metalickú aj mramorovú podlahu —
    // podľa faktúry od Betonace 0000000352. Pre mramor sa navrch aplikujú
    // farebné pole v inom RAL odtieni, ale samotná báza je tá istá.
    desc: "2K epox metalická liata stierka pre 3D efekt / mramor · spotreba 1,22 kg/m²",
    package_size_kg: 20,
    // Faktúra: 430 CZK/kg × (25,3 CZK/EUR)⁻¹ = 17,00 €/kg bez DPH × 1,23 = 20,91 €/kg s DPH
    // → 418 €/sud
    cost_per_package: 418,
    cost_per_kg: 20.91,
    sell_by: "package",
    role: "main",
    floor_types: ["metalicka", "mramorova"],
  },
  // ═══ VRCHNÝ LAK ══════════════════════════════════════════════════════
  {
    id: "ba-ep22plus-20",
    brand: "betonace",
    name: "Topstone EP22 Plus číra (20 kg sud)",
    desc: "Číry PU vrchný lak pre mramor / metalic / chips (2 vrstvy) · spotreba 1,19 kg/m² total",
    package_size_kg: 20,
    // Faktúra: 247,62 CZK/kg = 9,79 €/kg bez DPH × 1,23 = 12,04 €/kg s DPH → 241 €/sud
    cost_per_package: 241,
    cost_per_kg: 12.04,
    sell_by: "package",
    role: "topcoat",
    compatible_with: ["ba-ep11-metalic-20", "ba-ep02-rals-25"],
  },
  // ═══ PENETRÁCIE Topstone ═════════════════════════════════════════════
  {
    id: "ba-ep02-rals-25",
    brand: "betonace",
    name: "Topstone EP02 RAL 7035 (25 kg vrece)",
    desc: "2K epox penetrácia RAL 7035 (šedá) pre metalic/mramor · spotreba 0,93 kg/m² (2 vrstvy)",
    package_size_kg: 25,
    // Faktúra: 191,24 CZK/kg = 7,56 €/kg bez DPH × 1,23 = 9,30 €/kg s DPH → 232 €/vrece
    cost_per_package: 232,
    cost_per_kg: 9.3,
    sell_by: "package",
    role: "primer",
    floor_types: ["metalicka", "mramorova"],
    compatible_with: ["ba-ep11-metalic-20"],
  },
  {
    id: "ba-ep01-primer",
    brand: "betonace",
    name: "Topstone EP01 Primer",
    desc: "2K epox univerzálna penetrácia · TODO: cena chýba, zatiaľ použi EP02",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 0,
    sell_by: "kg",
    note: "TODO cenu od Betonace",
    role: "primer",
  },
  // ═══ BOOSTERY / AKCELERÁTORY ═════════════════════════════════════════
  {
    id: "ba-akcelerator-5",
    brand: "betonace",
    name: "Topstone Akcelerátor (5 kg kanister)",
    desc: "Booster pre EP01/EP02 penetrácie — zrýchľuje vytvrdnutie z ~24h na 4–6h · spotreba 0,04 kg/m²",
    package_size_kg: 5,
    // Faktúra: 318,90 CZK/kg = 12,60 €/kg bez DPH × 1,23 = 15,50 €/kg s DPH → 78 €/kanister
    cost_per_package: 78,
    cost_per_kg: 15.5,
    sell_by: "package",
    role: "additive",
    floor_types: ["metalicka", "mramorova"],
  },
  // ═══ DOPRAVA / PALETA ════════════════════════════════════════════════
  {
    id: "ba-paleta-euro",
    brand: "betonace",
    name: "EUR paleta 1200×800 (za ks)",
    desc: "Paletné za dopravu (2 ks / štandardná zákazka)",
    package_size_kg: null,
    // Faktúra: 280 CZK/ks = 11,07 €/ks bez DPH × 1,23 = 13,62 €/ks s DPH
    cost_per_package: 14,
    cost_per_kg: 0,
    sell_by: "package",
    role: "additive",
  },
  // ═══ CHIPSY ═════════════════════════════════════════════════════════
  {
    id: "stavekon-chipy-kg",
    brand: "stavekon",
    name: "Chipy STAVEKON",
    desc: "Farebné PVC vločky — chipsový systém · spotreba 0,20 kg/m² (full broadcast)",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 0,
    sell_by: "kg",
    note: "TODO cena od dodávateľa (odhad 50 €/kg = 10 €/m²)",
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
