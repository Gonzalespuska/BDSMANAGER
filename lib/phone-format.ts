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
