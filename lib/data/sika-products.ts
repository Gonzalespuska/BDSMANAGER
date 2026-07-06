/**
 * Katalóg Sika produktov — SAP čísla + balenia pre generovanie objednávok
 * materiálu. Základ pre /admin/objednavky.
 *
 * Odvodené z reálnych objednávok Epoxidovo (Sikafloor rada + niekoľko
 * bežných doplnkových). Admin môže pridávať vlastné cez UI (ad-hoc).
 */

export interface SikaProduct {
  sap_number: string;
  name: string;
  packaging: string;
  category?: "primer" | "level" | "system" | "topcoat" | "silica" | "other";
}

export const SIKA_PRODUCTS: SikaProduct[] = [
  // ── Primers ─────────────────────────────────────────────────
  { sap_number: "498421", name: "Sikafloor-01 Primer Ka 10KG", packaging: "10 kg", category: "primer" },
  { sap_number: "498434", name: "Sikafloor-03 Primer Ka 10KG", packaging: "10 kg", category: "primer" },
  { sap_number: "498456", name: "Sikafloor-156 A Ka 10KG", packaging: "10 kg", category: "primer" },
  { sap_number: "498457", name: "Sikafloor-156 B Ka 5KG", packaging: "5 kg", category: "primer" },
  { sap_number: "498512", name: "Sikafloor-161 A Ka 25KG", packaging: "25 kg", category: "primer" },
  { sap_number: "498513", name: "Sikafloor-161 B Ka 5KG", packaging: "5 kg", category: "primer" },

  // ── Level / samonivelačky ───────────────────────────────────
  { sap_number: "162680", name: "Sikafloor Level-30 Bg 25KG", packaging: "25 kg vrece", category: "level" },
  { sap_number: "162681", name: "Sikafloor Level-25 Bg 25KG", packaging: "25 kg vrece", category: "level" },
  { sap_number: "162682", name: "Sikafloor Level-Pro Bg 25KG", packaging: "25 kg vrece", category: "level" },

  // ── Systémy 3000FX (metalický) ──────────────────────────────
  { sap_number: "558772", name: "Sikafloor-3000FX (AB) Amberish Grey 20KG", packaging: "20 kg", category: "system" },
  { sap_number: "558773", name: "Sikafloor-3000FX (AB) Blue Sky 20KG", packaging: "20 kg", category: "system" },
  { sap_number: "558774", name: "Sikafloor-3000FX (AB) Silver 20KG", packaging: "20 kg", category: "system" },
  { sap_number: "558775", name: "Sikafloor-3000FX (AB) Copper 20KG", packaging: "20 kg", category: "system" },
  { sap_number: "558776", name: "Sikafloor-3000FX (AB) Gold 20KG", packaging: "20 kg", category: "system" },

  // ── Vrchné laky ─────────────────────────────────────────────
  { sap_number: "717545", name: "Sikafloor-304W Matt (AB) 7,5KG", packaging: "7,5 kg", category: "topcoat" },
  { sap_number: "717546", name: "Sikafloor-304W Gloss (AB) 7,5KG", packaging: "7,5 kg", category: "topcoat" },
  { sap_number: "717550", name: "Sikafloor-305W Matt (AB) 7,5KG", packaging: "7,5 kg", category: "topcoat" },
  { sap_number: "717551", name: "Sikafloor-305W Gloss (AB) 7,5KG", packaging: "7,5 kg", category: "topcoat" },
  { sap_number: "489217", name: "Sikafloor-264 (AB) Farebný 22KG", packaging: "22 kg", category: "system" },
  { sap_number: "489218", name: "Sikafloor-264 (AB) Sivý 22KG", packaging: "22 kg", category: "system" },

  // ── Sikadur / Sikadur — praskliny, spoje ────────────────────
  { sap_number: "302051", name: "Sikadur-31 CF Normal 6KG", packaging: "6 kg", category: "other" },
  { sap_number: "302052", name: "Sikadur-52 Injection Normal 5KG", packaging: "5 kg", category: "other" },
  { sap_number: "302053", name: "Sikaflex PRO-3 600ML", packaging: "600 ml", category: "other" },

  // ── Kremičitý piesok (pre šmykové vrstvy) ───────────────────
  { sap_number: "180001", name: "Kremičitý piesok 0,4-0,8 mm 25KG", packaging: "25 kg", category: "silica" },
  { sap_number: "180002", name: "Kremičitý piesok 0,7-1,2 mm 25KG", packaging: "25 kg", category: "silica" },

  // ── Chipsy ──────────────────────────────────────────────────
  { sap_number: "180050", name: "Sikafloor Chipsy Grey Mix 5KG", packaging: "5 kg", category: "other" },
  { sap_number: "180051", name: "Sikafloor Chipsy Beige Mix 5KG", packaging: "5 kg", category: "other" },
  { sap_number: "180052", name: "Sikafloor Chipsy Black Mix 5KG", packaging: "5 kg", category: "other" },
];

export const SIKA_CATEGORY_LABELS: Record<string, string> = {
  primer: "🎨 Primer",
  level: "📏 Nivelačka",
  system: "🎨 Systém",
  topcoat: "✨ Vrchný lak",
  silica: "🪨 Piesok",
  other: "📦 Iné",
};
