/**
 * Formátovanie telefónnych čísel do jednotného tvaru "0950 890 098".
 *
 * Vstupy ktoré dokáže rozpoznať:
 *   - "+421950890098"    → "0950 890 098"
 *   - "421950890098"     → "0950 890 098"
 *   - "0950890098"       → "0950 890 098"
 *   - "0950 890 098"     → "0950 890 098"
 *   - "0950-890-098"     → "0950 890 098"
 *   - "+420 605 123 456" → "0605 123 456" (CZ)
 *
 * Ak nič nesedí (napr. 5-miestne, alebo cudzia predvoľba), vráti pôvodný
 * vstup (bez padnutia) trimmovaný.
 */
export function formatPhoneSK(raw: string | null | undefined): string {
  if (!raw) return "";
  // Vyčisti všetko okrem číslic a + na začiatku
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  let digits = cleaned;

  // +421… alebo 421… → 0…
  if (digits.startsWith("+421")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("+420")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("421") && digits.length >= 12) digits = "0" + digits.slice(3);
  else if (digits.startsWith("420") && digits.length >= 12) digits = "0" + digits.slice(3);

  // Musíme mať SK/CZ formát 0XXXXXXXXX (10 číslic začínajúcich 0)
  if (/^0\d{9}$/.test(digits)) {
    // 0950 890 098 (4-3-3)
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`;
  }

  // Fallback — nič sme neuznali, vráť pôvodný trimmovaný
  return String(raw).trim();
}

/**
 * Auto-format počas písania — vhodný pre input onChange.
 * User 2026-07-16: „nech to automaticky upracuje ten format cislo na
 * +421 950 890 s medzerami presne tak ako som ti to poslal kurva".
 *
 * Postup:
 *   • Ak user má už kompletný SK/CZ formát → normalizuje na
 *     „+421 950 890 098" alebo „+420 605 123 456".
 *   • Neúplný vstup (napr. „0950") → vráti pôvodný — nešahá počas písania.
 *
 * Vhodné pre onChange handler v input poliach (New agent modal,
 * lead phone editor, atď).
 */
export function autoFormatPhoneWhileTyping(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  let digits = cleaned;
  let country: "+421" | "+420" = "+421";
  if (digits.startsWith("+421")) {
    digits = "0" + digits.slice(4);
    country = "+421";
  } else if (digits.startsWith("+420")) {
    digits = "0" + digits.slice(4);
    country = "+420";
  } else if (digits.startsWith("421") && digits.length >= 12) {
    digits = "0" + digits.slice(3);
    country = "+421";
  } else if (digits.startsWith("420") && digits.length >= 12) {
    digits = "0" + digits.slice(3);
    country = "+420";
  }
  // Iba ak máme kompletné 10-cif SK/CZ číslo, sformátujeme.
  if (/^0\d{9}$/.test(digits)) {
    const rest = digits.slice(1);
    return `${country} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 9)}`;
  }
  // Neúplné číslo — nechaj tak, user ešte píše.
  return raw;
}

/**
 * Medzinárodný formát: "+421 950 890 098" (SK) / "+420 605 123 456" (CZ).
 * Používa sa v email signatúre + PDF footer — profesionálnejší vzhľad
 * ako lokálne "0950 890 098".
 *
 * Rovnaké robustné parsovanie ako formatPhoneSK.
 */
export function formatPhoneIntl(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  let digits = cleaned;
  // Normalizuj na 0XXXXXXXXX najprv (rovnako ako formatPhoneSK)
  let country: "+421" | "+420" = "+421"; // default SK
  if (digits.startsWith("+421")) {
    digits = "0" + digits.slice(4);
    country = "+421";
  } else if (digits.startsWith("+420")) {
    digits = "0" + digits.slice(4);
    country = "+420";
  } else if (digits.startsWith("421") && digits.length >= 12) {
    digits = "0" + digits.slice(3);
    country = "+421";
  } else if (digits.startsWith("420") && digits.length >= 12) {
    digits = "0" + digits.slice(3);
    country = "+420";
  }
  // Musíme mať 0XXXXXXXXX
  if (/^0\d{9}$/.test(digits)) {
    // Odstrániť úvodnú nulu a poskladať: +421 XXX XXX XXX
    const rest = digits.slice(1); // 9 číslic
    return `${country} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 9)}`;
  }
  return String(raw).trim();
}
