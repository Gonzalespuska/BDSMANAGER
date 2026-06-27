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

export type ProductBrand = "sika" | "topstone" | "betonace" | "stavekon";

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
}

// ────────────────────────────────────────────────────────────────────────
// SIKA — slovenský cenník
// ────────────────────────────────────────────────────────────────────────
const SIKA: Product[] = [
  {
    id: "sika-01-primer-10",
    brand: "sika",
    name: "Sikafloor-01 Primer",
    package_size_kg: 10,
    cost_per_package: 61,
    cost_per_kg: 6.15,
    sell_by: "package",
  },
  {
    id: "sika-03-primer-10",
    brand: "sika",
    name: "Sikafloor-03 Primer",
    package_size_kg: 10,
    cost_per_package: 68,
    cost_per_kg: 6.8,
    sell_by: "package",
  },
  {
    id: "sika-level-30-25",
    brand: "sika",
    name: "Sikafloor Level-30",
    package_size_kg: 25,
    cost_per_package: 46,
    cost_per_kg: 1.85,
    sell_by: "package",
  },
  {
    id: "sika-151-30",
    brand: "sika",
    name: "Sikafloor-151",
    package_size_kg: 30,
    cost_per_package: 272,
    cost_per_kg: 9.1,
    sell_by: "package",
  },
  {
    id: "sika-150plus-25",
    brand: "sika",
    name: "Sikafloor-150 Plus (25 kg)",
    package_size_kg: 25,
    cost_per_package: 363,
    cost_per_kg: 14.55,
    sell_by: "package",
  },
  {
    id: "sika-150plus-10",
    brand: "sika",
    name: "Sikafloor-150 Plus (10 kg)",
    package_size_kg: 10,
    cost_per_package: 182,
    cost_per_kg: 18.2,
    sell_by: "package",
  },
  {
    id: "sika-264plus-kg",
    brand: "sika",
    name: "Sikafloor-264 Plus (na kg)",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 11.0,
    sell_by: "kg",
  },
  {
    id: "sika-3310-kg",
    brand: "sika",
    name: "Sikafloor-3310 (na kg)",
    package_size_kg: null,
    cost_per_package: null,
    cost_per_kg: 13.5,
    sell_by: "kg",
  },
  {
    id: "sika-3000-20",
    brand: "sika",
    name: "Sikafloor-3000",
    package_size_kg: 20,
    cost_per_package: 416,
    cost_per_kg: 20.8,
    sell_by: "package",
  },
  {
    id: "sika-3000fx-20",
    brand: "sika",
    name: "Sikafloor-3000FX",
    package_size_kg: 20,
    cost_per_package: 462,
    cost_per_kg: 23.1,
    sell_by: "package",
  },
  {
    id: "sika-304w-7.5",
    brand: "sika",
    name: "Sikafloor-304W Matt",
    package_size_kg: 7.5,
    // TODO: potvrdiť cenu — ODHAD 150 € / balenie, 20 €/kg
    cost_per_package: 150,
    cost_per_kg: 20.0,
    sell_by: "package",
    note: "ODHAD ceny",
  },
  {
    id: "sika-cln50-5l",
    brand: "sika",
    name: "Sika CLN 50 (5 L)",
    package_size_kg: 5, // L ≈ kg pre tento účel
    cost_per_package: 109,
    cost_per_kg: 21.8,
    sell_by: "package",
  },
  {
    id: "kremicity-piesok-kg",
    brand: "sika",
    name: "Kremičitý piesok (na kg)",
    package_size_kg: null,
    cost_per_package: null,
    // TODO: potvrdiť cenu — ODHAD 2,30 €/kg
    cost_per_kg: 2.3,
    sell_by: "kg",
    note: "ODHAD ceny",
  },
];

// ────────────────────────────────────────────────────────────────────────
// TOPSTONE / BETON-ACE — CZ ceny (vrátane CZ DPH)
// ────────────────────────────────────────────────────────────────────────
const TOPSTONE: Product[] = [
  {
    id: "ba-ep11-metalic-20",
    brand: "betonace",
    name: "EP11 Metalic BA",
    package_size_kg: 20,
    cost_per_package: 662,
    cost_per_kg: 33.0,
    sell_by: "package",
  },
  {
    id: "ba-ep02-rals-25",
    brand: "betonace",
    name: "EP02 farebný RAL",
    package_size_kg: 25,
    cost_per_package: 369,
    cost_per_kg: 14.8,
    sell_by: "package",
  },
  {
    id: "ba-ep22plus-20",
    brand: "betonace",
    name: "EP22 Plus číra",
    package_size_kg: 20,
    cost_per_package: 378,
    cost_per_kg: 18.9,
    sell_by: "package",
  },
  {
    id: "stavekon-chipy-kg",
    brand: "stavekon",
    name: "Chipy STAVEKON (na kg)",
    package_size_kg: null,
    // TODO: potvrdiť cenu — chýbajú údaje od dodávateľa
    cost_per_package: null,
    cost_per_kg: 0,
    sell_by: "kg",
    note: "TODO doplniť cenu",
  },
];

export const PRODUCT_CATALOG: Product[] = [...SIKA, ...TOPSTONE];

export const BRAND_LABELS: Record<ProductBrand, string> = {
  sika: "Sika",
  topstone: "Topstone",
  betonace: "Beton-Ace",
  stavekon: "Stavekon",
};
