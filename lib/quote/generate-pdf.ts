"use client";

import jsPDF from "jspdf";

import { formatEur, type QuoteLineCalc } from "@/lib/data/materials";

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
  agent_name: string;
  agent_email: string;
}

/**
 * Vygeneruje cenovú ponuku ako PDF na strane klienta (jspdf).
 * Vracia Blob (na download) + base64 string (pre EML attachment).
 */
export function generateQuotePdf(input: PdfQuoteInput): {
  blob: Blob;
  base64: string;
  filename: string;
} {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 20;
  const right = pageWidth - 20;
  let y = 25;

  // ─── Header — EPOXIDOVO branding ────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("EPOXIDOVO", left, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Epoxidové podlahy s dušou", left, y + 6);
  doc.setTextColor(0);

  doc.setFontSize(11);
  doc.text("Cenová ponuka", right, y, { align: "right" });
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

  // ─── Customer info ──────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("ZÁKAZNÍK", left, y);
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  y += 5;
  doc.text(input.customer_name, left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 5;
  const contactLine = [
    input.customer_phone,
    input.customer_email,
    input.customer_lokalita,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) doc.text(contactLine, left, y);
  y += 8;

  // ─── Quote details ──────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("ŠPECIFIKÁCIA", left, y);
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  y += 5;
  doc.text(`${input.floor_type_label} podlaha`, left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (input.customer_priestor) {
    y += 5;
    doc.text(`Priestor: ${input.customer_priestor}`, left, y);
  }
  y += 8;

  // ─── Operations table ───────────────────────────────────────────────
  doc.setFillColor(240);
  doc.rect(left, y - 4, right - left, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("OPERÁCIA", left + 2, y + 1);
  doc.text("MATERIÁL", right - 70, y + 1, { align: "right" });
  doc.text("PRÁCA", right - 35, y + 1, { align: "right" });
  doc.text("SPOLU", right - 2, y + 1, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

  doc.setFontSize(10);
  for (const line of input.lines) {
    if (!line) continue;
    if (y > 260) {
      doc.addPage();
      y = 25;
    }
    doc.text(line.material_name, left + 2, y);
    doc.text(formatEur(line.material_cost), right - 70, y, { align: "right" });
    doc.text(formatEur(line.work_cost), right - 35, y, { align: "right" });
    doc.text(formatEur(line.total), right - 2, y, { align: "right" });

    if (line.m2 > 0) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      const detail =
        line.kg_needed > 0
          ? `${line.m2} m² · ${line.kg_needed.toFixed(1)} kg${line.poolable ? "" : ` (${Math.ceil(line.packages)}× ${(line.kg_needed / Math.max(line.packages, 0.001) / 1).toFixed(0)}kg balenie — celé)`}`
          : `${line.m2} m²`;
      y += 4;
      doc.text(detail, left + 4, y);
      doc.setFontSize(10);
      doc.setTextColor(0);
    }
    y += 7;
  }

  // ─── Totals ─────────────────────────────────────────────────────────
  if (y > 240) {
    doc.addPage();
    y = 25;
  }
  y += 4;
  doc.setDrawColor(220);
  doc.line(left, y, right, y);
  y += 6;

  doc.setFontSize(10);
  doc.text("Materiál spolu:", right - 60, y, { align: "right" });
  doc.text(formatEur(input.subtotal_material), right - 2, y, { align: "right" });
  y += 5;
  doc.text("Práca spolu:", right - 60, y, { align: "right" });
  doc.text(formatEur(input.subtotal_work), right - 2, y, { align: "right" });
  y += 5;
  doc.text(
    `Prirážka (${input.margin_percent.toFixed(0)} %):`,
    right - 60,
    y,
    { align: "right" },
  );
  doc.text(formatEur(input.margin_value), right - 2, y, { align: "right" });
  y += 8;

  doc.setFillColor(14, 165, 233); // sky-500
  doc.rect(left, y - 4, right - left, 12, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("VÝSLEDNÁ CENA", left + 4, y + 3.5);
  doc.setFontSize(16);
  doc.text(formatEur(input.total), right - 4, y + 3.5, { align: "right" });
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");

  // ─── Footer ─────────────────────────────────────────────────────────
  y = 275;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Ponuku pripravil: ${input.agent_name} · ${input.agent_email}`,
    left,
    y,
  );
  doc.text(
    "EPOXIDOVO s. r. o. · IČO 56 966 237 · epoxidovo.sk",
    left,
    y + 4,
  );
  doc.setTextColor(0);

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
