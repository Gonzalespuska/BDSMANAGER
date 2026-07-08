/**
 * Pricing konštanty pre Generátor ponúk.
 *
 * Marže sú v rozsahu [0, 1). Predajná cena = náklad / (1 − marža).
 * Náklady (cost_per_sqm v materials.ts, package_price v product-catalog.ts)
 * sú vrátane DPH (sme neplatiteľ → nevratná).
 */

export const MARZA_REALIZACIA = 0.5; // 50 % pri realizácii podlahy

/** Globálny fallback marža na materiál (ak per-role nie je nastavená). */
export const MARZA_MATERIAL = 0.37; // 37 % — default, prepísateľné v /admin/settings

/** Marže per rola produktu (fallback ak DB nič nevráti). Držané spolu s
 *  SQL migráciou 26_material_markups.sql. Admin ich edituje v /admin/settings
 *  na tabe "Marže materiálov". */
export const MARZA_MATERIAL_PER_ROLE = {
  primer: 0.37,
  main: 0.37,
  topcoat: 0.37,
  additive: 0.37,
  transport: 0.37,
} as const;

export type MaterialRole = keyof typeof MARZA_MATERIAL_PER_ROLE;

/** Pretvorí náklad na predajnú cenu pridaním marže. */
export function applyMargin(cost: number, marza: number): number {
  if (marza >= 1) return cost; // safety
  return cost / (1 - marza);
}

/**
 * Vráti maržu pre daný role produktu. Ak je settingsMap prázdny, použije
 * fallback z MARZA_MATERIAL_PER_ROLE. `settingsMap` je Map<key, value>
 * načítaná z app_settings (kľúče `markup.primer`, `markup.main`, ...).
 */
export function getMarkupForRole(
  role: MaterialRole,
  settingsMap?: Map<string, unknown>,
): number {
  const key = `markup.${role}`;
  const raw = settingsMap?.get(key);
  if (typeof raw === "number" && raw >= 0 && raw < 1) return raw;
  if (typeof raw === "string") {
    const parsed = parseFloat(raw);
    if (isFinite(parsed) && parsed >= 0 && parsed < 1) return parsed;
  }
  return MARZA_MATERIAL_PER_ROLE[role];
}
