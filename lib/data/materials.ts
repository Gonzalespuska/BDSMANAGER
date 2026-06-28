/**
 * Katalóg operácií pre Generátor ponúk — REALIZÁCIA podlahy.
 *
 * `price_per_sqm` je FINÁLNA PREDAJNÁ CENA za m² (vrátane marže aj DPH).
 * `calcLine` vracia priamo `m² × price_per_sqm` — žiadny ďalší výpočet.
 *
 * Pre prasklíny (Zošívanie) je `price_per_unit` = €/ks finálne.
 *
 * 4 typy podlahy zo stránky epoxidovo.sk:
 *   - jednofarebna (Epoxid 264 Plus / Polyuretán 3000 — voľba cez variant)
 *   - chipsova     (epoxidová báza, vrchný lak uzaviera chipy)
 *   - mramorova    (Topstone — mramorový epoxid)
 *   - metalicka    (Topstone EP11 + EP02 báza, EP22 Plus vrchný)
 */


export type FloorType =
  | "jednofarebna"
  | "chipsova"
  | "mramorova"
  | "metalicka";

export type MaterialUnit = "area" | "level" | "count" | "surcharge";

export interface Material {
  id: string;
  floor_type: FloorType;
  name: string;
  unit: MaterialUnit;
  /** FINÁLNA PREDAJNÁ CENA za 1 m² (vrát. marže a DPH). Pre unit="count" sa nepoužíva.
   * Pri unit="level" je to FIXNÁ časť (primer + práca + réžia) nezávislá od mm. */
  price_per_sqm: number;
  /** Pre unit="count": FINÁLNA cena za 1 ks (napr. 20 € / prasklina). */
  price_per_unit?: number;
  /** Pre unit="level": prírastok cena/m²/mm (napr. Sika Level-30 4,20 €/m²/mm). */
  price_per_sqm_per_mm?: number;
  /** Pre unit="level": minimálna hrúbka v mm (default povolenia, default fallback). */
  min_mm?: number;
  /** Pre unit="level": default hrúbka v mm pre init. */
  default_mm?: number;
  /** Pre unit="count": label jednotky pre UI. */
  unit_label?: string;
  optional: boolean;
  /**
   * Default stav checkboxu — ak je `false`, operácia je v init stave VYPNUTÁ
   * aj keď nie je optional. Ak nie je nastavené, defaultne `!optional`.
   */
  default_enabled?: boolean;
  /**
   * Skrytá pre zákazníka — položka sa nezobrazí v PDF cenovej ponuke, ale jej
   * suma sa pripočíta k celkovej cene. Používa sa pre "Zložka" (manuálny
   * príplatok obchodáka, napr. komplikovaný terén / kokot zákazník).
   */
  hidden_in_pdf?: boolean;
  /**
   * Variant materiálu — keď jeden typ podlahy má niekoľko alternatívnych
   * materiálov (napr. jednofarebná: epoxid vs polyuretán). Do calcs ide len
   * materiál s aktívnym variantom; ostatné sú odfiltrované.
   */
  variant?: "epoxid" | "polyuretan";
}

/** Akuzatív skloneného podstatného mena pre vetu "na ... podlahu":
 *    na jednofarebnú podlahu / na chipsovú / na mramorovú / na metalickú
 */
export const FLOOR_TYPE_ACCUSATIVE: Record<FloorType, string> = {
  jednofarebna: "jednofarebnú",
  chipsova: "chipsovú",
  mramorova: "mramorovú",
  metalicka: "metalickú",
};

export const FLOOR_TYPE_LABELS: Record<FloorType, string> = {
  jednofarebna: "Jednofarebná",
  chipsova: "Chipsová",
  mramorova: "Mramorová",
  metalicka: "Metalická",
};

export const FLOOR_TYPE_META: Record<
  FloorType,
  { tagline: string; icon: string }
> = {
  jednofarebna: {
    tagline: "Hladká plocha v jednom odtieni,najekonomickejšia",
    icon: "🟦",
  },
  chipsova: {
    tagline: "Dekoratívne chipsy v transparentnom laku",
    icon: "🟧",
  },
  mramorova: {
    tagline: "Mramorový efekt z 2 farieb,premium",
    icon: "🟪",
  },
  metalicka: {
    tagline: "Metalické pigmenty s leskom,high-end",
    icon: "🟨",
  },
};

// ────────────────────────────────────────────────────────────────────────
// Helper: voliteľné operácie spoločné pre všetky typy podlahy.
// ────────────────────────────────────────────────────────────────────────
function commonOptional(floor_type: FloorType): Material[] {
  return [
    {
      id: `${floor_type}-zosivanie`,
      floor_type,
      name: "Zošívanie podkladu",
      unit: "count",
      price_per_sqm: 0,
      price_per_unit: 20, // 20 € finálne za 1 prasklinu
      unit_label: "ks prasklín",
      optional: true,
    },
    {
      id: `${floor_type}-nivelacia`,
      floor_type,
      name: "Nivelácia (samonivelizačná stierka)",
      unit: "level",
      // Sika Level-30 — spotreba 1,8 kg/m² za každý 1 mm hrúbky.
      // Cena = m² × (7,80 + 4,20 × mm). Finálna predajná, vrát. marže a DPH.
      price_per_sqm: 7.8, // fixná časť: primer + práca + réžia
      price_per_sqm_per_mm: 4.2, // prírastok za každý 1 mm vrstvy
      min_mm: 4, // pod 4 mm nivelačka praská (Sika)
      default_mm: 4,
      optional: true,
    },
    {
      // ZLOŽKA — manuálny EUR príplatok ktorý obchodák pridá podľa situácie
      // (komplikovaný terén, ťažký zákazník, etc.). Skryté v PDF — zákazník
      // to nevidí ako samostatný riadok, len sumu zarátanú v celkovej cene.
      id: `${floor_type}-zlozka`,
      floor_type,
      name: "Zložka",
      unit: "surcharge",
      price_per_sqm: 0,
      unit_label: "€ (manuálne)",
      optional: true,
      hidden_in_pdf: true,
    },
  ];
}

export const MATERIALS: Material[] = [
  // ═══ JEDNOFAREBNÁ ════════════════════════════════════════════════════
  {
    id: "jednofarebna-uprava",
    floor_type: "jednofarebna",
    name: "Úprava povrchu (diamantové brúsenie)",
    unit: "area",
    price_per_sqm: 6,
    optional: false,
  },
  // Penetrácia — variant Epoxid
  {
    id: "jednofarebna-penetracia-epoxid",
    floor_type: "jednofarebna",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 8,
    optional: false,
    variant: "epoxid",
  },
  // Penetrácia — variant Polyuretán
  {
    id: "jednofarebna-penetracia-polyuretan",
    floor_type: "jednofarebna",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 9,
    optional: false,
    variant: "polyuretan",
  },
  // Farebný náter — variant Epoxid (264 Plus)
  // Cieľ: 6 + 8 + 30 = 50 €/m² bez laku
  {
    id: "jednofarebna-farebny-epoxid",
    floor_type: "jednofarebna",
    name: "Farebný náter",
    unit: "area",
    price_per_sqm: 30,
    optional: false,
    variant: "epoxid",
  },
  // Farebný náter — variant Polyuretán
  // Cieľ: 6 + 9 + 56 + 9 = 80 €/m² s lakom
  {
    id: "jednofarebna-farebny-polyuretan",
    floor_type: "jednofarebna",
    name: "Farebný náter",
    unit: "area",
    price_per_sqm: 56,
    optional: false,
    variant: "polyuretan",
  },
  // Vrchný lak — variant Epoxid (default VYPNUTÝ — 264 je sám o sebe finál)
  {
    id: "jednofarebna-lak-epoxid",
    floor_type: "jednofarebna",
    name: "Vrchný lak",
    unit: "area",
    price_per_sqm: 6,
    optional: false,
    default_enabled: false,
    variant: "epoxid",
  },
  // Vrchný lak — variant Polyuretán (default ZAPNUTÝ)
  {
    id: "jednofarebna-lak-polyuretan",
    floor_type: "jednofarebna",
    name: "Vrchný lak",
    unit: "area",
    price_per_sqm: 9,
    optional: false,
    default_enabled: true,
    variant: "polyuretan",
  },
  ...commonOptional("jednofarebna"),

  // ═══ CHIPSOVÁ ════════════════════════════════════════════════════════
  {
    id: "chipsova-uprava",
    floor_type: "chipsova",
    name: "Úprava povrchu (diamantové brúsenie)",
    unit: "area",
    price_per_sqm: 6,
    optional: false,
  },
  {
    id: "chipsova-penetracia",
    floor_type: "chipsova",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 7,
    optional: false,
  },
  {
    id: "chipsova-farebny",
    floor_type: "chipsova",
    name: "Farebný náter",
    unit: "area",
    // TODO: potvrdiť cenu — obsahuje odhad ceny chipov + piesku
    price_per_sqm: 26,
    optional: false,
  },
  // Vrchný lak — pri chipsovej sa NEDÁVA (rozhodnutie 2026-06-26)
  ...commonOptional("chipsova"),

  // ═══ MRAMOROVÁ (Topstone) ════════════════════════════════════════════
  {
    id: "mramorova-uprava",
    floor_type: "mramorova",
    name: "Úprava povrchu (diamantové brúsenie)",
    unit: "area",
    price_per_sqm: 6,
    optional: false,
  },
  {
    id: "mramorova-penetracia",
    floor_type: "mramorova",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 12, // Topstone báza
    optional: false,
  },
  {
    id: "mramorova-farebny",
    floor_type: "mramorova",
    name: "Farebný náter",
    unit: "area",
    // Topstone mramorový epoxid — finálna predajná cena
    // (zrovnanie s epoxidovo.sk "od 139 €/m²")
    price_per_sqm: 110,
    optional: false,
  },
  {
    id: "mramorova-lak",
    floor_type: "mramorova",
    name: "Vrchný lak",
    unit: "area",
    price_per_sqm: 11, // Topstone vrchný lak
    optional: false,
    default_enabled: true,
  },
  ...commonOptional("mramorova"),

  // ═══ METALICKÁ (Topstone EP11 + EP02 báza, EP22 Plus vrch) ════════════
  {
    id: "metalicka-uprava",
    floor_type: "metalicka",
    name: "Úprava povrchu (diamantové brúsenie)",
    unit: "area",
    price_per_sqm: 6,
    optional: false,
  },
  {
    id: "metalicka-penetracia",
    floor_type: "metalicka",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 14, // EP02 báza 2×
    optional: false,
  },
  {
    id: "metalicka-farebny",
    floor_type: "metalicka",
    name: "Farebný náter",
    unit: "area",
    // Topstone EP11 metalic — finálna predajná cena (vrát. marže a DPH)
    price_per_sqm: 90,
    optional: false,
  },
  {
    id: "metalicka-lak",
    floor_type: "metalicka",
    name: "Vrchný lak",
    unit: "area",
    price_per_sqm: 19, // Topstone EP22 Plus — povinný
    optional: false,
    default_enabled: true,
  },
  ...commonOptional("metalicka"),
];

export function getMaterialsByFloorType(type: FloorType): Material[] {
  return MATERIALS.filter((m) => m.floor_type === type);
}

export interface QuoteLineCalc {
  material_id: string;
  material_name: string;
  m2: number;
  mm: number;
  poolable: boolean;
  kg_needed: number;
  packages: number;
  /** Náklad pred maržou. */
  material_cost: number;
  work_cost: number;
  /** Predajná cena = náklad / (1 − marža). */
  total: number;
}

/**
 * Vypočíta cenovú položku jednej operácie.
 *
 * Sadzby v Material sú UŽ FINÁLNE predajné ceny (vrátane marže aj DPH).
 *
 *   - unit="count" → m² parameter je počet ks; cena = ks × price_per_unit
 *   - unit="area"  → cena = m² × price_per_sqm
 *   - unit="level" → cena = m² × (price_per_sqm + price_per_sqm_per_mm × mm)
 *                    mm sa clampuje na min_mm (default 4 pri nivelácii)
 */
export function calcLine(
  m: Material,
  m2: number,
  mm: number,
): QuoteLineCalc {
  let qty = Math.max(0, m2);
  let mmEff = 0;
  let total = 0;

  if (m.unit === "count") {
    qty = Math.floor(qty);
    total = qty * (m.price_per_unit ?? 0);
  } else if (m.unit === "level") {
    // Hrúbka clampnutá na minimum (napr. 4 mm pre Sika Level-30)
    mmEff = Math.max(m.min_mm ?? 0, mm);
    const ratePerSqm = m.price_per_sqm + (m.price_per_sqm_per_mm ?? 0) * mmEff;
    total = qty * ratePerSqm;
  } else if (m.unit === "surcharge") {
    // Zložka — m2 parameter sa použije ako priamo EUR suma (manuálne).
    // Ignorujeme price_per_sqm aj mm; obchodák píše konkrétnu sumu v UI.
    qty = Math.max(0, m2);
    total = qty;
  } else {
    total = qty * m.price_per_sqm;
  }

  return {
    material_id: m.id,
    material_name: m.name,
    m2: qty,
    mm: mmEff,
    poolable: false,
    kg_needed: 0,
    packages: 0,
    material_cost: total,
    work_cost: 0,
    total,
  };
}

export function formatEur(n: number): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
