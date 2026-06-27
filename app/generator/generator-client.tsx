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
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
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
import { applyMargin, MARZA_MATERIAL } from "@/lib/data/pricing";
import { PRODUCT_CATALOG, type Product } from "@/lib/data/product-catalog";
import {
  calcDays,
  calcTransport,
  getCityDistanceKm,
  HQ_NAME,
} from "@/lib/data/transport";
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
  const [floorType, setFloorType] = React.useState<FloorType | null>(
    leadContext?.floor_type ?? null,
  );
  const initialM2 = leadContext?.m2 ?? "";
  const [lines, setLines] = React.useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const m of MATERIALS) {
      const isAreaUnit = m.unit === "area" || m.unit === "level";
      // default_enabled má prednosť; ak nie je nastavené, !optional je default
      const defaultEnabled =
        typeof m.default_enabled === "boolean"
          ? m.default_enabled
          : !m.optional;
      init[m.id] = {
        enabled: defaultEnabled,
        m2:
          isAreaUnit && m.floor_type === leadContext?.floor_type
            ? initialM2
            : "",
        mm:
          m.unit === "level"
            ? String(m.default_mm ?? m.min_mm ?? 4)
            : "0",
      };
    }
    return init;
  });
  const [margin] = React.useState<string>("0"); // marža je preč, total = subtotal
  const [adminMode, setAdminMode] = React.useState(false);
  const [bulkM2] = React.useState<string>(initialM2);
  const [busy, setBusy] = React.useState(false);
  const [lokalita, setLokalita] = React.useState<string>(
    leadContext?.lokalita ?? "",
  );

  // Mode: realizácia podlahy vs iba predaj materiálu + doprava
  const [saleMode, setSaleMode] = React.useState<"realizacia" | "material">(
    "realizacia",
  );
  // Pre jednofarebnú: voľba medzi Polyuretán (default) a Epoxid farebným náterom
  const [jednofarebnaVariant, setJednofarebnaVariant] = React.useState<
    "epoxid" | "polyuretan"
  >("polyuretan");
  // Pre material mode: count balení / kg per produkt (id -> qty string)
  const [materialQtys, setMaterialQtys] = React.useState<
    Record<string, string>
  >({});

  // Subtotal pre material mode — pre každý produkt:
  //   ks balenia × cena/balenie  ALEBO  kg × cena/kg
  // Aplikuje sa MARZA_MATERIAL na predaj.
  const materialOnlySubtotal = React.useMemo(() => {
    if (saleMode !== "material") return 0;
    let cost = 0;
    for (const p of PRODUCT_CATALOG) {
      const qty = parseFloat(materialQtys[p.id] ?? "") || 0;
      if (qty <= 0) continue;
      if (p.sell_by === "package" && p.cost_per_package !== null) {
        cost += qty * p.cost_per_package;
      } else {
        cost += qty * p.cost_per_kg;
      }
    }
    return applyMargin(cost, MARZA_MATERIAL);
  }, [saleMode, materialQtys]);
  // ref na prvý m² input — aby sme po výbere lokality skočili na neho
  const firstM2Ref = React.useRef<HTMLInputElement | null>(null);
  function focusFirstM2() {
    const el = firstM2Ref.current;
    if (el) {
      el.focus();
      el.select();
    }
  }

  // Materials pre vybraný floor type. Pri jednofarebnej filtrujem aktívny
  // variant (epoxid alebo polyuretán), ostatné variants sa nepočítajú.
  const materials = floorType
    ? getMaterialsByFloorType(floorType).filter((m) => {
        if (!m.variant) return true;
        return m.variant === jednofarebnaVariant;
      })
    : [];

  // Synchronizácia m² medzi všetkými operáciami danej podlahy. Iteruje
  // cez všetky materiály daného floor_type (vrátane neaktívnych variantov
  // ako polyuretán), aby sa po prepnutí variantu m² nevynulovala.
  //
  // Iba doplní m² — nemení enabled state. Materiály ktorých default je
  // VYPNUTÝ (napr. Vrchný lak epoxid) zostanú vypnuté; user ich musí
  // manuálne zapnúť klikom na kartu.
  function setRequiredM2(value: string) {
    if (!floorType) return;
    setLines((prev) => {
      const next = { ...prev };
      for (const m of getMaterialsByFloorType(floorType)) {
        if (m.unit === "count") continue;
        if (!next[m.id]) continue;
        next[m.id] = { ...next[m.id], m2: value };
      }
      return next;
    });
  }

  // Helper: pri prvom kliknutí na typ podlahy doplníme m² z lead contextu
  // (len pre area/level materiály — count materiály ako Zošívanie nedostávajú m²).
  function selectFloorType(type: FloorType) {
    setFloorType(type);
    if (initialM2 && (!floorType || floorType !== type)) {
      setLines((prev) => {
        const next = { ...prev };
        for (const m of MATERIALS) {
          const isAreaUnit = m.unit === "area" || m.unit === "level";
          if (
            isAreaUnit &&
            m.floor_type === type &&
            next[m.id] &&
            !next[m.id].m2
          ) {
            next[m.id] = { ...next[m.id], m2: initialM2 };
          }
        }
        return next;
      });
    }
  }

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
    return { m, calc: calcLine(m, m2, mm) };
  });

  // Subtotal = súčet predajných cien všetkých povolených riadkov.
  // Sadzby v Material sú UŽ FINÁLNE — calcLine vracia rovno predajnú cenu.
  const subtotal = calcs.reduce((s, c) => s + (c.calc?.total ?? 0), 0);
  const marginPercent = parseFloat(margin) || 0;
  const marginValue = subtotal * (marginPercent / 100);

  // ─── Doprava + dĺžka realizácie ──────────────────────────────────────
  const kmOneWay = getCityDistanceKm(lokalita);
  const transport = kmOneWay != null ? calcTransport(kmOneWay) : null;
  // m² pre dni počítame z prvého povinného (úprava povrchu)
  const requiredM2Value = (() => {
    const firstReq = materials.find(
      (m) => !m.optional && true /* flat_price odstránené */,
    );
    if (!firstReq) return 0;
    return parseFloat(lines[firstReq.id]?.m2 ?? "") || 0;
  })();
  const days = calcDays(requiredM2Value);

  // Operácie subtotal — BEZ dopravy. Na túto časť aplikujeme min order.
  const opsSubtotal =
    saleMode === "material" ? materialOnlySubtotal : subtotal + marginValue;
  const transportTotal = transport ? transport.total_eur : 0;

  // ─── Cenový STROP per m² pre niektoré floor typy ────────────────────
  // Pre chipsovú nikdy nesmie cena prekročiť 55 €/m² (vrátane dopravy).
  // Pri prekročení sa zľava aplikuje na dopravu (operácie zostávajú).
  const MAX_PRICE_PER_SQM_BY_FLOOR: Partial<Record<FloorType, number>> = {
    chipsova: 55,
  };
  const capPerSqm =
    saleMode === "realizacia" && floorType
      ? MAX_PRICE_PER_SQM_BY_FLOOR[floorType]
      : undefined;
  const capTotal =
    capPerSqm != null && requiredM2Value > 0
      ? capPerSqm * requiredM2Value
      : Infinity;

  const rawTotal = opsSubtotal + transportTotal;

  // Má user reálny vstup? Bez rozmeru (m²) v realizácii alebo bez balení
  // v material móde → ponuka nie je validná, nepočítame výslednú cenu.
  const hasRealInput =
    saleMode === "material"
      ? Object.values(materialQtys).some((v) => (parseFloat(v) || 0) > 0)
      : requiredM2Value > 0;

  // ─── Minimálna objednávka: 1 000 € (LEN pre operácie, NIE pre dopravu) ─
  // Doprava sa pridáva navrch — nech zmena lokality viditeľne zmení cenu.
  // Deterministický noise z hashu vstupov (lokalita IGNOROVANÁ aby sa
  // top-up nemenil pri zmene mesta).
  const minOrderTopUp = React.useMemo(() => {
    const MIN = 1000;
    if (!hasRealInput) return 0;
    if (opsSubtotal <= 0) return 0;
    if (opsSubtotal >= MIN) return 0;
    const hashStr = `${saleMode}|${floorType ?? ""}|${requiredM2Value}|${Object.entries(
      materialQtys,
    )
      .map(([k, v]) => `${k}:${v}`)
      .join(",")}`;
    let h = 0;
    for (let i = 0; i < hashStr.length; i++) {
      h = (h * 31 + hashStr.charCodeAt(i)) | 0;
    }
    const norm = (Math.abs(h) % 10000) / 10000;
    // Target medzi 1001.50 a 1028.50 €
    const target = MIN + 1.5 + norm * 27;
    return target - opsSubtotal;
  }, [opsSubtotal, saleMode, floorType, requiredM2Value, materialQtys, hasRealInput]);

  const uncappedTotal = opsSubtotal + minOrderTopUp + transportTotal;
  const cappedTotal = Math.min(uncappedTotal, capTotal);
  const total = hasRealInput ? cappedTotal : 0;
  // Doprava skutočne účtovaná (po cap-deduce) — pre zobrazenie v lokalita karte
  const effectiveTransport = hasRealInput
    ? Math.max(0, cappedTotal - opsSubtotal - minOrderTopUp)
    : 0;

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
        floor_type_label: floorType ? FLOOR_TYPE_LABELS[floorType] : "",
        lines: calcs
          .map((c) => c.calc)
          .filter((c): c is NonNullable<typeof c> => c !== null),
        subtotal_material: subtotal,
        subtotal_work: 0,
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
    <div className="h-full flex flex-col gap-3 overflow-hidden min-h-0">
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
          {leadContext && (
            <p className="text-sm text-muted-foreground mt-1">
              Predvyplnené {initialM2 ? `${initialM2} m² · ` : ""}
              {floorType ? FLOOR_TYPE_LABELS[floorType] : ""}. Uprav a vygeneruj PDF.
            </p>
          )}
        </div>
        {/* TODO admin-page: tu pôjde "Ceny a spotreby (admin)" toggle keď
            postavíme admin sekciu. Zatiaľ skryté. */}
      </header>

      {/* Mode toggle — realizácia vs iba materiál */}
      <div className="inline-flex rounded-xl border bg-muted/30 p-1 self-start">
        <button
          type="button"
          onClick={() => setSaleMode("realizacia")}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
            saleMode === "realizacia"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Realizácia podlahy
        </button>
        <button
          type="button"
          onClick={() => setSaleMode("material")}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
            saleMode === "material"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Iba materiál + doprava
        </button>
      </div>

      {/* Floor type picker — pred výberom veľké fotky; po výbere kompaktné pills */}
      {saleMode === "realizacia" && (
      !floorType ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(FLOOR_TYPE_LABELS) as FloorType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => selectFloorType(type)}
                className="group rounded-2xl border border-border bg-background hover:border-foreground/30 text-left transition-all overflow-hidden"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/floor-types/${type}.jpg`}
                    alt={FLOOR_TYPE_LABELS[type]}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <div className="text-base md:text-lg font-extrabold tracking-tight">
                    {FLOOR_TYPE_LABELS[type]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        // Kompaktné pills v rade — fotka 40×40 + meno, aby zostalo miesto na zvyšok
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(FLOOR_TYPE_LABELS) as FloorType[]).map((type) => {
            const active = floorType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => selectFloorType(type)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-2 text-left transition-all",
                  active
                    ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200 shadow-sm"
                    : "border-border bg-background hover:border-foreground/30 hover:bg-muted/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/floor-types/${type}.jpg`}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover shrink-0"
                />
                <span
                  className={cn(
                    "text-sm font-bold tracking-tight",
                    active && "text-sky-800",
                  )}
                >
                  {FLOOR_TYPE_LABELS[type]}
                </span>
              </button>
            );
          })}
        </div>
      )
      )}

      {/* Lokalita + automatická Doprava v jednej karte */}
      {(saleMode === "material" || floorType) && (
        <div className="rounded-2xl border bg-background p-3 flex items-end gap-4 flex-wrap animate-in fade-in duration-300">
          <div className="flex-1 min-w-[220px]">
            <Label
              htmlFor="lokalita"
              className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
            >
              Lokalita zákazky — píš mesto, Tab/Enter potvrdí
            </Label>
            <CityAutocomplete
              id="lokalita"
              value={lokalita}
              onChange={setLokalita}
              onComplete={focusFirstM2}
              placeholder="napr. Bratislava"
              autoFocus
              className="mt-1"
            />
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Doprava
            </div>
            <div className="text-lg font-extrabold text-sky-700 tabular-nums">
              {transport ? formatEur(effectiveTransport) : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Jednofarebná variant toggle — Polyuretán (default) vs Epoxid */}
      {saleMode === "realizacia" && floorType === "jednofarebna" && (
        <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 self-start">
          <button
            type="button"
            onClick={() => setJednofarebnaVariant("polyuretan")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
              jednofarebnaVariant === "polyuretan"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Polyuretán
          </button>
          <button
            type="button"
            onClick={() => setJednofarebnaVariant("epoxid")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
              jednofarebnaVariant === "epoxid"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Epoxid
          </button>
        </div>
      )}

      {/* Operations — visible only after floor type chosen (realizácia mode) */}
      {saleMode === "realizacia" && floorType && (
        <OperationsSection
          floorType={floorType}
          calcs={calcs}
          lines={lines}
          setLines={setLines}
          setRequiredM2={setRequiredM2}
          firstM2Ref={firstM2Ref}
          adminMode={adminMode}
        />
      )}

      {/* Material-only catalog */}
      {saleMode === "material" && (
        <div className="rounded-xl border bg-background overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider">
              Katalóg materiálov
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Marža {Math.round(MARZA_MATERIAL * 100)} %
            </span>
          </div>
          <ul className="divide-y overflow-y-auto">
            {PRODUCT_CATALOG.map((p) => {
              const qty = parseFloat(materialQtys[p.id] ?? "") || 0;
              const sellRate =
                p.sell_by === "package" && p.cost_per_package !== null
                  ? applyMargin(p.cost_per_package, MARZA_MATERIAL)
                  : applyMargin(p.cost_per_kg, MARZA_MATERIAL);
              const lineSell = qty * sellRate;
              const unit = p.sell_by === "package" ? "bal." : "kg";
              const subtitle =
                p.sell_by === "package"
                  ? `${p.package_size_kg} kg / balenie · ${formatEur(sellRate)} / bal.`
                  : `na kg · ${formatEur(sellRate)} / kg`;
              return (
                <li
                  key={p.id}
                  className={cn(
                    "px-4 py-2 flex items-center gap-3",
                    qty > 0 && "bg-sky-50/30",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate inline-flex items-center gap-1.5">
                      {p.name}
                      {p.note && (
                        <span className="text-[9px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                          {p.note}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {subtitle}
                    </div>
                  </div>
                  <div
                    className="inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMaterialQtys((prev) => {
                          const cur = parseFloat(prev[p.id] ?? "") || 0;
                          const next = Math.max(0, cur - 1);
                          return { ...prev, [p.id]: next > 0 ? String(next) : "" };
                        });
                      }}
                      className="w-7 h-7 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
                      aria-label="Menej"
                    >
                      −
                    </button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={p.sell_by === "kg" ? 0.5 : 1}
                      placeholder="0"
                      value={materialQtys[p.id] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMaterialQtys((prev) => ({ ...prev, [p.id]: v }));
                      }}
                      className="h-7 w-14 text-center text-sm font-bold tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setMaterialQtys((prev) => {
                          const cur = parseFloat(prev[p.id] ?? "") || 0;
                          return { ...prev, [p.id]: String(cur + 1) };
                        });
                      }}
                      className="w-7 h-7 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
                      aria-label="Viac"
                    >
                      +
                    </button>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground ml-1 w-8">
                      {unit}
                    </span>
                  </div>
                  <div className="w-24 text-right font-bold tabular-nums text-sm">
                    {lineSell > 0 ? (
                      formatEur(lineSell)
                    ) : (
                      <span className="text-muted-foreground text-xs font-normal">
                        —
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Total bar — visible in oba módy ak je čo počítať */}
      {(saleMode === "material" || floorType) && (
      <div className="rounded-xl border-2 border-sky-500 bg-sky-50 px-4 py-3 mt-auto shrink-0 shadow-lg">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="text-[11px] text-sky-700/80 leading-snug">
            {days > 0 && (
              <div>
                <span className="font-bold">Realizácia:</span> {days}{" "}
                {days === 1 ? "deň" : days < 5 ? "dni" : "dní"}
              </div>
            )}
            {requiredM2Value > 0 && (
              <div>
                <span className="font-bold">Cena/m²:</span>{" "}
                {formatEur(total / requiredM2Value)}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider font-bold text-sky-700">
              Výsledná cena
            </div>
            <div className="text-3xl md:text-4xl font-extrabold text-sky-700 tabular-nums">
              {hasRealInput ? formatEur(total) : "—"}
            </div>
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
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
type LineUpdater = LineState | ((prev: LineState) => LineState);

function updateLineFor(
  setLines: React.Dispatch<React.SetStateAction<Record<string, LineState>>>,
  id: string,
) {
  return (arg: LineUpdater) =>
    setLines((prev) => ({
      ...prev,
      [id]: typeof arg === "function" ? arg(prev[id]) : arg,
    }));
}

function OperationsSection({
  floorType,
  calcs,
  lines,
  setLines,
  setRequiredM2,
  firstM2Ref,
  adminMode,
}: {
  floorType: FloorType;
  calcs: { m: Material; calc: ReturnType<typeof calcLine> | null }[];
  lines: Record<string, LineState>;
  setLines: React.Dispatch<React.SetStateAction<Record<string, LineState>>>;
  setRequiredM2: (value: string) => void;
  firstM2Ref?: React.MutableRefObject<HTMLInputElement | null>;
  adminMode: boolean;
}) {
  // Povinné = vždy súčasť realizácie (non-optional, nie flat-price).
  // Optional = zákazník to nemusí mať (zošívanie, nivelácia).
  // Flat-price = softvér počíta sám, obchodník to v UI nevidí, do PDF/totalu ide normálne.
  const requiredCalcs = calcs.filter(
    (c) => !c.m.optional && true /* flat_price odstránené */,
  );
  const optionalCalcs = calcs.filter((c) => c.m.optional);
  const [optionalOpen, setOptionalOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Povinné — kompaktné karty v rade. m² je synchronizovaný cez setRequiredM2. */}
      <div
        className={cn(
          "grid gap-2",
          requiredCalcs.length === 2 && "md:grid-cols-2",
          requiredCalcs.length === 3 && "md:grid-cols-3",
          requiredCalcs.length === 4 && "md:grid-cols-4",
          requiredCalcs.length >= 5 && "md:grid-cols-5",
        )}
      >
        {requiredCalcs.map(({ m, calc }, idx) => {
          const isLast = idx === requiredCalcs.length - 1;
          return (
            <BigBaseRow
              key={m.id}
              material={m}
              state={lines[m.id]}
              onChange={updateLineFor(setLines, m.id)}
              onSyncedM2Change={setRequiredM2}
              calc={calc}
              inputRef={idx === 0 ? firstM2Ref : undefined}
              onSubmitAdvance={
                isLast ? () => setOptionalOpen(true) : undefined
              }
            />
          );
        })}
      </div>


      {/* Voliteľné — collapsible len ak existujú */}
      {optionalCalcs.length > 0 && (
        <div className="rounded-2xl border bg-background overflow-hidden">
          <button
            type="button"
            onClick={() => setOptionalOpen((o) => !o)}
            className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors text-left"
            aria-expanded={optionalOpen}
          >
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-foreground/70 text-xs font-bold">
                {optionalCalcs.filter((c) => lines[c.m.id]?.enabled).length}
              </span>
              <span className="text-sm font-bold uppercase tracking-wider">
                Voliteľné operácie
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {optionalCalcs.map((c) => c.m.name.split(" ")[0]).join(" · ")}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-muted-foreground transition-transform",
                optionalOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {optionalOpen && (
            <ul className="divide-y border-t">
              {optionalCalcs.map(({ m, calc }) => (
                <LineRow
                  key={m.id}
                  material={m}
                  state={lines[m.id]}
                  onChange={updateLineFor(setLines, m.id)}
                  calc={calc}
                  adminMode={adminMode}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function BigBaseRow({
  material,
  state,
  onChange,
  onSyncedM2Change,
  calc,
  inputRef,
  onSubmitAdvance,
}: {
  material: Material;
  state: LineState;
  onChange: (state: LineUpdater) => void;
  /** Sync m² medzi všetkými povinnými operáciami. Ak je nastavené, m² input ho používa. */
  onSyncedM2Change?: (value: string) => void;
  calc: ReturnType<typeof calcLine> | null;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
  /** Voláme keď user stlačí Enter/Tab v poslednej povinnej karte → otvor voliteľné. */
  onSubmitAdvance?: () => void;
}) {
  // Display name → "Úprava povrchu" / "Penetrácia" bez zátvorky
  const displayName = material.name.split(" (")[0];
  const subtitle = material.name.match(/\(([^)]+)\)/)?.[1];

  // Toggle enabled stav klikom na hlavičku (mimo m² inputu).
  const toggleEnabled = () => {
    onChange((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-2.5 shadow-sm transition-colors",
        state.enabled
          ? "border-sky-300 bg-sky-50/40"
          : "border-dashed border-muted-foreground/30 bg-muted/20",
      )}
    >
      <button
        type="button"
        onClick={toggleEnabled}
        className="w-full flex items-center justify-between gap-2 text-left"
        title={state.enabled ? "Klik pre vypnutie" : "Klik pre zapnutie"}
      >
        <div className="inline-flex items-center gap-1.5 min-w-0">
          {state.enabled ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-bold shrink-0">
              ✓
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground/50 text-[9px] shrink-0">
              +
            </span>
          )}
          <span
            className={cn(
              "text-sm font-extrabold tracking-tight truncate",
              !state.enabled && "text-muted-foreground",
            )}
          >
            {displayName}
          </span>
        </div>
        <div
          className={cn(
            "text-base font-extrabold tabular-nums shrink-0",
            state.enabled ? "text-sky-700" : "text-muted-foreground/40",
          )}
        >
          {state.enabled ? formatEur(calc?.total ?? 0) : "—"}
        </div>
      </button>
      <div
        className="mt-1.5 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          id={`${material.id}-m2`}
          ref={inputRef}
          type="number"
          inputMode="numeric"
          placeholder="m²"
          value={state.m2}
          onFocus={() => {
            if (!state.enabled) onChange((prev) => ({ ...prev, enabled: true }));
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (onSyncedM2Change) {
              onSyncedM2Change(v);
            } else {
              onChange({ ...state, m2: v });
            }
          }}
          onKeyDown={(e) => {
            if (onSubmitAdvance && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              onSubmitAdvance();
            }
          }}
          className={cn(
            "h-9 text-sm font-bold flex-1",
            !state.enabled && "opacity-50",
          )}
        />
        <span className="text-[11px] font-bold text-muted-foreground">m²</span>
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
  onChange: (state: LineUpdater) => void;
  calc: ReturnType<typeof calcLine> | null;
  adminMode: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // Klik kdekoľvek do riadka prepne enabled (toggle). Funkčný update aby
  // čítal aktuálny state.
  const handleRowClick = () => {
    onChange((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  // Auto-enable keď focusneš input alebo začneš písať
  const ensureEnabled = () => {
    onChange((prev) => (prev.enabled ? prev : { ...prev, enabled: true }));
  };

  return (
    <li
      onClick={handleRowClick}
      className={cn(
        "cursor-pointer transition-colors",
        state.enabled
          ? "bg-sky-50/30 hover:bg-sky-50/60"
          : "bg-background hover:bg-sky-50/40 opacity-80 hover:opacity-100",
      )}
    >
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold inline-flex items-center gap-2 flex-wrap">
            {state.enabled ? (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] font-bold shrink-0">
                ✓
              </span>
            ) : (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground/50 text-[10px] shrink-0">
                +
              </span>
            )}
            {material.name}
            {material.optional && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                voliteľné
              </span>
            )}
          </div>
        </div>

        {/* m² + mm inputy.  Klik / focus / type auto-enabne. */}
        {material.unit !== "count" && (
            <>
              <div className="w-24" onClick={(e) => e.stopPropagation()}>
                <Input
                  type="number"
                  placeholder="m²"
                  value={state.m2}
                  onFocus={ensureEnabled}
                  onChange={(e) => {
                    ensureEnabled();
                    onChange({ ...state, m2: e.target.value, enabled: true });
                  }}
                  className="h-9 text-sm"
                />
              </div>

              {material.unit === "level" && (
                <div
                  className="inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={material.min_mm ?? 0}
                    step={1}
                    placeholder="mm"
                    value={state.mm}
                    onFocus={ensureEnabled}
                    onChange={(e) => {
                      ensureEnabled();
                      onChange({
                        ...state,
                        mm: e.target.value,
                        enabled: true,
                      });
                    }}
                    onBlur={(e) => {
                      // Clamp na minimum pri blure (napr. 4 mm pre nivelaciu)
                      const v = parseFloat(e.target.value) || 0;
                      const minMm = material.min_mm ?? 0;
                      if (v < minMm) {
                        onChange((prev) => ({ ...prev, mm: String(minMm) }));
                      }
                    }}
                    className="h-9 w-16 text-sm text-center font-bold"
                  />
                  <span className="text-[10px] font-bold text-muted-foreground">
                    mm
                  </span>
                  {material.min_mm != null && (
                    <span
                      className="text-[9px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
                      title={`Minimum ${material.min_mm} mm (pod ${material.min_mm} mm vrstva praská)`}
                    >
                      min {material.min_mm}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

        {/* Counter +/- pri unit="count" (napr. počet prasklín pre Zosívanie). */}
        {material.unit === "count" && (
          <div
            className="inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange((prev) => {
                  const cur = Math.max(0, Math.floor(parseFloat(prev.m2) || 0));
                  const next = Math.max(0, cur - 1);
                  return {
                    ...prev,
                    m2: String(next),
                    enabled: next > 0 ? true : prev.enabled,
                  };
                });
              }}
              className="w-8 h-8 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
              aria-label="Menej"
            >
              −
            </button>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={state.m2}
              onFocus={ensureEnabled}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                onChange((prev) => ({
                  ...prev,
                  m2: v,
                  enabled: parseInt(v || "0") > 0,
                }));
              }}
              className="h-8 w-14 text-center text-sm font-bold tabular-nums"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange((prev) => {
                  const cur = Math.max(0, Math.floor(parseFloat(prev.m2) || 0));
                  return {
                    ...prev,
                    m2: String(cur + 1),
                    enabled: true,
                  };
                });
              }}
              className="w-8 h-8 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
              aria-label="Viac"
            >
              +
            </button>
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground ml-1">
              {material.unit_label ?? "ks"}
              {material.price_per_unit
                ? ` · ${formatEur(material.price_per_unit)}/ks`
                : ""}
            </span>
          </div>
        )}

        {/* Total per riadok — obchodník vidí len totál, žiadny material/práca breakdown */}
        <div className="w-28 text-right tabular-nums">
          {calc ? (
            <div className="font-bold">{formatEur(calc.total)}</div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>

        {adminMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Expand admin fields"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Admin row (readonly preview sadzieb — sadzby sú už finálne). */}
      {adminMode && expanded && (
        <div className="px-5 py-3 bg-muted/20 border-t text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field
            label="Sadzba"
            value={
              material.unit === "count"
                ? `${formatEur(material.price_per_unit ?? 0)} / ks`
                : `${formatEur(material.price_per_sqm)} / m²`
            }
          />
          <Field label="Variant" value={material.variant ?? "—"} />
          <Field
            label="Default"
            value={
              material.default_enabled === false
                ? "vypnuté"
                : material.default_enabled === true || !material.optional
                  ? "zapnuté"
                  : "vypnuté"
            }
          />
          <Field
            label="Typ"
            value={material.optional ? "voliteľná" : "povinná"}
          />
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
