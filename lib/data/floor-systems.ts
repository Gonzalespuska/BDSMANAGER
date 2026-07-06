/**
 * Katalóg systémov podláh — každý systém = presná skladba vrstvích + spotreba
 * materiálu v kg/m². Používa sa v /realizacie/[id]/plan?view=sklad na
 * automatický výpočet: koľko kusov / balení potrebuje realizator vziať zo skladu.
 *
 * Spotreby sú OSTRE — bez rezervy. Reálne vzatie zaokrúhľujeme cez ceil()
 * podľa balenia (napr. 45kg spotreby ÷ 25kg vrece = 1.8 → 2 vrecia).
 */

import type { SikaProduct } from "./sika-products";
import { SIKA_PRODUCTS } from "./sika-products";

export type CoatStage =
  | "primer"        // 1. penetrácia
  | "level"         // samonivelačka
  | "base"          // farebná báza
  | "top"           // vrchná farba
  | "lak"           // vrchný lak
  | "chipsy"        // dekoratívne chipsy
  | "silica";       // kremičitý piesok

export interface SystemMaterial {
  sap_number: string;
  name: string;
  packaging: string;
  packaging_kg: number;         // kg alebo l v jednom balení
  consumption_per_m2: number;   // spotreba (kg/m² pre kg, l/m² pre kvapaliny)
  coat: CoatStage;
  optional?: boolean;
}

export interface FloorSystem {
  id: string;
  label: string;                 // Ľudský názov "Chipsová garáž (264 + chipsy + lak)"
  floor_type: "jednofarebna" | "chipsova" | "mramorova" | "metalicka";
  variant?: "epoxid" | "polyuretan";
  description: string;
  suitable_for: string[];        // ["Garáž", "Dielňa", ...]
  materials: SystemMaterial[];
}

// Helper — nájde katalógový produkt podľa SAP, extrahuje packaging.
function sika(sap: string): { name: string; packaging: string; kg: number } {
  const p = SIKA_PRODUCTS.find((x) => x.sap_number === sap);
  if (!p) return { name: `SAP ${sap}`, packaging: "—", kg: 25 };
  // Parse packaging "25 kg vrece" → 25
  const match = p.packaging.match(/([\d.,]+)\s*(kg|ml|l)/i);
  const kg = match ? parseFloat(match[1].replace(",", ".")) : 25;
  return { name: p.name, packaging: p.packaging, kg };
}

function mat(sap: string, consumption: number, coat: CoatStage, optional?: boolean): SystemMaterial {
  const s = sika(sap);
  return {
    sap_number: sap,
    name: s.name,
    packaging: s.packaging,
    packaging_kg: s.kg,
    consumption_per_m2: consumption,
    coat,
    optional,
  };
}

export const FLOOR_SYSTEMS: FloorSystem[] = [
  // ══ JEDNOFAREBNÁ — EPOXID (Sikafloor-264) ══════════════════════════════
  {
    id: "jednofarebna-epoxid-264",
    label: "Jednofarebná epoxidová (Sikafloor-264)",
    floor_type: "jednofarebna",
    variant: "epoxid",
    description: "Klasická jednofarebná epoxidová podlaha bez laku (264 je sám o sebe finál).",
    suitable_for: ["Garáž", "Dielňa", "Sklad", "Pivnica"],
    materials: [
      mat("498421", 0.35, "primer"),   // Sikafloor-01 Primer  10 kg
      mat("489218", 1.5, "top"),        // Sikafloor-264 sivý  22 kg
    ],
  },

  // ══ JEDNOFAREBNÁ — POLYURETÁN (3000FX + lak) ═══════════════════════════
  {
    id: "jednofarebna-pu",
    label: "Jednofarebná polyuretánová (3000FX + lak)",
    floor_type: "jednofarebna",
    variant: "polyuretan",
    description: "PU systém — vyššia odolnosť. Sikafloor-3000FX ako farebný poter + vrchný Sikafloor-304W Matt lak.",
    suitable_for: ["Obývačka", "Kúpeľňa", "Interiér", "Terasa"],
    materials: [
      mat("498434", 0.35, "primer"),   // Sikafloor-03 Primer  10 kg
      mat("558772", 1.2, "base"),       // Sikafloor-3000FX Amberish 20 kg
      mat("717545", 0.18, "lak"),       // Sikafloor-304W Matt 7.5 kg
    ],
  },

  // ══ CHIPSOVÁ GARÁŽ (264 + chipsy + lak) ═══════════════════════════════
  {
    id: "chipsova-garaz",
    label: "Chipsová garáž (264 + chipsy + lak)",
    floor_type: "chipsova",
    description: "Farebná báza + rozsyp chipsov + vrchný lak. Klasika pre garáže.",
    suitable_for: ["Garáž", "Garáž — 2 autá", "Dielňa"],
    materials: [
      mat("498421", 0.35, "primer"),   // Sikafloor-01 Primer 10 kg
      mat("489217", 1.5, "base"),       // Sikafloor-264 farebný 22 kg
      mat("180050", 0.05, "chipsy"),    // Chipsy Grey Mix 5 kg (spotreba veľmi malá)
      mat("717545", 0.18, "lak"),       // Sikafloor-304W Matt 7.5 kg
    ],
  },

  // ══ MRAMOROVÁ (Level-30 + Topstone-like báza) ═════════════════════════
  {
    id: "mramorova",
    label: "Mramorová (Level-30 + epoxid + lak)",
    floor_type: "mramorova",
    description: "Samonivelačka + mramorový epoxid + vrchný lak. Vyžaduje presnú aplikáciu.",
    suitable_for: ["Kúpeľňa", "Kuchyňa", "Interiér", "Obývačka"],
    materials: [
      mat("498421", 0.35, "primer"),   // Sikafloor-01 Primer 10 kg
      mat("162680", 4.2, "level"),      // Level-30 25kg vrece — 2.5mm ≈ 4.2 kg/m²/mm × 1
      mat("489217", 2.5, "base"),       // Farebný epoxid — hrubšia vrstva
      mat("717545", 0.2, "lak"),        // Sikafloor-304W Gloss 7.5 kg
    ],
  },

  // ══ METALICKÁ (3000FX metalická + lak) ════════════════════════════════
  {
    id: "metalicka",
    label: "Metalická (3000FX metalická + EP22 Plus lak)",
    floor_type: "metalicka",
    description: "Metalická báza s efektom perleti + vrchný lak. Náročná aplikácia.",
    suitable_for: ["Obývačka", "Kúpeľňa", "Interiér", "Exkluzívny priestor"],
    materials: [
      mat("498434", 0.35, "primer"),   // Sikafloor-03 Primer 10 kg
      mat("558774", 1.3, "base"),       // Sikafloor-3000FX Silver 20 kg
      mat("717546", 0.22, "lak"),       // Sikafloor-304W Gloss 7.5 kg
    ],
  },
];

/**
 * Vypočíta koľko balení treba zobrať zo skladu pre danú plochu.
 * Zaokrúhli hore — nechceme vybehnúť za mm od cieľa.
 */
export interface CalculatedItem {
  sap_number: string;
  name: string;
  packaging: string;
  needed_kg: number;
  packages: number;      // koľko balení treba vziať (ceil)
  coat: CoatStage;
}

export function calcSystemForArea(
  system: FloorSystem,
  areaM2: number,
): CalculatedItem[] {
  return system.materials.map((m) => {
    const needed_kg = m.consumption_per_m2 * areaM2;
    const packages = Math.max(1, Math.ceil(needed_kg / m.packaging_kg));
    return {
      sap_number: m.sap_number,
      name: m.name,
      packaging: m.packaging,
      needed_kg: Math.round(needed_kg * 100) / 100,
      packages,
      coat: m.coat,
    };
  });
}

export const COAT_LABELS: Record<CoatStage, string> = {
  primer: "🎨 Primer",
  level: "📏 Nivelačka",
  base: "🎨 Farebná báza",
  top: "🎨 Vrchná farba",
  lak: "✨ Vrchný lak",
  chipsy: "🎨 Chipsy",
  silica: "🪨 Piesok",
};
