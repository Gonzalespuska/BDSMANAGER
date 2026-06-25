"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Info,
  Mail,
  Percent,
  Settings,
  User as UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcLine,
  FLOOR_TYPE_LABELS,
  FLOOR_TYPE_META,
  formatEur,
  getMaterialsByFloorType,
  MATERIALS,
  type FloorType,
  type Material,
} from "@/lib/data/materials";
import { cn } from "@/lib/utils";

interface LineState {
  enabled: boolean;
  m2: string;
  mm: string;
  poolable?: boolean;
}

export interface LeadContext {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  m2: string; // pre-filled z data.plocha
  floor_type: FloorType | null;
  lokalita: string | null;
  priestor: string | null;
}

export function GeneratorClient({
  leadContext,
}: {
  leadContext?: LeadContext | null;
}) {
  const [floorType, setFloorType] = React.useState<FloorType>(
    leadContext?.floor_type ?? "jednofarebna",
  );
  const initialM2 = leadContext?.m2 ?? "";
  const [lines, setLines] = React.useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const m of MATERIALS) {
      init[m.id] = {
        enabled: !m.optional,
        m2: m.floor_type === (leadContext?.floor_type ?? "jednofarebna")
          ? initialM2
          : "",
        mm: m.unit === "level" ? "3" : "0",
      };
    }
    return init;
  });
  const [margin] = React.useState<string>("0"); // marža je preč, total = subtotal
  const [adminMode, setAdminMode] = React.useState(false);
  const [bulkM2] = React.useState<string>(initialM2);
  const [busy, setBusy] = React.useState(false);

  const materials = getMaterialsByFloorType(floorType);

  // Bulk action: nastaví m² všetkým povolením riadkom v aktuálnom type
  function applyBulkM2() {
    const m2 = bulkM2.trim();
    if (!m2) return;
    setLines((prev) => {
      const next = { ...prev };
      for (const m of materials) {
        if (next[m.id].enabled) {
          next[m.id] = { ...next[m.id], m2 };
        }
      }
      return next;
    });
  }

  // Calculations
  const calcs = materials.map((m) => {
    const ls = lines[m.id];
    if (!ls.enabled) return { m, calc: null };
    const m2 = parseFloat(ls.m2) || 0;
    const mm = parseFloat(ls.mm) || 0;
    return { m, calc: calcLine(m, m2, mm, ls.poolable) };
  });

  const subtotalMaterial = calcs.reduce(
    (s, c) => s + (c.calc?.material_cost ?? 0),
    0,
  );
  const subtotalWork = calcs.reduce(
    (s, c) => s + (c.calc?.work_cost ?? 0),
    0,
  );
  const subtotal = subtotalMaterial + subtotalWork;
  const marginPercent = parseFloat(margin) || 0;
  const marginValue = subtotal * (marginPercent / 100);
  const total = subtotal + marginValue;

  // ─── PDF + Email actions ─────────────────────────────────────────────
  async function buildPdfInput() {
    const { generateQuotePdf } = await import("@/lib/quote/generate-pdf");
    return {
      generator: generateQuotePdf,
      input: {
        customer_name: leadContext?.name ?? "Zákazník",
        customer_email: leadContext?.email ?? null,
        customer_phone: leadContext?.phone ?? null,
        customer_lokalita: leadContext?.lokalita ?? null,
        customer_priestor: leadContext?.priestor ?? null,
        floor_type_label: FLOOR_TYPE_LABELS[floorType],
        lines: calcs
          .map((c) => c.calc)
          .filter((c): c is NonNullable<typeof c> => c !== null),
        subtotal_material: subtotalMaterial,
        subtotal_work: subtotalWork,
        margin_percent: marginPercent,
        margin_value: marginValue,
        total,
        agent_name: "Obchodák Epoxidovo",
        agent_email: "info@epoxidovo.sk",
      },
    };
  }

  async function handleDownloadPdf() {
    setBusy(true);
    try {
      const { generator, input } = await buildPdfInput();
      const { blob, filename } = generator(input);
      const { downloadBlob } = await import("@/lib/quote/generate-pdf");
      downloadBlob(blob, filename);
    } catch (e) {
      alert(`PDF chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendEmail() {
    if (!leadContext?.email) {
      alert("Lead nemá email. Pridaj ho ručne v lead detaile.");
      return;
    }
    setBusy(true);
    try {
      const { generator, input } = await buildPdfInput();
      const { blob, base64, filename } = generator(input);

      const subject = `EPOXIDOVO · Cenová ponuka pre ${input.floor_type_label.toLowerCase()} podlahu`;
      const firstName = leadContext.name.split(" ")[0];
      const body = `Dobrý deň ${firstName},

ďakujeme za Váš dopyt. V prílohe Vám posielam cenovú ponuku
pre ${input.floor_type_label.toLowerCase()} epoxidovú podlahu.

Ak máte k ponuke akékoľvek otázky, kedykoľvek ma kontaktujte
na ${input.agent_email}.

S pozdravom,
${input.agent_name}
EPOXIDOVO s. r. o.
epoxidovo.sk`;

      // 1. Try server-side send cez Resend
      const sendRes = await fetch("/api/quote/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadContext.id,
          to_email: leadContext.email,
          to_name: leadContext.name,
          subject,
          body_text: body,
          pdf_base64: base64,
          pdf_filename: filename,
        }),
      });
      const json = await sendRes.json();

      if (sendRes.ok && json.ok) {
        alert(`✓ ${json.message ?? "Email odoslaný"}`);
        return;
      }

      // 2. Fallback — Resend nie je nakonfigurovaný, stiahne .eml
      const { downloadBlob } = await import("@/lib/quote/generate-pdf");
      const { generateEml } = await import("@/lib/quote/generate-eml");
      const eml = generateEml({
        from_email: "info@epoxidovo.sk",
        from_name: "EPOXIDOVO",
        to_email: leadContext.email,
        to_name: leadContext.name,
        subject,
        body_text: body,
        attachment: { filename, content_base64: base64, mime_type: "application/pdf" },
      });
      const emlFilename = filename.replace(/\.pdf$/, ".eml");
      downloadBlob(eml, emlFilename);
      downloadBlob(blob, filename);

      alert(
        `Auto-send cez Resend nie je nakonfigurovaný (chýba RESEND_API_KEY). ` +
          `Stiahol sa ${emlFilename}. Otvor dvojklikom, Mail.app sa otvorí s predvyplneným adresátom + prílohou. ` +
          `Pre auto-send sa zaregistruj na resend.com (3 min) a daj mi API kľúč.`,
      );
    } catch (e) {
      alert(`Email chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* DEMO lead selector — keď nie je leadContext, ukáže 4 demo leady na klik */}
      {!leadContext && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2">
            ⚡ Demo leady (bez DB), klikni pre prefilled ponuku
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Link
              href="/generator?demo=barbora"
              className="rounded-lg border bg-background hover:bg-muted/60 px-3 py-2 text-sm font-semibold text-foreground transition-colors"
            >
              <div>Barbora Dornič</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Garáž 35 m² · Chipsová
              </div>
            </Link>
            <Link
              href="/generator?demo=martin"
              className="rounded-lg border bg-background hover:bg-muted/60 px-3 py-2 text-sm font-semibold text-foreground transition-colors"
            >
              <div>Martin Krajčovič</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Sklad 85 m² · Jednofarebná
              </div>
            </Link>
            <Link
              href="/generator?demo=daniela"
              className="rounded-lg border bg-background hover:bg-muted/60 px-3 py-2 text-sm font-semibold text-foreground transition-colors"
            >
              <div>Daniela Hlinčíková</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Garáž 42 m² · Metalická
              </div>
            </Link>
            <Link
              href="/generator?demo=lucia"
              className="rounded-lg border bg-background hover:bg-muted/60 px-3 py-2 text-sm font-semibold text-foreground transition-colors"
            >
              <div>Lucia Vargová</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Kúpeľňa 18 m² · Mramorová
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Lead context banner */}
      {leadContext && (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sky-500 text-white shrink-0">
              <UserIcon className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-700">
                Ponuka pre lead
              </div>
              <div className="text-lg font-extrabold tracking-tight mt-0.5">
                {leadContext.name}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {leadContext.phone && <span>📞 {leadContext.phone}</span>}
                {leadContext.email && <span>📧 {leadContext.email}</span>}
                {leadContext.lokalita && <span>📍 {leadContext.lokalita}</span>}
                {leadContext.priestor && <span>🏠 {leadContext.priestor}</span>}
              </div>
            </div>
          </div>
          <Link
            href={`/agent/leads/${leadContext.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            Späť na lead
          </Link>
        </div>
      )}

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <Calculator className="w-7 h-7 text-sky-500" aria-hidden />
            Generátor ponúk
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leadContext
              ? `Predvyplnené ${initialM2 ? `${initialM2} m² ·` : ""} ${FLOOR_TYPE_LABELS[floorType]}. Uprav a vygeneruj PDF.`
              : "Vyber typ podlahy → zadaj m² → live cena."}
          </p>
        </div>
        {/* TODO admin-page: tu pôjde "Ceny a spotreby (admin)" toggle keď
            postavíme admin sekciu. Zatiaľ skryté. */}
      </header>

      {/* Floor type picker — 4 typy zo stránky epoxidovo.sk */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(FLOOR_TYPE_LABELS) as FloorType[]).map((type) => {
          const active = floorType === type;
          const meta = FLOOR_TYPE_META[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFloorType(type)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200 shadow-md"
                  : "border-border bg-background hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <div className="text-2xl mb-1.5" aria-hidden>
                {meta.icon}
              </div>
              <div className="text-lg font-extrabold tracking-tight">
                {FLOOR_TYPE_LABELS[type]}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
                {meta.tagline}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                {getMaterialsByFloorType(type).length} operácií
              </div>
            </button>
          );
        })}
      </div>

      {/* Operations list */}
      <div className="rounded-2xl border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Operácie pre {FLOOR_TYPE_LABELS[floorType]}
          </h2>
          <span className="text-xs text-muted-foreground">
            {calcs.filter((c) => c.calc).length} z {materials.length} aktívnych
          </span>
        </div>
        <ul className="divide-y">
          {calcs.map(({ m, calc }) => (
            <LineRow
              key={m.id}
              material={m}
              state={lines[m.id]}
              onChange={(state) =>
                setLines((prev) => ({ ...prev, [m.id]: state }))
              }
              calc={calc}
              adminMode={adminMode}
            />
          ))}
        </ul>
      </div>

      {/* Total bar */}
      <div className="rounded-2xl border-2 border-sky-500 bg-sky-50 p-5 space-y-3 sticky bottom-4 shadow-xl">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Materiál
            </div>
            <div className="font-bold text-lg">{formatEur(subtotalMaterial)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Práca
            </div>
            <div className="font-bold text-lg">{formatEur(subtotalWork)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Medzisúčet
            </div>
            <div className="font-bold text-lg">{formatEur(subtotal)}</div>
          </div>
        </div>

        <div className="flex items-end justify-end pt-3 border-t border-sky-200">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider font-bold text-sky-700">
              Výsledná cena
            </div>
            <div className="text-3xl md:text-4xl font-extrabold text-sky-700 tabular-nums">
              {formatEur(total)}
            </div>
            {subtotal > 0 && (
              <div className="text-xs text-muted-foreground">
                {formatEur(total / (calcs.find((c) => c.calc)?.calc?.m2 || 1))}{" "}
                / m²
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-sky-200 flex-wrap">
          <Button
            type="button"
            onClick={handleDownloadPdf}
            disabled={busy || total <= 0}
            variant="outline"
            className="flex-1 min-w-[140px]"
          >
            <Download className="w-4 h-4 mr-1.5" aria-hidden />
            <FileText className="w-4 h-4 mr-1" aria-hidden />
            Stiahnuť PDF
          </Button>
          <Button
            type="button"
            onClick={handleSendEmail}
            disabled={busy || total <= 0 || !leadContext?.email}
            className="flex-1 min-w-[200px] bg-emerald-600 hover:bg-emerald-700"
          >
            <Mail className="w-4 h-4 mr-1.5" aria-hidden />
            Pošli email s ponukou
          </Button>
        </div>
        {!leadContext?.email && (
          <p className="text-xs text-muted-foreground">
            Email tlačidlo je aktívne až keď otvoríš generátor z leadu, ktorý má
            email (linkom z lead detailu).
          </p>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function LineRow({
  material,
  state,
  onChange,
  calc,
  adminMode,
}: {
  material: Material;
  state: LineState;
  onChange: (state: LineState) => void;
  calc: ReturnType<typeof calcLine> | null;
  adminMode: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <li className={cn(state.enabled ? "" : "bg-muted/30 opacity-70")}>
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) =>
            onChange({ ...state, enabled: e.target.checked })
          }
          disabled={!material.optional && false}
          className="w-4 h-4 accent-sky-500"
          title={material.optional ? "Voliteľná operácia" : "Povinná operácia"}
        />
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold inline-flex items-center gap-2 flex-wrap">
            {material.name}
            {material.optional && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                voliteľné
              </span>
            )}
            {!material.poolable && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                celé balenia
              </span>
            )}
          </div>
          {calc && calc.kg_needed > 0 && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {calc.kg_needed.toFixed(1)} kg
              {calc.packages > 0 &&
                ` → ${
                  state.poolable ?? material.poolable
                    ? calc.packages.toFixed(2)
                    : Math.ceil(calc.packages)
                } balení`}
            </div>
          )}
        </div>

        {/* m² input */}
        <div className="w-24">
          <Input
            type="number"
            placeholder="m²"
            value={state.m2}
            onChange={(e) => onChange({ ...state, m2: e.target.value })}
            disabled={!state.enabled}
            className="h-9 text-sm"
          />
        </div>

        {/* mm input pre level */}
        {material.unit === "level" && (
          <div className="w-20">
            <Input
              type="number"
              placeholder="mm"
              value={state.mm}
              onChange={(e) => onChange({ ...state, mm: e.target.value })}
              disabled={!state.enabled}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Total per riadok */}
        <div className="w-28 text-right tabular-nums">
          {calc ? (
            <div>
              <div className="font-bold">{formatEur(calc.total)}</div>
              <div className="text-[10px] text-muted-foreground">
                {formatEur(calc.material_cost)} +{" "}
                {formatEur(calc.work_cost)}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>

        {adminMode && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Expand admin fields"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Admin row (readonly preview spotreby/ceny — neskôr editovateľné cez /admin/materials) */}
      {adminMode && expanded && (
        <div className="px-5 py-3 bg-muted/20 border-t text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field
            label="Spotreba"
            value={
              material.consumption_kg_per_sqm > 0
                ? `${material.consumption_kg_per_sqm} kg/m²${material.unit === "level" ? "/mm" : ""}`
                : "—"
            }
          />
          <Field
            label="Balenie"
            value={
              material.package_size_kg > 0
                ? `${material.package_size_kg} kg`
                : "—"
            }
          />
          <Field
            label="Cena za balenie"
            value={
              material.package_price > 0
                ? formatEur(material.package_price)
                : "—"
            }
          />
          <Field label="Práca" value={`${material.work_per_sqm} €/m²`} />
        </div>
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
