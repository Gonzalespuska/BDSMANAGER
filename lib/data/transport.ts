/**
 * Helpers pre výpočet dopravy + dĺžky realizácie.
 *
 * Sídlo Epoxidovo s.r.o. = Ružomberok. Vzdialenosti hardcoded podľa Google
 * Maps (cestná vzdialenosť, jedna strana). Pre menej známe obce vrátime null
 * a obchodník zadá km manuálne (TODO admin).
 */

export const HQ_NAME = "Ružomberok";

// ─── Sadzby dopravy (Fiat Ducato, priemerná dodávka) ────────────────────
// Benzín: spotreba 10 L / 100 km × 1.60 €/L  =  0.16 €/km
export const PETROL_LITERS_PER_100KM = 10;
export const PETROL_PRICE_PER_LITER = 1.6;
export const PETROL_PER_KM =
  (PETROL_LITERS_PER_100KM / 100) * PETROL_PRICE_PER_LITER; // 0.16

// Amortizácia Fiat Ducato (depreciácia + servis + pneu + poistka):
//   - depreciácia: ~35 000 € obstarávacia / ~250 000 km životnosť ≈ 0.14 €/km
//   - servis a údržba: ~0.07 €/km
//   - pneumatiky: ~0.03 €/km
//   - poistka + STK + dane (rozhodené na km): ~0.06 €/km
//   SPOLU: ≈ 0.30 €/km
export const AMORTIZATION_PER_KM = 0.3;

// Fixný náklad za jeden výjazd: nakladka materiálu + čas vodiča pre prípravu
// (≈ 30 min), papierovanie, parking. Garantuje minimum aj pre kratké trasy.
export const TRIP_STARTUP_FEE = 20;

// Celková sadzba za km: 0.16 + 0.30 = 0.46 €/km
export const COST_PER_KM = PETROL_PER_KM + AMORTIZATION_PER_KM;

// Realizácia: 1 robotnícky deň ≈ 25 m² (priemer pre liate epoxidy)
export const M2_PER_DAY = 25;

/** Hardcoded jednosmerné vzdialenosti z Ružomberka v km (zaokrúhlené). */
export const CITY_DISTANCES_FROM_RK: Record<string, number> = {
  // Severný Liptov + Orava + Tatry
  ruzomberok: 0,
  liptovskymikulas: 25,
  liptovskyhradok: 45,
  dolnykubin: 30,
  tvrdosin: 50,
  trstena: 60,
  namestovo: 70,
  oravskazamcek: 35,
  bobrov: 65,
  poprad: 100,
  kezmarok: 115,
  spisskanovaves: 130,
  levoca: 105,
  staralubovna: 130,

  // Stredné Slovensko
  martin: 35,
  vrutky: 35,
  banskabystrica: 85,
  zvolen: 100,
  brezno: 65,
  prievidza: 110,
  topolcany: 170,
  partizanske: 150,
  zilina: 75,
  povazskabystrica: 90,
  puchov: 100,
  ilava: 110,
  dubnicanadvahom: 115,
  trencin: 135,
  novemestonadvahom: 140,
  piestany: 175,
  myjava: 200,
  cadca: 110,
  kysuckenovemesto: 100,

  // Západné Slovensko
  bratislava: 250,
  trnava: 220,
  senec: 235,
  pezinok: 240,
  malacky: 270,
  skalica: 250,
  senica: 215,
  hlohovec: 195,
  sered: 215,
  galanta: 230,
  nitra: 175,
  zlatemoravce: 165,
  novezamky: 220,
  surany: 195,
  komarno: 245,
  levice: 175,
  sahy: 175,

  // Východné Slovensko
  kosice: 195,
  presov: 180,
  bardejov: 195,
  svidnik: 215,
  humenne: 240,
  vranov: 215,
  michalovce: 240,
  trebisov: 230,
  snina: 280,
  rimavskasobota: 150,
  lucenec: 140,
  poltar: 130,
};

function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diakritika
    .replace(/[^a-z]/g, ""); // bodky, medzery, číslice
}

// Bundle SK GeoNames (4587 obcí) — vzdialenosti Haversine × 1.3 road factor
import skPlacesData from "./sk-places.json";
const SK_PLACES_KM: Map<string, number> = new Map();
for (const [name, km] of skPlacesData as [string, number][]) {
  SK_PLACES_KM.set(normalizeCity(name), km);
}

/**
 * Vráti jednosmernú vzdialenosť v km, alebo null ak obec nie je v dataset.
 * Najprv pozre hardcoded tabuľku (overené Google Maps), potom Haversine
 * dataset zo SK GeoNames.
 */
export function getCityDistanceKm(
  city: string | null | undefined,
): number | null {
  if (!city) return null;
  const key = normalizeCity(city);
  if (!key) return null;
  if (CITY_DISTANCES_FROM_RK[key] !== undefined) {
    return CITY_DISTANCES_FROM_RK[key];
  }
  return SK_PLACES_KM.get(key) ?? null;
}

export interface TransportCalc {
  km_one_way: number;
  km_round_trip: number;
  petrol_eur: number;
  amortization_eur: number;
  total_eur: number;
}

/**
 * Spočíta dopravu: startup fee + round-trip × (benzín + amortizácia).
 *
 * Príklad pre 12 km jedna strana (= 24 km tam-späť):
 *   startup:                         20.00 €
 *   benzín:      24 × 0.16 =          3.84 €
 *   amortizácia: 24 × 0.30 =          7.20 €
 *   SPOLU:                          = 31.04 €
 *
 * Pre 135 km jedna strana (= 270 km tam-späť):
 *   startup:                         20.00 €
 *   benzín:      270 × 0.16 =        43.20 €
 *   amortizácia: 270 × 0.30 =        81.00 €
 *   SPOLU:                          =144.20 €
 */
export function calcTransport(kmOneWay: number): TransportCalc {
  const round = kmOneWay * 2;
  const petrol = round * PETROL_PER_KM;
  const amort = round * AMORTIZATION_PER_KM;
  return {
    km_one_way: kmOneWay,
    km_round_trip: round,
    petrol_eur: petrol,
    amortization_eur: amort,
    total_eur: TRIP_STARTUP_FEE + petrol + amort,
  };
}

/** Dĺžka realizácie v dňoch (ceil m² / M2_PER_DAY, min 1). */
export function calcDays(m2: number): number {
  if (m2 <= 0) return 0;
  return Math.max(1, Math.ceil(m2 / M2_PER_DAY));
}
