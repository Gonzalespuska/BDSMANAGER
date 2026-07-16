/**
 * vCard generator — pri klik-nutí „Kontakt" po hovore stiahne .vcf ktoré
 * si užívateľ pridá do kontaktov (iOS: „Pridať kontakt" dialóg, Android:
 * otvorí Contacts app).
 *
 * User 2026-07-16: „Keď robíš crm na mobile tak nech si vieš pridať
 * kontakt automaticky po telefonáte keď stlacis kontakt, proste zavolali
 * ste si, stlacis kontakt, automaticky ti ho ulozi v telefone: cislo,
 * meno, mozno aj poznamka ... nech sa ulozi do firmy alebo poznamky ak
 * sa da v telefone niekde v tom kontakte".
 */

export type VCardLead = {
  name: string | null;
  phone: string | null;
  email?: string | null;
  /** m², typ podlahy, priestor, lokalita, atď — všetko pôjde do NOTE. */
  meta?: string[];
};

/**
 * Rozdelí meno na (first, last) — jednoduchý split na prvej medzere.
 * Ak je iba jedno slovo, dá ho ako first.
 */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Sanitize vCard hodnotu — escape special chars podľa RFC 6350. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function buildVCard(lead: VCardLead): string {
  const name = (lead.name ?? "Lead").trim() || "Lead";
  const { first, last } = splitName(name);
  const phone = (lead.phone ?? "").replace(/\s/g, "");
  const noteBits: string[] = ["EPOXIDOVO lead"];
  if (lead.meta && lead.meta.length > 0) noteBits.push(...lead.meta);
  const note = noteBits.filter(Boolean).join(" · ");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(name)}`,
    `N:${esc(last)};${esc(first)};;;`,
    // Org = "EPOXIDOVO" aby sa v telefóne zobrazoval kontakt pod firmou.
    "ORG:EPOXIDOVO",
    // TITLE = kategória (napr. "Lead — nový dopyt")
    "TITLE:CRM Lead",
    phone ? `TEL;TYPE=CELL,VOICE:${phone}` : "",
    lead.email ? `EMAIL;TYPE=INTERNET:${esc(lead.email)}` : "",
    `NOTE:${esc(note)}`,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}

/**
 * Vygeneruje vCard blob a spustí download. Na iOS Safari sa otvorí
 * „Add contact" dialog priamo, na Android sa stiahne .vcf a klik na
 * súbor otvorí Contacts app. Na desktope sa proste stiahne súbor.
 */
export function downloadVCard(lead: VCardLead): void {
  if (typeof window === "undefined") return;
  const vcard = buildVCard(lead);
  const blob = new Blob([vcard], {
    type: "text/vcard;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const safeName = (lead.name ?? "kontakt")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "kontakt";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Nechaj URL 60s pre iOS aby sa stihol otvoriť dialog (revoke ihneď na
  // niektorých iOS verziách preruší import).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
