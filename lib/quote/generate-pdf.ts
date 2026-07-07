"use client";

import jsPDF from "jspdf";

import { formatEur, type QuoteLineCalc } from "@/lib/data/materials";
import { formatPhoneIntl } from "@/lib/phone-format";
import { ROBOTO_REGULAR_BASE64, ROBOTO_BOLD_BASE64 } from "./fonts";

/**
 * Register Roboto Regular + Bold do jsPDF VFS aby PDF podporovalo
 * slovenskú diakritiku (č, ž, š, ľ, ä, ô, ť, ď, ň, ĺ, ŕ).
 * Helvetica built-in v jsPDF podporuje len Latin-1.
 */
function registerSlovakFont(doc: jsPDF): void {
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD_BASE64);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

export interface PdfQuoteInput {
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_lokalita: string | null;
  customer_priestor: string | null;
  floor_type_label: string;
  lines: QuoteLineCalc[];
  subtotal_material: number;
  subtotal_work: number;
  margin_percent: number;
  margin_value: number;
  total: number;
  /** Voliteľná zľava v EUR (zobrazí sa červeno + zníži total). */
  discount_amount?: number;
  /** Custom label pre zľavu (default "Špeciálna zľava pre vás"). */
  discount_label?: string;
  agent_name: string;
  agent_email: string;
  /** Telefón obchodáka — voliteľný (do footera). */
  agent_phone?: string;
}

/**
 * Normalizuje priestor — opraví diakritiku pri bežných hodnotách,
 * inak Capitalize-uje prvé písmeno.
 */
function normalizePriestor(raw: string): string {
  const map: Record<string, string> = {
    garaz: "Garáž",
    "garaz ": "Garáž",
    garaze: "Garáž",
    garaže: "Garáž",
    garáž: "Garáž",
    byt: "Byt",
    dom: "Dom",
    "rodinny dom": "Rodinný dom",
    "rodinný dom": "Rodinný dom",
    dielna: "Dielňa",
    dielňa: "Dielňa",
    sklad: "Sklad",
    "showroom": "Showroom",
    showroom: "Showroom",
    "predajna": "Predajňa",
    "predajňa": "Predajňa",
    pivnica: "Pivnica",
    "obyvacka": "Obývačka",
    "obývačka": "Obývačka",
    kuchyna: "Kuchyňa",
    kuchyňa: "Kuchyňa",
    kupelna: "Kúpeľňa",
    kúpeľňa: "Kúpeľňa",
    chodba: "Chodba",
    terasa: "Terasa",
    balkon: "Balkón",
    balkón: "Balkón",
    "vyrobna hala": "Výrobná hala",
    "výrobná hala": "Výrobná hala",
    hala: "Hala",
    "autosalon": "Autosalón",
    "autosalón": "Autosalón",
    "autoservis": "Autoservis",
  };
  const key = raw.toLowerCase().trim();
  if (map[key]) return map[key];
  // Capitalize first letter
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}

/**
 * Vygeneruje cenovú ponuku ako PDF na strane klienta (jspdf).
 * Vracia Blob (na download) + base64 string (pre EML attachment).
 *
 * Layout (clean & minimalist — zákazník nevidí breakdown cien):
 *   1. Header s EPOXIDOVO brandingom + číslom ponuky + dátumom
 *   2. Zákazník (meno + kontakty + priestor + lokalita)
 *   3. Špecifikácia: typ podlahy
 *   4. Rozsah prác: zoznam operácií ako "1× Operácia X" bez cien
 *   5. Súčet (Cena bez zľavy) + ZĽAVA červená + VÝSLEDNÁ CENA modrý bar
 *   6. Veľký prominentný footer: Ponuku pripravil + Epoxidovo branding
 */
export function generateQuotePdf(input: PdfQuoteInput): {
  blob: Blob;
  base64: string;
  filename: string;
} {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  registerSlovakFont(doc); // Roboto pre slovenskú diakritiku (č, ž, š, ľ, ...)
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 20;
  const right = pageWidth - 20;
  let y = 25;

  const discount = Math.max(0, input.discount_amount ?? 0);
  const subtotalBeforeDiscount = input.total + discount;
  const finalTotal = Math.max(0, subtotalBeforeDiscount - discount);

  // ─── Header — EPOXIDOVO branding ────────────────────────────────────
  doc.setFontSize(24);
  doc.setFont("Roboto", "bold");
  doc.text("EPOXIDOVO", left, y);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(120);
  doc.text("Epoxidové a polyuretánové podlahy na mieru", left, y + 6);
  doc.setTextColor(0);

  doc.setFontSize(11);
  doc.setFont("Roboto", "bold");
  doc.text("Orientačná cenová ponuka", right, y, { align: "right" });
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    new Date().toLocaleDateString("sk-SK", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    right,
    y + 6,
    { align: "right" },
  );
  doc.setTextColor(0);

  y += 18;
  doc.setDrawColor(220);
  doc.line(left, y, right, y);
  y += 8;

  // ─── Orientačná ponuka — disclaimer ────────────────────────────────
  // User explicitne požaduje: "pridaj slovo orientacna na cenovu ponuku,
  // pri obhliadke sa to doceni ..., v zavislosti od stavu podkladu to
  // moze byt o niekolko percent viac alebo menej".
  doc.setFillColor(255, 247, 220); // svetlo-žlté pozadie
  doc.setDrawColor(230, 190, 100); // amber border
  const disclaimerHeight = 14;
  doc.roundedRect(
    left,
    y,
    right - left,
    disclaimerHeight,
    2,
    2,
    "FD",
  );
  doc.setFontSize(8.5);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(120, 80, 0);
  doc.text("Toto je ORIENTAČNÁ cenová ponuka.", left + 3, y + 5.5);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(90, 60, 0);
  doc.setFontSize(7.5);
  doc.text(
    "Presná cena bude doupresnená až pri obhliadke — v závislosti od stavu podkladu môže byť o niekoľko % viac alebo menej.",
    left + 3,
    y + 10.5,
  );
  doc.setTextColor(0);
  y += disclaimerHeight + 8;

  // ─── Customer info ──────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("ZÁKAZNÍK", left, y);
  doc.setTextColor(0);
  doc.setFontSize(13);
  doc.setFont("Roboto", "bold");
  y += 6;
  doc.text(input.customer_name, left, y);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  y += 5;
  const contactLine = [
    input.customer_phone,
    input.customer_email,
    input.customer_lokalita,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) {
    doc.setTextColor(80);
    doc.text(contactLine, left, y);
    doc.setTextColor(0);
  }
  y += 10;

  // ─── Quote details ──────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(120);
  // Manuálna CP (iba surcharge — Lokálna Oprava, atď.) — všetky lines majú
  // id obsahujúce 'zlozka' → nezobrazuj typ podlahy, je to voľné nacenenie.
  const isManualQuote =
    input.lines.length > 0 &&
    input.lines.every((l) => l.material_id.includes("zlozka"));

  if (!isManualQuote) {
    doc.text("ŠPECIFIKÁCIA", left, y);
    doc.setTextColor(0);
    doc.setFontSize(13);
    doc.setFont("Roboto", "bold");
    y += 6;
    doc.text(`${input.floor_type_label} podlaha`, left, y);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    if (input.customer_priestor) {
      y += 5;
      doc.setTextColor(80);
      doc.text(
        `Priestor: ${normalizePriestor(input.customer_priestor)}`,
        left,
        y,
      );
      doc.setTextColor(0);
    }
    y += 10;
  }

  // ─── Rozsah prác — operácie ako 1× kusy bez cien ────────────────────
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("ROZSAH PRÁC", left, y);
  doc.setTextColor(0);
  y += 6;

  doc.setFillColor(245);
  doc.rect(left, y - 4, right - left, 8, "F");
  doc.setFontSize(9);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(80);
  doc.text("MNOŽSTVO", left + 2, y + 1);
  doc.text("POLOŽKA", left + 30, y + 1);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(0);
  y += 8;

  doc.setFontSize(11);
  for (const line of input.lines) {
    if (!line) continue;
    if (y > 245) {
      doc.addPage();
      y = 25;
    }
    doc.setFont("Roboto", "bold");
    doc.text("1×", left + 2, y);
    doc.setFont("Roboto", "normal");
    doc.text(line.material_name, left + 30, y);
    // Pri surcharge (zložka) je line.m2 vlastne EUR suma, nie štvorcové metre —
    // NEZOBRAZUJ ju s "m²". Klasické area/level materials si zobrazí (X m²).
    const isSurcharge = line.material_id.includes("zlozka");
    if (line.m2 > 0 && !isSurcharge) {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`(${line.m2} m²)`, right - 2, y, { align: "right" });
      doc.setFontSize(11);
      doc.setTextColor(0);
    }
    y += 7;
  }

  y += 4;
  doc.setDrawColor(220);
  doc.line(left, y, right, y);
  y += 8;

  // ─── Pricing block ───────────────────────────────────────────────────
  if (y > 230) {
    doc.addPage();
    y = 25;
  }

  // Cena bez zľavy (small)
  if (discount > 0) {
    doc.setFontSize(10);
    doc.setTextColor(140);
    doc.text("Cena bez zľavy:", right - 70, y, { align: "right" });
    doc.text(formatEur(subtotalBeforeDiscount), right - 2, y, {
      align: "right",
    });
    y += 6;

    // Zľava (RED — fancy)
    const discountLabel = input.discount_label ?? "Špeciálna zľava pre vás";
    doc.setFontSize(11);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(220, 38, 38); // red-600
    doc.text(`★ ${discountLabel}:`, right - 70, y, { align: "right" });
    doc.text(`− ${formatEur(discount)}`, right - 2, y, { align: "right" });
    doc.setTextColor(0);
    doc.setFont("Roboto", "normal");
    y += 9;
  }

  // VÝSLEDNÁ CENA — big sky bar
  doc.setFillColor(14, 165, 233); // sky-500
  doc.rect(left, y - 4, right - left, 14, "F");
  doc.setTextColor(255);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(14);
  doc.text("VÝSLEDNÁ CENA", left + 4, y + 4);
  doc.setFontSize(18);
  doc.text(formatEur(finalTotal), right - 4, y + 4, { align: "right" });
  doc.setTextColor(0);
  doc.setFont("Roboto", "normal");
  y += 16;

  // ─── PROMINENT FOOTER — ponuku pripravil + EPOXIDOVO branding ───────
  // Footer je na spodku stránky, nie tesne za totalom
  const footerY = 260;

  // Decoračný separator
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(0.8);
  doc.line(left, footerY - 6, right, footerY - 6);
  doc.setLineWidth(0.2);
  doc.setDrawColor(0);

  // "Ponuku pripravil" label
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("PONUKU PRIPRAVIL", left, footerY);
  doc.setTextColor(0);

  // Meno obchodáka — BOLD a veľké
  doc.setFontSize(15);
  doc.setFont("Roboto", "bold");
  doc.text(input.agent_name, left, footerY + 7);

  // Kontakt obchodáka
  doc.setFontSize(9);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(80);
  const agentContact = [
    input.agent_phone ? formatPhoneIntl(input.agent_phone) : null,
    input.agent_email,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (agentContact) {
    doc.text(agentContact, left, footerY + 12);
  }
  doc.setTextColor(0);

  // EPOXIDOVO branding — vpravo
  doc.setFontSize(14);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(14, 165, 233); // sky-500
  doc.text("EPOXIDOVO s. r. o.", right, footerY + 1, { align: "right" });
  doc.setTextColor(0);

  doc.setFontSize(9);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(80);
  doc.text("IČO 56 966 237  ·  DIČ 2122509813", right, footerY + 6, {
    align: "right",
  });
  doc.setFont("Roboto", "bold");
  doc.setTextColor(14, 165, 233);
  doc.text("www.epoxidovo.sk", right, footerY + 11, { align: "right" });
  doc.setTextColor(0);
  doc.setFont("Roboto", "normal");

  // ─── Output ─────────────────────────────────────────────────────────
  const safeName = input.customer_name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `ponuka-${safeName}-${datePart}.pdf`;

  const arrayBuffer = doc.output("arraybuffer");
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const base64 = doc.output("datauristring").split(",")[1] ?? "";

  return { blob, base64, filename };
}

/** Spustí download Blobu */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Otvorí PDF blob v novom tabe — browser zobrazí natívny PDF viewer.
 * Užitočné na náhľad pred poslaním klientovi.
 */
export function previewBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    // Pop-up blocker zablokoval — fall-back na download.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  // Blob URL ostane platná kým je nový tab otvorený — revoke neskôr,
  // aby PDF nezostal čierny ak browser ešte len načítava.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
