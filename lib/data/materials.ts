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

export type MaterialUnit = "area" | "level" | "count" | "surcharge" | "sokel";

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
  /** Pre unit="sokel": sadzba €/bm/cm výšky (default 1,20). */
  price_per_bm_per_cm?: number;
  /** Pre unit="sokel": default výška v cm. */
  default_cm?: number;
  /** Pre unit="sokel": min výška v cm. */
  min_cm?: number;
  /** Pre unit="sokel": max výška v cm. */
  max_cm?: number;
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
   * suma sa pripočíta k celkovej cene. Používa sa pre "Skrytú zložku" (manuálny
   * markup obchodáka, napr. komplikovaný terén / kokot zákazník).
   */
  hidden_in_pdf?: boolean;
  /**
   * Vyžaduje custom label od obchodníka pri pridaní (napr. "Doprava 200 km",
   * "Demontáž starej podlahy"). Použité pre POMENOVANÚ zložku — zobrazí sa
   * na PDF/FA s týmto názvom (nie s genérickým "Zložka").
   *
   * Bez labelu sa položka NEZAPOČÍTA do total — UI vynúti zadanie textu.
   */
  requires_label?: boolean;
  /**
   * Variant materiálu — keď jeden typ podlahy má niekoľko alternatívnych
   * materiálov (napr. jednofarebná: epoxid vs polyuretán). Do calcs ide len
   * materiál s aktívnym variantom; ostatné sú odfiltrované.
   */
  variant?: "epoxid" | "polyuretan";
}

/**
 * Množstevné zľavy — automatický discount podľa m² zákazky.
 * Logika: pri 100+ m² má reálne lepšiu unit ekonomiku (transport, setup
 * sa amortizuje), preto môžeš dať zľavu a stále byť ziskový.
 *
 * Tiers sú hardcoded zatiaľ — v budúcnosti admin UI na /admin/settings.
 *
 * Aplikujú sa NA SUBTOTAL (pred Špeciálnou zľavou). Nie na hidden
 * surcharge ani dopravu.
 */
export interface VolumeDiscountTier {
  min_m2: number;
  discount_pct: number;
  label: string;
}

export const VOLUME_DISCOUNT_TIERS: VolumeDiscountTier[] = [
  { min_m2: 0, discount_pct: 0, label: "Štandardná cena" },
  { min_m2: 100, discount_pct: 3, label: "Množstevná zľava 3% (od 100 m²)" },
  { min_m2: 300, discount_pct: 6, label: "Množstevná zľava 6% (od 300 m²)" },
  { min_m2: 500, discount_pct: 10, label: "Množstevná zľava 10% (od 500 m²)" },
  { min_m2: 1000, discount_pct: 15, label: "Množstevná zľava 15% (od 1000 m²)" },
];

/**
 * Vráti aktuálny tier pre danú plochu. Berie najvyšší tier ktorý m²
 * presahuje. Pri 250 m² → 100 m² tier (3%). Pri 500 m² → 500 m² tier (10%).
 */
export function getVolumeDiscountTier(m2: number): VolumeDiscountTier {
  let active = VOLUME_DISCOUNT_TIERS[0];
  for (const tier of VOLUME_DISCOUNT_TIERS) {
    if (m2 >= tier.min_m2) active = tier;
  }
  return active;
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
      // SOKEL — epoxidový sokel po obvode. User 2026-07-12: „daj obchodakovi
      // do specialnych operacii sokel na m2 aj s vyskou v cm, ked ho pridá
      // musí sa objaviť aj v postupe realizatora aj v inventure a v admine
      // možnosť nastavovať sadzbu".
      //
      // Cena = bm × cm × price_per_bm_per_cm.
      // Sadzba 1,20 €/bm/cm ≈ 12 €/bm pri štandardnej výške 10 cm.
      // Zdroj: Peto/Sika market rate 2025, konzultované s userom.
      // Sadzba je admin-editovateľná (app_settings.sokel_rate_per_bm_per_cm).
      id: `${floor_type}-sokel`,
      floor_type,
      name: "Sokel epoxidový (po obvode)",
      unit: "sokel",
      price_per_sqm: 0,
      price_per_bm_per_cm: 1.2,
      default_cm: 10,
      min_cm: 5,
      max_cm: 30,
      unit_label: "bm × cm",
      optional: true,
    },
    {
      // ZLOŽKA — obchodník KLIKNE na názov, premenuje ju (napr. "Doprava 200 km",
      // "Demontáž starej podlahy") + zadá sumu. Zobrazí sa na PDF/FA ako
      // samostatný riadok s tým názvom. Bez premenovania sa NEZAPOČÍTA — UI ju
      // vizuálne odlíši kým obchodník nezadá text.
      id: `${floor_type}-zlozka`,
      floor_type,
      name: "Zložka",
      unit: "surcharge",
      price_per_sqm: 0,
      unit_label: "€",
      optional: true,
      requires_label: true,
    },
    {
      // SKRYTÁ ZLOŽKA — manuálny markup ktorý obchodník pridá podľa situácie
      // (komplikovaný terén, ťažký zákazník, etc.). NIE JE viditeľná v PDF —
      // zákazník nevidí samostatný riadok, len sumu zarátanú v celkovej cene.
      id: `${floor_type}-zlozka-skryta`,
      floor_type,
      name: "Skrytá zložka",
      unit: "surcharge",
      price_per_sqm: 0,
      unit_label: "€ (skryté)",
      optional: true,
      hidden_in_pdf: true,
    },
  ];
}

export const MATERIALS: Material[] = [
  // ═══ JEDNOFAREBNÁ ════════════════════════════════════════════════════
  // Ceny prepočítané na 52 % maržu podľa OPRAVENÝCH SPOTRIEB (Sika TDS + Peto).
  // Zdroj cien: .epoxidovo-sika/CENNIK-MASTER.md
  //
  // OPRAVENÉ SPOTREBY (potvrdené Sika TDS + Peto zákazky):
  //   Sikafloor-01 Primer:    0,35 kg/m²  (Sika TDS 0,3–0,4)
  //   Sikafloor-150 Plus:     0,50 kg/m²  (Peto ES-24 penetrácia)
  //   Sikafloor-151:          0,50 kg/m²  (Sika TDS 0,4–0,6)  ← BOLO 0,35, oprava
  //   Sikafloor-264 Plus:     1,40 kg/m²  (Sika TDS 2 vrstvy) ← BOLO 1,50
  //   Sikafloor-3000:         1,30 kg/m²  (Sika TDS priemer)
  //   Sikafloor-3310 top:     0,20 kg/m²  (Sika TDS 0,15–0,25) ← BOLO 0,40, HRUBÁ CHYBA
  //   Sikafloor-304W Matt:    0,18 kg/m²  (Sika TDS 0,15–0,18)
  {
    id: "jednofarebna-uprava",
    floor_type: "jednofarebna",
    name: "Úprava povrchu (diamantové brúsenie)",
    unit: "area",
    price_per_sqm: 8, // kotúče 0,50 € + práca ~4 € = 4,50 náklad → 8 € (44 % marža)
    optional: false,
  },
  // Penetrácia — variant Epoxid (Sikafloor-01 Primer 3,24 €/kg × 0,35 = 1,13 náklad)
  {
    id: "jednofarebna-penetracia-epoxid",
    floor_type: "jednofarebna",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 12,
    optional: false,
    variant: "epoxid",
  },
  // Penetrácia — variant Polyuretán (Sikafloor-150 Plus 7,41 €/kg × 0,50 = 3,71 náklad)
  {
    id: "jednofarebna-penetracia-polyuretan",
    floor_type: "jednofarebna",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 12,
    optional: false,
    variant: "polyuretan",
  },
  // User 2026-07-14: „polyuretan davame za 77€ m2 total, epoxid 59€,
  // s lakom 66€". Rozloženie zachováva úpravu+penetráciu (8+12) a
  // upravuje farebný + lak.
  //
  // Epoxid total bez laku = 8 + 12 + 39 = 59 €/m² ✓
  // Epoxid total s lakom  = 8 + 12 + 39 + 7 = 66 €/m² ✓
  // Polyuretán total      = 8 + 12 + 47 + 10 = 77 €/m² ✓
  {
    id: "jednofarebna-farebny-epoxid",
    floor_type: "jednofarebna",
    name: "Farebný náter",
    unit: "area",
    price_per_sqm: 39,
    optional: false,
    variant: "epoxid",
  },
  {
    id: "jednofarebna-farebny-polyuretan",
    floor_type: "jednofarebna",
    name: "Farebný náter",
    unit: "area",
    price_per_sqm: 47,
    optional: false,
    variant: "polyuretan",
  },
  {
    id: "jednofarebna-lak-epoxid",
    floor_type: "jednofarebna",
    name: "Vrchný lak",
    unit: "area",
    price_per_sqm: 7,
    optional: false,
    default_enabled: false,
    variant: "epoxid",
  },
  {
    id: "jednofarebna-lak-polyuretan",
    floor_type: "jednofarebna",
    name: "Vrchný lak",
    unit: "area",
    price_per_sqm: 10,
    optional: false,
    default_enabled: true,
    variant: "polyuretan",
  },
  ...commonOptional("jednofarebna"),

  // ═══ CHIPSOVÁ ════════════════════════════════════════════════════════
  // Cieľ: 8 + 12 + 76 = 96 €/m² (52 % marža vs. reálny naklad ~46 €/m²)
  // Materiál: Sikafloor-01 primer + 264 Plus báza + chipsy + broadcast piesok
  // User 2026-07-14: „chipsova ma stat 50e m2". Total 6 + 8 + 36 = 50 €/m².
  // Rozdelenie zachováva pôvodný pomer krokov (brúsenie < penetrácia <
  // farebný s chipsmi).
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
    price_per_sqm: 8,
    optional: false,
  },
  {
    id: "chipsova-farebny",
    floor_type: "chipsova",
    name: "Farebný náter s chipsmi",
    unit: "area",
    price_per_sqm: 36,
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
  // Cieľ: 8 + 18 + 110 + 24 = 160 €/m² (52 % marža vs. reálny naklad ~77 €/m²)
  // Zdroj cien: Topstone faktúra 0000000352 (metalická podlaha 42,42 €/m² materiál)
  // User 2026-07-14: „metalicka 129€ m2". Total 8 + 18 + 79 + 24 = 129 €/m².
  {
    id: "metalicka-uprava",
    floor_type: "metalicka",
    name: "Úprava povrchu (diamantové brúsenie)",
    unit: "area",
    price_per_sqm: 8,
    optional: false,
  },
  {
    id: "metalicka-penetracia",
    floor_type: "metalicka",
    name: "Penetrácia",
    unit: "area",
    price_per_sqm: 18,
    optional: false,
  },
  {
    id: "metalicka-farebny",
    floor_type: "metalicka",
    name: "Farebný náter (metalická báza)",
    unit: "area",
    price_per_sqm: 79,
    optional: false,
  },
  {
    id: "metalicka-lak",
    floor_type: "metalicka",
    name: "Vrchný lak (UV stabilný)",
    unit: "area",
    price_per_sqm: 24,
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
  customLabel?: string,
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
  } else if (m.unit === "sokel") {
    // Sokel — m2 parameter = bm (bežné metre po obvode), mm parameter = cm výšky.
    // Cena = bm × cm × price_per_bm_per_cm (default 1,20 €/bm/cm).
    // cm clampnuté na [min_cm, max_cm].
    const cm = Math.max(m.min_cm ?? 5, Math.min(m.max_cm ?? 30, mm || (m.default_cm ?? 10)));
    mmEff = cm;
    total = qty * cm * (m.price_per_bm_per_cm ?? 1.2);
  } else {
    total = qty * m.price_per_sqm;
  }

  return {
    material_id: m.id,
    // Pomenovaná zložka → custom label od obchodníka (napr. "Doprava 200 km").
    // Bez labelu padne na default name materiálu.
    material_name: customLabel?.trim() || m.name,
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
