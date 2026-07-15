// Standalone preview generator — dupli logiku z lib/quote/generate-pdf.ts
// (bez importov z Next.js aliasu — mimo Next.js runtime).
import { jsPDF } from "jspdf";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/puska/bdsmanager";

// ─── Load fonty + logo z existujúcich TS súborov ───
function extractBase64(filePath, constName) {
  const src = fs.readFileSync(filePath, "utf-8");
  const re = new RegExp(`${constName}\\s*=\\s*"([A-Za-z0-9+/=]+)"`);
  const m = src.match(re);
  if (!m) throw new Error(`${constName} not found in ${filePath}`);
  return m[1];
}
const ROBOTO_REGULAR_BASE64 = extractBase64(
  path.join(ROOT, "lib/quote/fonts.ts"),
  "ROBOTO_REGULAR_BASE64",
);
const ROBOTO_BOLD_BASE64 = extractBase64(
  path.join(ROOT, "lib/quote/fonts.ts"),
  "ROBOTO_BOLD_BASE64",
);
const EPOXIDOVO_LOGO_BASE64 = extractBase64(
  path.join(ROOT, "lib/quote/logo-base64.ts"),
  "EPOXIDOVO_LOGO_BASE64",
);
const EPOXIDOVO_LOGO_WIDTH = 360;
const EPOXIDOVO_LOGO_HEIGHT = 133;

// ─── Sample dáta ───
const input = {
  customer_name: "Ján Vzorka",
  customer_email: "jan.vzorka@gmail.com",
  customer_phone: "+421 903 123 456",
  customer_lokalita: "Bratislava",
  customer_priestor: "garaz",
  floor_type_label: "Univerzálna epoxidová",
  lines: [
    { material_id: "epx-base",     material_name: "Základný náter (primer)", m2: 42 },
    { material_id: "epx-vyrovn",   material_name: "Samovyrovnávacia stierka", m2: 42 },
    { material_id: "epx-farebna",  material_name: "Farebná finálna vrstva",   m2: 42 },
    { material_id: "epx-lak",      material_name: "PU top-coat (lesk)",       m2: 42 },
  ],
  subtotal_material: 500,
  subtotal_work: 400,
  margin_percent: 15,
  margin_value: 135,
  total: 1006.56,
  discount_amount: 50,
  discount_label: "Špeciálna zľava pre vás",
  agent_name: "Leo Hrisenko",
  agent_email: "obchod@epoxidovo.sk",
  agent_phone: "+421 950 890 098",
};

function formatEur(v) {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(v);
}
function formatPhoneIntl(p) {
  const digits = p.replace(/\s+/g, "").replace(/^\+?421/, "421");
  if (digits.length === 12 && digits.startsWith("421")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return p;
}
const PRIESTOR_MAP = { garaz: "Garáž" };

// ─── Generate ───
const doc = new jsPDF({ unit: "mm", format: "a4" });
doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR_BASE64);
doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD_BASE64);
doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
doc.setFont("Roboto", "normal");

const pageWidth = doc.internal.pageSize.getWidth();
const left = 20;
const right = pageWidth - 20;
let y = 25;

const discount = input.discount_amount ?? 0;
const subtotalBeforeDiscount = input.total + discount;
const finalTotal = Math.max(0, subtotalBeforeDiscount - discount);

// HEADER
const logoW = 45;
const logoH = (logoW * EPOXIDOVO_LOGO_HEIGHT) / EPOXIDOVO_LOGO_WIDTH;
doc.addImage(`data:image/png;base64,${EPOXIDOVO_LOGO_BASE64}`, "PNG", left, y - 4, logoW, logoH);
doc.setFontSize(9);
doc.setTextColor(120);
doc.text("Epoxidové a polyuretánové podlahy na mieru", left, y + logoH);
doc.setTextColor(0);
doc.setFontSize(11);
doc.setFont("Roboto", "bold");
doc.text("Orientačná cenová ponuka", right, y, { align: "right" });
doc.setFont("Roboto", "normal");
doc.setFontSize(9);
doc.setTextColor(120);
doc.text(new Date().toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" }), right, y + 6, { align: "right" });
doc.setTextColor(0);

y += 18;
doc.setDrawColor(220);
doc.line(left, y, right, y);
y += 8;

// Disclaimer
doc.setFillColor(255, 247, 220);
doc.setDrawColor(230, 190, 100);
const dH = 14;
doc.roundedRect(left, y, right - left, dH, 2, 2, "FD");
doc.setFontSize(8.5);
doc.setFont("Roboto", "bold");
doc.setTextColor(120, 80, 0);
doc.text("Toto je ORIENTAČNÁ cenová ponuka.", left + 3, y + 5.5);
doc.setFont("Roboto", "normal");
doc.setTextColor(90, 60, 0);
doc.setFontSize(7.5);
doc.text("Presná cena bude doupresnená až pri obhliadke — v závislosti od stavu podkladu môže byť o niekoľko % viac alebo menej.", left + 3, y + 10.5);
doc.setTextColor(0);
y += dH + 8;

// Customer
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
const contactLine = [input.customer_phone, input.customer_email, input.customer_lokalita].filter(Boolean).join("  ·  ");
doc.setTextColor(80);
doc.text(contactLine, left, y);
doc.setTextColor(0);
y += 10;

// Špec
doc.setFontSize(8);
doc.setTextColor(120);
doc.text("ŠPECIFIKÁCIA", left, y);
doc.setTextColor(0);
doc.setFontSize(13);
doc.setFont("Roboto", "bold");
y += 6;
doc.text(`${input.floor_type_label} podlaha`, left, y);
doc.setFont("Roboto", "normal");
doc.setFontSize(10);
y += 5;
doc.setTextColor(80);
doc.text(`Priestor: ${PRIESTOR_MAP[input.customer_priestor] ?? input.customer_priestor}`, left, y);
doc.setTextColor(0);
y += 10;

// Rozsah prác
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
  doc.setFont("Roboto", "bold");
  doc.text("1×", left + 2, y);
  doc.setFont("Roboto", "normal");
  doc.text(line.material_name, left + 30, y);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`(${line.m2} m²)`, right - 2, y, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(0);
  y += 7;
}
y += 4;
doc.setDrawColor(220);
doc.line(left, y, right, y);
y += 8;

// Pricing
doc.setFontSize(10);
doc.setTextColor(140);
doc.text("Cena bez zľavy:", right - 70, y, { align: "right" });
doc.text(formatEur(subtotalBeforeDiscount), right - 2, y, { align: "right" });
y += 6;
doc.setFontSize(11);
doc.setFont("Roboto", "bold");
doc.setTextColor(220, 38, 38);
doc.text(`★ ${input.discount_label}:`, right - 70, y, { align: "right" });
doc.text(`− ${formatEur(discount)}`, right - 2, y, { align: "right" });
doc.setTextColor(0);
doc.setFont("Roboto", "normal");
y += 9;
doc.setFillColor(14, 165, 233);
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

// FOOTER — nový (bez logo image, iba text)
const footerY = 260;
doc.setDrawColor(14, 165, 233);
doc.setLineWidth(0.8);
doc.line(left, footerY - 6, right, footerY - 6);
doc.setLineWidth(0.2);
doc.setDrawColor(0);

doc.setFontSize(8);
doc.setTextColor(120);
doc.text("PONUKU PRIPRAVIL", left, footerY);
doc.setTextColor(0);
doc.setFontSize(15);
doc.setFont("Roboto", "bold");
doc.text(input.agent_name, left, footerY + 7);
doc.setFontSize(9);
doc.setFont("Roboto", "normal");
doc.setTextColor(80);
const agentContact = [formatPhoneIntl(input.agent_phone), input.agent_email].join("  ·  ");
doc.text(agentContact, left, footerY + 12);
doc.setTextColor(0);

// PRAVÁ STRANA — nový layout
doc.setFontSize(11);
doc.setFont("Roboto", "bold");
doc.setTextColor(14, 165, 233);
doc.text("EPOXIDOVO s. r. o.", right, footerY, { align: "right" });
doc.setTextColor(80);
doc.setFont("Roboto", "normal");
doc.setFontSize(9);
doc.text("IČO 56 966 237  ·  DIČ 2122509813", right, footerY + 5.5, { align: "right" });
doc.setFont("Roboto", "bold");
doc.setTextColor(14, 165, 233);
doc.text("www.epoxidovo.sk", right, footerY + 10.5, { align: "right" });

const out = "/tmp/cp-preview.pdf";
fs.writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
console.log("→", out);
