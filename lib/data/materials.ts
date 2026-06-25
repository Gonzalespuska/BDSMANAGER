/**
 * Katalóg materiálov a operácií pre Generátor ponúk.
 *
 * Phase 1: hardcoded zo špecifikácie + epoxidovo.sk ponuky (príkladové sadzby).
 * Phase 2: presunúť do DB (tabuľka `materials`) → admin editor v /admin/materials.
 *
 * Cenový model:
 *   - kg potrebné = consumption_kg_per_sqm × m²  (alebo × m² × mm pri "level")
 *   - balenia    = pri zlievateľnom: kg_potrebné / package_size  (decimálne)
 *                   pri nezlievateľnom: ceil(kg_potrebné / package_size)
 *   - cena materiálu = balenia × package_price
 *   - cena práce  = m² × work_per_sqm
 *   - výsledná cena riadku = materiál + práca
 *
 * 4 typy podlahy zo stránky epoxidovo.sk:
 *   - jednofarebna ,pigmentový epoxid, najjednoduchšia
 *   - chipsova     ,dekoratívne chipsy v transparent laku
 *   - mramorova    ,mramorový efekt 2 farby (nezlievateľný)
 *   - metalicka    ,metalické pigmenty (nezlievateľný)
 */

export type FloorType =
  | "jednofarebna"
  | "chipsova"
  | "mramorova"
  | "metalicka";

export type MaterialUnit = "area" | "level";

export interface Material {
  id: string;
  floor_type: FloorType;
  name: string;
  unit: MaterialUnit;
  consumption_kg_per_sqm: number;
  package_size_kg: number;
  package_price: number;
  work_per_sqm: number;
  poolable: boolean;
  optional: boolean;
}

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

// Spoločné prep operácie pre všetky 4 typy
function commonPrep(floor_type: FloorType): Material[] {
  return [
    {
      id: `${floor_type}-priprava`,
      floor_type,
      name: "Príprava (diamantové brúsenie)",
      unit: "area",
      consumption_kg_per_sqm: 0,
      package_size_kg: 0,
      package_price: 0,
      work_per_sqm: 9,
      poolable: true,
      optional: false,
    },
    {
      id: `${floor_type}-penetracia`,
      floor_type,
      name: "Penetrácia",
      unit: "area",
      consumption_kg_per_sqm: 0.3,
      package_size_kg: 10,
      package_price: 75,
      work_per_sqm: 4,
      poolable: true,
      optional: false,
    },
    {
      id: `${floor_type}-nivelacia`,
      floor_type,
      name: "Nivelácia (samonivelizačná stierka)",
      unit: "level",
      consumption_kg_per_sqm: 1.6,
      package_size_kg: 25,
      package_price: 30,
      work_per_sqm: 5,
      poolable: true,
      optional: true,
    },
  ];
}

export const MATERIALS: Material[] = [
  // ═══ JEDNOFAREBNÁ ════════════════════════════════════════════════════
  ...commonPrep("jednofarebna"),
  {
    id: "jednofarebna-pigmentovy-epoxid",
    floor_type: "jednofarebna",
    name: "Pigmentovaný epoxid (jednofarebný)",
    unit: "area",
    consumption_kg_per_sqm: 1.5,
    package_size_kg: 20,
    package_price: 450,
    work_per_sqm: 15,
    poolable: true,
    optional: false,
  },
  {
    id: "jednofarebna-lak",
    floor_type: "jednofarebna",
    name: "Vrchný lak",
    unit: "area",
    consumption_kg_per_sqm: 0.15,
    package_size_kg: 5,
    package_price: 80,
    work_per_sqm: 8,
    poolable: true,
    optional: false,
  },

  // ═══ CHIPSOVÁ ════════════════════════════════════════════════════════
  ...commonPrep("chipsova"),
  {
    id: "chipsova-zaklad",
    floor_type: "chipsova",
    name: "Základný náter (color base)",
    unit: "area",
    consumption_kg_per_sqm: 0.4,
    package_size_kg: 10,
    package_price: 90,
    work_per_sqm: 6,
    poolable: true,
    optional: false,
  },
  {
    id: "chipsova-chipsy",
    floor_type: "chipsova",
    name: "Chipsy (PVC flakes),aplikácia",
    unit: "area",
    consumption_kg_per_sqm: 0.3,
    package_size_kg: 5,
    package_price: 45,
    work_per_sqm: 10,
    poolable: true,
    optional: false,
  },
  {
    id: "chipsova-clear-coat",
    floor_type: "chipsova",
    name: "Vrchný lak (clear coat,uzamkne chipsy)",
    unit: "area",
    consumption_kg_per_sqm: 0.4,
    package_size_kg: 5,
    package_price: 80,
    work_per_sqm: 8,
    poolable: true,
    optional: false,
  },

  // ═══ MRAMOROVÁ ═══════════════════════════════════════════════════════
  ...commonPrep("mramorova"),
  {
    id: "mramorova-epoxid",
    floor_type: "mramorova",
    name: "Mramorový epoxid (2 farby)",
    unit: "area",
    consumption_kg_per_sqm: 1.8,
    package_size_kg: 20,
    package_price: 720,
    work_per_sqm: 35,
    poolable: false, // NEZLIEVATEĽNÝ
    optional: false,
  },
  {
    id: "mramorova-lak",
    floor_type: "mramorova",
    name: "Vrchný high-gloss lak",
    unit: "area",
    consumption_kg_per_sqm: 0.15,
    package_size_kg: 5,
    package_price: 90,
    work_per_sqm: 8,
    poolable: true,
    optional: false,
  },

  // ═══ METALICKÁ ═══════════════════════════════════════════════════════
  ...commonPrep("metalicka"),
  {
    id: "metalicka-zaklad",
    floor_type: "metalicka",
    name: "Základný náter (tmavý)",
    unit: "area",
    consumption_kg_per_sqm: 0.4,
    package_size_kg: 10,
    package_price: 90,
    work_per_sqm: 6,
    poolable: true,
    optional: false,
  },
  {
    id: "metalicka-pigment",
    floor_type: "metalicka",
    name: "Metalický pigmentový epoxid",
    unit: "area",
    consumption_kg_per_sqm: 1.5,
    package_size_kg: 20,
    package_price: 600,
    work_per_sqm: 18,
    poolable: false, // NEZLIEVATEĽNÝ
    optional: false,
  },
  {
    id: "metalicka-pu-lak",
    floor_type: "metalicka",
    name: "Vrchný PU lak lesklý",
    unit: "area",
    consumption_kg_per_sqm: 0.15,
    package_size_kg: 5,
    package_price: 80,
    work_per_sqm: 8,
    poolable: true,
    optional: false,
  },
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
  material_cost: number;
  work_cost: number;
  total: number;
}

export function calcLine(
  m: Material,
  m2: number,
  mm: number,
  poolableOverride?: boolean,
): QuoteLineCalc {
  const poolable = poolableOverride ?? m.poolable;
  const kg_needed =
    m.unit === "level"
      ? m.consumption_kg_per_sqm * m2 * mm
      : m.consumption_kg_per_sqm * m2;

  let packages = 0;
  let material_cost = 0;
  if (m.package_size_kg > 0 && kg_needed > 0) {
    if (poolable) {
      packages = kg_needed / m.package_size_kg;
      material_cost = kg_needed * (m.package_price / m.package_size_kg);
    } else {
      packages = Math.ceil(kg_needed / m.package_size_kg);
      material_cost = packages * m.package_price;
    }
  }

  const work_cost = m2 * m.work_per_sqm;
  const total = material_cost + work_cost;

  return {
    material_id: m.id,
    material_name: m.name,
    m2,
    mm,
    poolable,
    kg_needed,
    packages,
    material_cost,
    work_cost,
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
