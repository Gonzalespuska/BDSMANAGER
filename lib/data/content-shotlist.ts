/**
 * Content shotlist — realizator ako "field reporter".
 *
 * User (2026-07-11):
 *   "chcem si z realizatorov spravit aj generator kontentu dam im
 *    instruckie ako chcem aby to bolo natocene a budu to fotit tocit
 *    aby som mal na storky a nejake denne formaty pred to nejake super
 *    kvalitne video im nedam urobit … pred robotov urobia co im poviem
 *    ake videa, v priebehu roboty, a po robote".
 *
 * 3 fázy zákazky × špecifický shot per fáza:
 *   pred → wide + close-up + selfie
 *   pocas → key movement shots (dust, mixing, application) + typ-specific
 *   po → after wide (same angle) + close-up + team selfie + client
 *
 * Každý shot má:
 *   - id (unique, používa sa v content_captures.shot_id)
 *   - title
 *   - description (ako natočiť)
 *   - tips (bullet points)
 *   - orientation (portrait pre stories / landscape pre yt)
 *   - duration_sec (odhad)
 *   - required (blokuje zákazku ako hotovú?)
 *   - floor_types (undefined = pre všetky, ["chipsova"] = iba pre chipsy)
 */

export type ShotPhase = "pred" | "pocas" | "po";
export type ShotOrientation = "portrait" | "landscape" | "any";
export type ShotKind = "photo" | "video";
export type FloorTypeFilter = "jednofarebna" | "chipsova" | "mramorova" | "metalicka";

export interface ContentShot {
  id: string;
  phase: ShotPhase;
  title: string;
  description: string;
  tips: string[];
  orientation: ShotOrientation;
  kind: ShotKind;
  duration_sec?: number;
  required?: boolean;
  floor_types?: FloorTypeFilter[];
  icon: string;
}

export const CONTENT_SHOTS: ContentShot[] = [
  // ═══════════════════ PRED PRÁCOU ═══════════════════
  {
    id: "pred-wide",
    phase: "pred",
    title: "Wide shot priestoru",
    description: "Celá miestnosť z jedného rohu — pred kým sa niečo urobí.",
    tips: [
      "Telefón NA VÝŠKU (9:16) — ide na Instagram Stories",
      "Zapaľ všetky svetlá, aby bol priestor jasný",
      "Uhol z rohu, aby bolo vidno celú plochu",
      "Pomaly panorámuj (2 sekundy) — nie prudko",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 5,
    required: true,
    icon: "🎬",
  },
  {
    id: "pred-detail",
    phase: "pred",
    title: "Close-up podlahy",
    description: "Detail súčasného stavu — praskliny, škvrny, textúra.",
    tips: [
      "Blízko — 20 cm od podlahy",
      "Ostrý fókus, dobré svetlo",
      "Zaznamenať to najhoršie miesto (before/after kontrast!)",
    ],
    orientation: "any",
    kind: "photo",
    required: true,
    icon: "🔍",
  },
  {
    id: "pred-selfie",
    phase: "pred",
    title: "Selfie tímu",
    description: "10 sec video s pozdravmi.",
    tips: [
      "Napr. Ahoj! Dnes robíme podlahu u [meno klienta] v [mesto]",
      "Krátko: kto ste, čo idete robiť, aký typ podlahy",
      "Usmievajte sa — energia sa cíti",
      "Portrait mode, ruka stabilná",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 10,
    icon: "🤳",
  },

  // ═══════════════════ POČAS PRÁCE ═══════════════════
  {
    id: "pocas-brusenie",
    phase: "pocas",
    title: "Brúsenie",
    description: "15 sec timelapse alebo bočný shot — prach lieta, drama.",
    tips: [
      "Bočný uhol (nie zhora)",
      "Nechať brúsku prejsť cez záber — dynamika",
      "Portrait 9:16 pre stories",
      "Ak máš helmicu s kamerou / GoPro, super",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 15,
    required: true,
    icon: "🌪",
  },
  {
    id: "pocas-mixing",
    phase: "pocas",
    title: "Miešanie farby / živice",
    description: "Cinematic close-up — hustá tekutina, valí sa.",
    tips: [
      "Blízko, priamo nad kýblom",
      "Zachytiť ako sa farba mieša — vír / textúra",
      "5-10 sekúnd stačí",
      "Odhliadnutý focus (na živicu, nie na ruku)",
    ],
    orientation: "any",
    kind: "video",
    duration_sec: 8,
    icon: "🧪",
  },
  {
    id: "pocas-penetracia",
    phase: "pocas",
    title: "Nanášanie penetrácie",
    description: "Bočný low-angle shot — valček ide po zemi.",
    tips: [
      "Kamera nízko pri zemi, uhol šikmo",
      "Sleduj valček ako sa hýbe",
      "Portrait pre stories",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 10,
    icon: "🖌",
  },
  {
    id: "pocas-farebna",
    phase: "pocas",
    title: "Aplikácia farebnej vrstvy",
    description: "Pomaly, čerstvá tekutina sa rozlieva — money shot.",
    tips: [
      "Odzhora, ako sa farebná vrstva rozlieva",
      "Nechajte 10-15 sekúnd bez rezov",
      "Ak sú vidno 2 farby (2K epoxid), ešte lepšie",
    ],
    orientation: "any",
    kind: "video",
    duration_sec: 12,
    required: true,
    icon: "🎨",
  },

  // Typ-specific počas
  {
    id: "pocas-chipsy",
    phase: "pocas",
    title: "Hádzanie chipsov 🌈",
    description: "NAJLEPŠÍ shot celej realizácie — chipsy letia do čerstvej vrstvy.",
    tips: [
      "Slow-motion ak vieš (iPhone: Slo-mo mode)",
      "Bočný pohľad",
      "Portrait 9:16 pre stories",
      "15 sekúnd stačí — chipsy vo vzduchu = viral content",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 15,
    required: true,
    floor_types: ["chipsova"],
    icon: "🌈",
  },
  {
    id: "pocas-mramor",
    phase: "pocas",
    title: "Tvorba mramorových žíl",
    description: "Ako sa vytvárajú žilkovania — high-value shot.",
    tips: [
      "Zoom na jedno miesto kde vytváraš žilky",
      "Ukázať pohyb valčeka / špachte",
      "Cinematic — pomaly, blízko",
      "15-20 sekúnd",
    ],
    orientation: "any",
    kind: "video",
    duration_sec: 18,
    required: true,
    floor_types: ["mramorova"],
    icon: "🌊",
  },
  {
    id: "pocas-metal",
    phase: "pocas",
    title: "Metalický efekt — troelovanie",
    description: "Vytváranie efektu s kovovým leskom.",
    tips: [
      "Zachytiť lesk (dobré svetlo!)",
      "Slow pans — pomalý pohyb kamery",
      "Ukázať ako svetlo reaguje na povrch",
      "15 sekúnd",
    ],
    orientation: "any",
    kind: "video",
    duration_sec: 15,
    required: true,
    floor_types: ["metalicka"],
    icon: "✨",
  },

  // ═══════════════════ PO PRÁCI ═══════════════════
  {
    id: "po-wide",
    phase: "po",
    title: "After wide shot (same angle ako Pred!)",
    description: "Ten istý roh, ten istý uhol ako pred — before/after reveal.",
    tips: [
      "DÔLEŽITÉ: identický uhol ako pri wide shot pred prácou",
      "Rovnaké svetlo (zapal svetlá)",
      "Portrait 9:16",
      "5-10 sekúnd — pomalý pan",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 8,
    required: true,
    icon: "🎬",
  },
  {
    id: "po-detail",
    phase: "po",
    title: "Detail hotovej podlahy",
    description: "Close-up finálneho povrchu — lesk, textúra.",
    tips: [
      "Svetlo v odraze — pod uhlom, aby bol vidno lesk",
      "Blízko (20 cm)",
      "Zaostri na povrch, ostrý fókus",
    ],
    orientation: "any",
    kind: "photo",
    required: true,
    icon: "💎",
  },
  {
    id: "po-selfie",
    phase: "po",
    title: "Selfie tímu s hotovkou",
    description: "Napr. Za jeden deň hotovo 💪",
    tips: [
      "Všetci členovia tímu",
      "Podlaha v pozadí (očividne hotová)",
      "10 sec video s krátkym feedbackom",
      "Usmievajte sa — energia sa cíti",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 10,
    icon: "🤳",
  },
  {
    id: "po-klient",
    phase: "po",
    title: "Klient reakcia (LEN ak súhlasí!)",
    description: "Najhodnotnejší content — real customer reaction.",
    tips: [
      "OPÝTAJ SA vopred: Môžem vás krátko natočiť?",
      "Ak nie → preskoč, žiadny tlak",
      "Ak áno: napr. Ako sa vám podlaha páči? — 15 sec",
      "Portrait 9:16",
    ],
    orientation: "portrait",
    kind: "video",
    duration_sec: 15,
    icon: "👤",
  },
];

/** Vráti shots relevantné pre daný typ podlahy. */
export function getShotsForFloorType(
  floorType: FloorTypeFilter | null,
): ContentShot[] {
  return CONTENT_SHOTS.filter((s) => {
    if (!s.floor_types) return true; // univerzálny
    if (!floorType) return false; // typ-specific ale nemáme typ
    return s.floor_types.includes(floorType);
  });
}

/** Group shots by phase pre UI rendering. */
export function groupShotsByPhase(
  shots: ContentShot[],
): Record<ShotPhase, ContentShot[]> {
  return {
    pred: shots.filter((s) => s.phase === "pred"),
    pocas: shots.filter((s) => s.phase === "pocas"),
    po: shots.filter((s) => s.phase === "po"),
  };
}

export const PHASE_LABELS: Record<ShotPhase, { label: string; icon: string; tint: string }> = {
  pred: { label: "Pred prácou", icon: "🌅", tint: "sky" },
  pocas: { label: "Počas práce", icon: "🔨", tint: "amber" },
  po: { label: "Po práci", icon: "✨", tint: "emerald" },
};
