/**
 * Definícia systémov podľa typu podlahy — obchodák si po obhliadke vyberie
 * konkrétny systém, na základe ktorého sa auto-vypočíta inventúra pre
 * realizatora.
 *
 * User (2026-07-11):
 *   "chipsova = 264 alebo 1590
 *    jednofarebne epoxidy = 264, 1590
 *    jednofarebne polyuretany = 3000, 3000fx, 3310
 *    mramor a metalika = TopStopne METALIC iba"
 */

export type FloorType =
  | "jednofarebna"
  | "chipsova"
  | "metalicka"
  | "mramorova";

export type Binder = "epoxid" | "polyuretan";

export interface SystemCode {
  code: string;
  label: string;
  binder?: Binder;
  description: string;
}

/**
 * Vráti dostupné systémy pre daný typ + binder.
 * Pre jednofarebnu sa musí prepnúť binder (epoxid vs polyuretan) —
 * pre ostatné sa binder ignoruje (chipsova/mramor/metalika je fixná).
 */
export function systemsFor(
  type: FloorType,
  binder?: Binder | null,
): SystemCode[] {
  switch (type) {
    case "chipsova":
      return [
        { code: "264", label: "Sikafloor 264", description: "Epoxid, univerzálny 2K" },
        {
          code: "1590",
          label: "Sikafloor 1590 (Fastfloor)",
          description: "Epoxid rýchlo tvrdnúci",
        },
      ];
    case "jednofarebna":
      if (binder === "polyuretan") {
        return [
          {
            code: "3000",
            label: "Sikafloor 3000",
            binder: "polyuretan",
            description: "Elastický polyuretán",
          },
          {
            code: "3000fx",
            label: "Sikafloor 3000 FX",
            binder: "polyuretan",
            description: "Rýchle vytvrdenie",
          },
          {
            code: "3310",
            label: "Sikafloor 3310",
            binder: "polyuretan",
            description: "Zvýšená mechanická odolnosť",
          },
        ];
      }
      // Default = epoxid
      return [
        {
          code: "264",
          label: "Sikafloor 264",
          binder: "epoxid",
          description: "Epoxid, univerzálny 2K",
        },
        {
          code: "1590",
          label: "Sikafloor 1590 (Fastfloor)",
          binder: "epoxid",
          description: "Epoxid rýchlo tvrdnúci",
        },
      ];
    case "mramorova":
    case "metalicka":
      return [
        {
          code: "topstopne",
          label: "TopStopne METALIC",
          description: "Metalický dekoratívny systém",
        },
      ];
  }
}

/**
 * Kalkulácia inventúry — na základe zvoleného systému + m² vráti zoznam
 * materiálu/nástrojov ktoré má realizator zobrať zo skladu.
 *
 * Aproximácie spotreby (zaokrúhlené hore):
 *   Primer 151:     0.30 kg/m² → 10kg vedro na ~33 m²
 *   Sikafloor 264:  1.50 kg/m² → 30kg sud na 20 m²
 *   Sikafloor 1590: 1.50 kg/m² → 30kg sud na 20 m²
 *   Sikafloor 3000/fx/3310: 1.20 kg/m² → 21kg sud na ~17 m²
 *   Chipsy Sika Coloured (chipsová): 0.10 kg/m² → 20kg vrece na 200 m²
 *   TopStopne METALIC pigment: 0.15 kg/m² → 1kg vedierko na ~6 m²
 *   Vrchný lak 304W (final): 0.30 kg/m² → 7.5kg sud na 25 m²
 */
export interface InventoryLine {
  sku: string;
  label: string;
  qty: number;
  /** Ľudský typ obalu (sud/vedro/vrece) — používame ako fallback. */
  unit: string;
  /** Veľkosť balenia v kg — zobrazuje sa v "Balenie" stĺpci ako "10 kg". */
  unit_size_kg?: number;
  note?: string;
}

export function calcInventory(
  systemCode: string,
  m2: number,
): InventoryLine[] {
  const lines: InventoryLine[] = [];
  const push = (l: InventoryLine) => lines.push(l);
  const round = (n: number) => Math.ceil(n);

  // Primer 151 — pri všetkých okrem topstopne (ten má vlastný primer)
  if (systemCode !== "topstopne") {
    push({
      sku: "SIKAFLOOR-151",
      label: "Sikafloor-151 Primer",
      qty: round(m2 / 33),
      unit: "vedro",
      unit_size_kg: 10,
      note: `spotreba 0.30 kg/m² · vedro 10 kg na ~33 m²`,
    });
  }

  switch (systemCode) {
    case "264":
      push({
        sku: "SIKAFLOOR-264-30",
        label: "Sikafloor-264 (2K epoxid)",
        qty: round(m2 / 20),
        unit: "sud",
        unit_size_kg: 30,
        note: `spotreba 1.5 kg/m² · sud 30 kg na 20 m²`,
      });
      break;
    case "1590":
      push({
        sku: "SIKAFLOOR-1590-30",
        label: "Sikafloor-1590 (Fastfloor)",
        qty: round(m2 / 20),
        unit: "sud",
        unit_size_kg: 30,
        note: `spotreba 1.5 kg/m² · sud 30 kg na 20 m²`,
      });
      break;
    case "3000":
      push({
        sku: "SIKAFLOOR-3000-21",
        label: "Sikafloor-3000 (polyuretán)",
        qty: round(m2 / 17),
        unit: "sud",
        unit_size_kg: 21,
        note: `spotreba 1.2 kg/m² · sud 21 kg na ~17 m²`,
      });
      break;
    case "3000fx":
      push({
        sku: "SIKAFLOOR-3000FX-21",
        label: "Sikafloor-3000 FX (rýchly)",
        qty: round(m2 / 17),
        unit: "sud",
        unit_size_kg: 21,
        note: `spotreba 1.2 kg/m² · sud 21 kg na ~17 m²`,
      });
      break;
    case "3310":
      push({
        sku: "SIKAFLOOR-3310-21",
        label: "Sikafloor-3310 (odolný)",
        qty: round(m2 / 17),
        unit: "sud",
        unit_size_kg: 21,
        note: `spotreba 1.2 kg/m² · sud 21 kg na ~17 m²`,
      });
      break;
    case "topstopne":
      push({
        sku: "TOPSTOPNE-METALIC",
        label: "TopStopne METALIC pigment",
        qty: round(m2 / 6),
        unit: "vedierko",
        unit_size_kg: 1,
        note: `spotreba 0.15 kg/m² · vedierko 1 kg na ~6 m²`,
      });
      break;
  }

  // Finálny lak — 304W (transparent) pre všetky systémy okrem topstopne
  if (systemCode !== "topstopne") {
    push({
      sku: "SIKAFLOOR-304W-7.5",
      label: "Sikafloor-304W Matt (vrchný lak)",
      qty: round(m2 / 25),
      unit: "sud",
      unit_size_kg: 7.5,
      note: `spotreba 0.30 kg/m² · sud 7.5 kg na 25 m²`,
    });
  }

  return lines;
}

/**
 * Fixný zoznam náradia + spotrebného materiálu — pre každú realizáciu
 * bez ohľadu na systém. Realizator si na začiatku ide „inventúry"
 * zaškrtne či všetko má.
 */
export const FIXED_TOOLS: string[] = [
  "Stierka",
  "Valčeky",
  "Nástroj na valček (držiak)",
  "Ježko (odvzdušňovací)",
  "Spike shoes",
  "Stellmit (nástroj)",
  "Kremičitý piesok",
  "Páska kobercová",
  "Vrecia na smeti 120L",
  "Fólia na kraje / prekrytie",
  "Vysávač + nástavce",
  "Brúska Hilti / veľká",
  "Brúska trojuholník",
  "Brúska prenosná + malý vysávač",
  "Sprej na muchy a hmyz",
  "Páska papierová",
];
