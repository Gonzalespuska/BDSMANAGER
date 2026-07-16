/**
 * Placeholder-y v callscript body / step prompt.
 *
 * User 2026-07-16: „Nech callscript automaticky priezvisko mení podľa
 * priezviska klienta". Do textu píšeš {priezvisko}, {meno}, {plocha},
 * {lokalita}, {agent_meno}, {typ_podlahy}, {priestor} — pri otvorení
 * modalu sa nahradia hodnotami z leadu + z aktuálneho obchodáka.
 *
 * Ak hodnota chýba, placeholder nechá tag preškrtnutý (napr. "____" alebo
 * proste odstráni celú frázu) — konkrétne pri {priezvisko} bez mena
 * fallback na "pán/pani" alebo prázdne.
 */

export type CallscriptCtx = {
  leadName?: string | null;
  agentName?: string | null;
  plocha?: string | number | null;
  lokalita?: string | null;
  typPodlahy?: string | null;
  priestor?: string | null;
};

function splitName(full: string | null | undefined): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

/**
 * Nahradí všetky {placeholder} tagy v texte. Neznáme placeholder-y necháva
 * v texte (uľahčí ladenie v admin editore).
 */
export function renderCallscript(text: string, ctx: CallscriptCtx): string {
  const { first, last } = splitName(ctx.leadName);
  const map: Record<string, string> = {
    priezvisko: last || "________",
    meno: first || "________",
    cele_meno: (ctx.leadName ?? "").trim() || "________",
    plocha: ctx.plocha != null && ctx.plocha !== "" ? String(ctx.plocha) : "____",
    lokalita: (ctx.lokalita ?? "").trim() || "____",
    typ_podlahy: (ctx.typPodlahy ?? "").trim() || "____",
    priestor: (ctx.priestor ?? "").trim() || "____",
    agent_meno: (ctx.agentName ?? "").trim() || "obchodník",
  };
  return text.replace(/\{([a-z_]+)\}/g, (m, key) => {
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m;
  });
}

/**
 * Vráti zoznam podporovaných placeholder-ov pre admin editor.
 */
export const CALLSCRIPT_PLACEHOLDERS: Array<{ tag: string; description: string }> = [
  { tag: "{priezvisko}", description: "Priezvisko klienta (posledné slovo v mene leadu)" },
  { tag: "{meno}", description: "Krstné meno klienta (prvé slovo v mene leadu)" },
  { tag: "{cele_meno}", description: "Celé meno leadu tak ako je zapísané" },
  { tag: "{plocha}", description: "m² z dopytu (napr. 150)" },
  { tag: "{lokalita}", description: "Mesto / miesto z dopytu" },
  { tag: "{typ_podlahy}", description: "Typ podlahy z tagov (napr. jednofarebná)" },
  { tag: "{priestor}", description: "Priestor z tagov (napr. garáž)" },
  { tag: "{agent_meno}", description: "Meno aktuálneho obchodníka" },
];
