/**
 * Pricing konštanty pre Generátor ponúk.
 *
 * Marže sú v rozsahu [0, 1). Predajná cena = náklad / (1 − marža).
 * Náklady (cost_per_sqm v materials.ts, package_price v product-catalog.ts)
 * sú vrátane DPH (sme neplatiteľ → nevratná).
 */

export const MARZA_REALIZACIA = 0.5; // 50 % pri realizácii podlahy
export const MARZA_MATERIAL = 0.35; // 35 % pri samostatnom predaji materiálu

/** Pretvorí náklad na predajnú cenu pridaním marže. */
export function applyMargin(cost: number, marza: number): number {
  if (marza >= 1) return cost; // safety
  return cost / (1 - marza);
}
