"use client";

import * as React from "react";
import { ChevronDown, Loader2, Percent, Plus, Save, Trash2 } from "lucide-react";
import { saveSettingV2 } from "@/app/admin/settings/actions";
import { FLOOR_TYPE_LABELS, type FloorType } from "@/lib/data/materials";

type SystemInfo = {
  code: string;
  label: string;
  floor_type: string;
  binder: string | null;
};
type Setting = { key: string; value: unknown };

const FLOORS: FloorType[] = [
  "jednofarebna",
  "chipsova",
  "mramorova",
  "metalicka",
];

const HARDCODED_DEFAULT: Record<FloorType, string> = {
  jednofarebna: "264",
  chipsova: "264-chip",
  mramorova: "topstopne",
  metalicka: "topstopne-m",
};

type VolumeTier = { min_m2: number; discount_pct: number };
const HARDCODED_TIERS: VolumeTier[] = [
  { min_m2: 100, discount_pct: 3 },
  { min_m2: 300, discount_pct: 6 },
  { min_m2: 500, discount_pct: 10 },
  { min_m2: 1000, discount_pct: 15 },
];

const MARKUP_KEYS: Array<{ key: string; label: string; desc: string }> = [
  { key: "margin.material", label: "Materiálová marža (default)", desc: "0.37 = 37 %" },
  { key: "markup.primer", label: "Markup — primer", desc: "0.0–0.99" },
  { key: "markup.main", label: "Markup — hlavná živica", desc: "0.0–0.99" },
  { key: "markup.topcoat", label: "Markup — vrchný lak", desc: "0.0–0.99" },
  { key: "markup.additive", label: "Markup — chipsy/piesok", desc: "0.0–0.99" },
  { key: "markup.transport", label: "Markup — doprava", desc: "0.0–0.99" },
];

export function GeneratorNastaveniaClient({
  systems,
  settings,
}: {
  systems: SystemInfo[];
  settings: Setting[];
}) {
  const settingsMap = React.useMemo(() => {
    const m: Record<string, unknown> = {};
    for (const s of settings) m[s.key] = s.value;
    return m;
  }, [settings]);

  return (
    <div className="space-y-4">
      <MinOrderSection settingsMap={settingsMap} />
      <VolumeDiscountsSection settingsMap={settingsMap} />
      <FirmaSection settingsMap={settingsMap} />
      <DopravaSection settingsMap={settingsMap} />
      <EmailPreviewSection settingsMap={settingsMap} />
      {/* Defaultne systemy per typ podlahy — user 2026-07-18: „dajme to
          uplne na spodok a ako dropdown ze sa da otvarat a zatvarat". */}
      <DefaultSystemsSection systems={systems} settingsMap={settingsMap} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Firma — údaje pre PDF hlavičky, e-mailové podpisy
// ═══════════════════════════════════════════════════════════════════════
const FIRMA_KEYS: Array<{ key: string; label: string; desc: string }> = [
  { key: "company.name", label: "Firma — názov", desc: "PDF hlavička + email subject" },
  { key: "company.address", label: "Firma — adresa sídla", desc: "PDF pätka" },
  { key: "company.ico", label: "Firma — IČO", desc: "PDF pätka" },
  { key: "company.dic", label: "Firma — DIČ", desc: "PDF pätka" },
  { key: "company.web", label: "Firma — web", desc: "PDF + e-mail" },
  { key: "company.slogan_pdf", label: "PDF slogan", desc: "Text pod logom v PDF" },
  { key: "email.brand_name", label: "E-mail — brand meno", desc: "Meno odosielateľa" },
  { key: "pdf.footer_note", label: "PDF footer nota", desc: "Vždy v spodnej časti PDF" },
];

function FirmaSection({ settingsMap }: { settingsMap: Record<string, unknown> }) {
  return (
    <CollapsibleSection
      title="🏢 Firma (PDF + e-mail brand)"
      desc="Firemné údaje ktoré sa vyskladajú do hlavičky/pätky PDF cenovej ponuky a do e-mailových podpisov."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FIRMA_KEYS.map((f) => (
          <TextSettingRow
            key={f.key}
            settingKey={f.key}
            label={f.label}
            desc={f.desc}
            current={settingsMap[f.key]}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function CollapsibleSection({
  title,
  desc,
  children,
  defaultOpen = false,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      <summary className="cursor-pointer list-none px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center gap-3 select-none">
        <span className="text-slate-500 group-open:rotate-90 transition-transform text-sm">
          ▶
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-black tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>
    </details>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Doprava — sadzby km, rezerva, priemerná rýchlosť
// ═══════════════════════════════════════════════════════════════════════
const DOPRAVA_KEYS: Array<{
  key: string;
  label: string;
  desc: string;
  unit?: string;
  step?: string;
}> = [
  { key: "transport.hq_name", label: "Sídlo firmy (mesto)", desc: "Východisková obec pre výpočet km" },
  { key: "transport.startup_fee_eur", label: "Fixný startup fee", desc: "Za jednu jazdu (nakládka, papier, parking)", unit: "€", step: "1" },
  { key: "transport.petrol_per_km", label: "Benzín / km", desc: "napr. 10 L/100 km × 1.60 €/L = 0.16", unit: "€", step: "0.01" },
  { key: "transport.amortization_per_km", label: "Amortizácia / km", desc: "depreciácia + servis + pneu + poistka", unit: "€", step: "0.01" },
  { key: "transport.avg_speed_kmh", label: "Priemerná rýchlosť", desc: "km/h — used na časový výpočet", unit: "km/h", step: "1" },
  { key: "transport.reserve_min", label: "Rezerva času", desc: "minúty na variabilitu trasy", unit: "min", step: "5" },
  { key: "transport.m2_per_day", label: "m² / robotnícky deň", desc: "priemerná realizácia denne", unit: "m²", step: "1" },
  { key: "delivery.min", label: "Doprava — minimum", desc: "Minimálna suma za dopravu", unit: "€", step: "1" },
  { key: "delivery.per_km", label: "Doprava — sadzba za km", desc: "Alternatívna finálna sadzba (legacy)", unit: "€", step: "0.01" },
];

function DopravaSection({ settingsMap }: { settingsMap: Record<string, unknown> }) {
  return (
    <CollapsibleSection
      title="🚗 Doprava"
      desc="Sadzby ktoré generátor CP použije na výpočet dopravy podľa vzdialenosti od HQ do mesta zákazníka."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DOPRAVA_KEYS.map((d) => (
          <TextSettingRow
            key={d.key}
            settingKey={d.key}
            label={d.label}
            desc={d.desc}
            current={settingsMap[d.key]}
            unit={d.unit}
            numeric={d.step != null}
            step={d.step}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// City km calculator — obchodákovi ukáže preview dopravy
// ═══════════════════════════════════════════════════════════════════════
function CityKmCalcSection() {
  const [city, setCity] = React.useState("Bratislava");
  const [result, setResult] = React.useState<{
    km: number | null;
    startup: number;
    petrol: number;
    amort: number;
    total: number;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function calc() {
    setBusy(true);
    try {
      const { getCityDistanceKm, calcTransport } = await import(
        "@/lib/data/transport"
      );
      const km = getCityDistanceKm(city);
      if (km == null) {
        setResult({ km: null, startup: 0, petrol: 0, amort: 0, total: 0 });
      } else {
        const c = calcTransport(km);
        setResult({
          km: km,
          startup: 20,
          petrol: c.petrol_eur,
          amort: c.amortization_eur,
          total: c.total_eur,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-black tracking-tight">
          📍 Kalkulačka dopravy (preview)
        </h2>
        <p className="text-xs text-muted-foreground">
          Napíš mesto a klikni „Prepočítať" — ukáže ti akú sumu za dopravu
          vidí obchodák v generátori CP. Používa aktuálne uložené sadzby +
          hardcoded distance mapu (~4600 obcí + hlavné mestá).
        </p>
      </header>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Napr. Bratislava"
          className="h-9 flex-1 min-w-[180px] px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
        />
        <button
          type="button"
          onClick={calc}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-black px-3 py-1.5 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Prepočítať
        </button>
      </div>
      {result && (
        <div
          className={
            "rounded-lg border p-3 text-xs " +
            (result.km == null
              ? "border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300"
              : "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200")
          }
        >
          {result.km == null ? (
            <div>
              Mesto „<strong>{city}</strong>" nie je v hardcoded databáze.
              Obchodák zadá km ručne.
            </div>
          ) : (
            <div className="tabular-nums space-y-1">
              <div>
                Vzdialenosť z Ružomberka:{" "}
                <strong>{result.km} km</strong> (jedna strana){" "}
                <span className="opacity-70">
                  = {result.km * 2} km round-trip
                </span>
              </div>
              <div>Startup fee: {result.startup.toFixed(2)} €</div>
              <div>Benzín: {result.petrol.toFixed(2)} €</div>
              <div>Amortizácia: {result.amort.toFixed(2)} €</div>
              <div className="pt-1 border-t border-emerald-300 dark:border-emerald-800 font-black">
                Doprava SPOLU: {result.total.toFixed(2)} €
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// E-mail preview — ako vyzerá odoslaná ponuka
// ═══════════════════════════════════════════════════════════════════════
function EmailPreviewSection({
  settingsMap,
}: {
  settingsMap: Record<string, unknown>;
}) {
  const brand =
    String(settingsMap["email.brand_name"] ?? "") ||
    String(settingsMap["company.name"] ?? "") ||
    "EPOXIDOVO";
  const web = String(settingsMap["company.web"] ?? "epoxidovo.sk");
  const footer = String(settingsMap["pdf.footer_note"] ?? "Ďakujeme za dôveru.");
  const [showPreview, setShowPreview] = React.useState(false);

  return (
    <CollapsibleSection
      title="📧 Preview e-mailu + PDF prílohy"
      desc="Tak vyzerá e-mail ktorý obchodák pošle zákazníkovi cez generátor CP. Zmeny vo Firma sekcii sa premietnu do brandu."
    >
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-black px-3 py-1.5"
        >
          {showPreview ? "Skryť preview" : "Zobraziť e-mail preview"}
        </button>
        <a
          href="/generator?demo=jednofarebna-dom"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border-2 border-sky-500 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 text-xs font-black px-3 py-1.5"
        >
          Otvoriť generator (demo) →
        </a>
      </div>

      {showPreview && (
        <div className="rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 overflow-hidden">
          {/* E-mail header */}
          <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 p-3 text-[11px] space-y-0.5">
            <div>
              <span className="font-black">From:</span> {brand} &lt;info@
              {web}&gt;
            </div>
            <div>
              <span className="font-black">To:</span> jozef.zakaznik@example.sk
            </div>
            <div>
              <span className="font-black">Subject:</span> Cenová ponuka —
              Epoxidová podlaha 60 m² · {brand}
            </div>
          </div>
          {/* Body preview */}
          <div className="p-4 bg-white dark:bg-slate-900 text-sm space-y-3">
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">
              Dobrý deň Jozef,
            </div>
            <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
              posielame Vám cenovú ponuku pre epoxidovú podlahu 60 m² podľa
              požiadaviek z formulára na {web}.
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Farebný náter (polyuretán 60 m²)</span>
                <span className="tabular-nums font-black">2 820.00 €</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Penetrácia + Úprava povrchu (60 m²)</span>
                <span className="tabular-nums font-black">1 200.00 €</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Doprava (Bratislava, 250 km)</span>
                <span className="tabular-nums font-black">175.00 €</span>
              </div>
              <div className="border-t border-slate-300 dark:border-slate-700 pt-1 flex justify-between font-black">
                <span>SPOLU (bez DPH)</span>
                <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  4 195.00 €
                </span>
              </div>
            </div>
            <div className="text-slate-700 dark:text-slate-300 text-xs">
              Kompletná cenová ponuka s technickými detailmi je v prílohe (PDF).
            </div>
            <div className="text-slate-700 dark:text-slate-300 text-xs italic">
              📎 CP_Jozef_Zakaznik_2026-07-18.pdf (152 KB)
            </div>
            <div className="border-t border-slate-300 dark:border-slate-700 pt-3 text-[11px] text-muted-foreground">
              {footer}
              <br />
              {brand} · {web}
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Reusable text/number setting row
// ═══════════════════════════════════════════════════════════════════════
function TextSettingRow({
  settingKey,
  label,
  desc,
  current,
  unit,
  numeric,
  step,
}: {
  settingKey: string;
  label: string;
  desc: string;
  current: unknown;
  unit?: string;
  numeric?: boolean;
  step?: string;
}) {
  const initial =
    typeof current === "number" ? String(current) : String(current ?? "");
  const [val, setVal] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await saveSettingV2(settingKey, val.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-2.5">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type={numeric ? "number" : "text"}
          step={step}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="prázdne = default"
          className={
            "h-9 flex-1 min-w-0 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold " +
            (numeric ? "tabular-nums text-right" : "")
          }
        />
        {unit && (
          <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={
            "inline-flex items-center gap-1 rounded-md text-white text-xs font-black px-2.5 py-1.5 disabled:opacity-40 " +
            (saved ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700")
          }
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "OK" : "Uložiť"}
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 italic">
        {desc}
      </div>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Minimálna objednávka + noise (1001.50 – 1028.50 €)
// ═══════════════════════════════════════════════════════════════════════
function MinOrderSection({
  settingsMap,
}: {
  settingsMap: Record<string, unknown>;
}) {
  const currentMin = (() => {
    const raw = settingsMap["generator.min_order_eur"];
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    return isFinite(n) && n >= 0 ? n : 1000;
  })();
  const currentNoiseMax = (() => {
    const raw = settingsMap["generator.min_order_noise_max"];
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    return isFinite(n) && n >= 0 ? n : 27;
  })();
  const [minVal, setMinVal] = React.useState(String(currentMin));
  const [noiseVal, setNoiseVal] = React.useState(String(currentNoiseMax));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const previewLow =
    parseFloat(minVal) + 1.5 || 0;
  const previewHigh =
    parseFloat(minVal) + 1.5 + (parseFloat(noiseVal) || 0);

  async function save() {
    if (minVal.trim()) {
      const n = parseFloat(minVal);
      if (!isFinite(n) || n < 0) {
        alert("Minimálna objednávka musí byť kladné číslo alebo prázdne.");
        return;
      }
    }
    if (noiseVal.trim()) {
      const n = parseFloat(noiseVal);
      if (!isFinite(n) || n < 0) {
        alert("Noise range musí byť kladné číslo alebo prázdne.");
        return;
      }
    }
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        saveSettingV2("generator.min_order_eur", minVal.trim()),
        saveSettingV2("generator.min_order_noise_max", noiseVal.trim()),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      title="🧮 Minimálna objednávka"
      desc="Ak by cena zákazky vyšla pod túto hodnotu, generátor CP ju automaticky vyfúkne (1001.50 – 1028.50 €). Neguľate čísla pôsobia dôveryhodnejšie. Neplatí pre manuálne CP."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Minimálna cena (€)
          </div>
          <input
            type="number"
            step="10"
            min="0"
            value={minVal}
            onChange={(e) => setMinVal(e.target.value)}
            placeholder="1000"
            className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums text-right"
          />
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Prázdne = default 1000 €
          </div>
        </label>
        <label className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Noise range (€)
          </div>
          <input
            type="number"
            step="1"
            min="0"
            value={noiseVal}
            onChange={(e) => setNoiseVal(e.target.value)}
            placeholder="27"
            className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums text-right"
          />
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Prázdne = default 27 (rozsah 1001.50 – 1028.50)
          </div>
        </label>
      </div>
      {isFinite(previewLow) && previewHigh > previewLow && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2 text-xs font-black text-emerald-800 dark:text-emerald-200 tabular-nums">
          Preview: každá zákazka pod minimom sa vyfúkne na{" "}
          {previewLow.toFixed(2)} – {previewHigh.toFixed(2)} €
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={
            "inline-flex items-center gap-1 rounded-md text-white text-xs font-black px-3 py-1.5 disabled:opacity-40 " +
            (saved ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700")
          }
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "Uložené" : "Uložiť"}
        </button>
      </div>
    </CollapsibleSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Defaultné systémy per typ podlahy
// ═══════════════════════════════════════════════════════════════════════
function DefaultSystemsSection({
  systems,
  settingsMap,
}: {
  systems: SystemInfo[];
  settingsMap: Record<string, unknown>;
}) {
  return (
    <CollapsibleSection
      title="🎯 Defaultné systémy per typ podlahy"
      desc="Ktorý systém sa automaticky vyberie v Generátori CP keď obchodák klikne na typ podlahy. 95 % zákaziek → default, obchodák prepne manuálne ak zákazník chce iný."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FLOORS.map((ft) => (
          <DefaultSystemRow
            key={ft}
            floorType={ft}
            systems={systems.filter((s) => s.floor_type === ft)}
            currentValue={
              (settingsMap[`generator.default_system.${ft}`] as string) ??
              HARDCODED_DEFAULT[ft]
            }
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function DefaultSystemRow({
  floorType,
  systems,
  currentValue,
}: {
  floorType: FloorType;
  systems: SystemInfo[];
  currentValue: string;
}) {
  const [val, setVal] = React.useState(currentValue);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await saveSettingV2(`generator.default_system.${floorType}`, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3">
      <div className="flex items-center gap-3 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/floor-types/${floorType}.jpg`}
          alt=""
          className="w-10 h-10 rounded-md object-cover"
          loading="lazy"
        />
        <div>
          <div className="text-sm font-black">{FLOOR_TYPE_LABELS[floorType]}</div>
          <div className="text-[10px] text-muted-foreground">
            Aktuálny default: <span className="font-mono">{currentValue}</span>
          </div>
        </div>
      </div>
      <div className="flex items-stretch gap-1.5">
        {/* Custom select — appearance-none + vlastna sipka aby native
            chevron nepreliezal cez border. User 2026-07-18: „TA SIPKA
            PREKRACUJE SKORO CEZ TO POLE KDE MA BYT". padding-right
            necha priestor pre <ChevronDown/> ktora sa da centrovat. */}
        <div className="relative flex-1 min-w-0">
          <select
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="h-10 w-full appearance-none pl-2 pr-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold cursor-pointer"
          >
            {systems.length === 0 && <option value="">(žiadne systémy)</option>}
            {systems.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
                {s.binder ? ` · ${s.binder}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown
            className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            aria-hidden
          />
        </div>
        {/* Button h-10 aby matchol select (predtym py-1.5 = ~28px, select
            bol 36px → button vysednutel dole; user 2026-07-18: „A TO
            ULOZIT JE MENSIE AKO TO POLE S TYM MENOM PRECO"). */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={
            "h-10 inline-flex items-center gap-1 rounded-md text-white text-xs font-black px-3 shrink-0 disabled:opacity-40 " +
            (saved ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700")
          }
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "OK" : "Uložiť"}
        </button>
      </div>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Množstevné zľavy — konfigurovateľné tiers
// ═══════════════════════════════════════════════════════════════════════
function parseTiers(raw: unknown): VolumeTier[] {
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j))
        return j.filter(
          (t) =>
            typeof t.min_m2 === "number" && typeof t.discount_pct === "number",
        );
    } catch {
      /* fallthrough */
    }
  } else if (Array.isArray(raw)) {
    return raw.filter(
      (t) => typeof t.min_m2 === "number" && typeof t.discount_pct === "number",
    );
  }
  return HARDCODED_TIERS;
}

function VolumeDiscountsSection({
  settingsMap,
}: {
  settingsMap: Record<string, unknown>;
}) {
  const initial = parseTiers(settingsMap["generator.volume_tiers"]);
  const [tiers, setTiers] = React.useState<VolumeTier[]>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  function updateTier(i: number, patch: Partial<VolumeTier>) {
    setTiers((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addTier() {
    const last = tiers[tiers.length - 1] ?? { min_m2: 0, discount_pct: 0 };
    setTiers((prev) => [
      ...prev,
      { min_m2: last.min_m2 + 100, discount_pct: last.discount_pct + 3 },
    ]);
  }

  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const sorted = [...tiers].sort((a, b) => a.min_m2 - b.min_m2);
      await saveSettingV2(
        "generator.volume_tiers",
        JSON.stringify(sorted),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!confirm("Vrátiť na hardcoded default tiers (100→3 %, 300→6 %, 500→10 %, 1000→15 %)?"))
      return;
    setTiers(HARDCODED_TIERS);
    setSaving(true);
    try {
      await saveSettingV2("generator.volume_tiers", "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      title="📉 Množstevné zľavy (Volume tiers)"
      desc="Automaticky sa aplikujú v Generátori CP podľa plochy m². Aplikujú sa na subtotal (pred manuálnou Špeciálnou zľavou). Nie na dopravu."
    >
      <ul className="space-y-1.5">
        {tiers.map((t, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2"
          >
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground w-10">
              Tier {i + 1}
            </span>
            <span className="text-xs">od</span>
            <input
              type="number"
              min="0"
              step="10"
              value={t.min_m2}
              onChange={(e) =>
                updateTier(i, { min_m2: parseInt(e.target.value) || 0 })
              }
              className="h-8 w-20 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums text-right"
            />
            <span className="text-xs">m² →</span>
            <input
              type="number"
              min="0"
              max="99"
              step="0.5"
              value={t.discount_pct}
              onChange={(e) =>
                updateTier(i, {
                  discount_pct: parseFloat(e.target.value) || 0,
                })
              }
              className="h-8 w-16 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums text-right"
            />
            <span className="text-xs">%</span>
            <button
              type="button"
              onClick={() => removeTier(i)}
              className="ml-auto text-rose-600 hover:text-rose-800 px-2 py-1"
              title="Zmazať tier"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addTier}
          className="inline-flex items-center gap-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black px-2.5 py-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Pridať tier
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={
            "inline-flex items-center gap-1 rounded-md text-white text-xs font-black px-3 py-1.5 disabled:opacity-40 " +
            (saved ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700")
          }
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "Uložené" : "Uložiť všetky tiers"}
        </button>
        <button
          type="button"
          onClick={resetDefault}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1.5"
        >
          Reset default
        </button>
      </div>
    </CollapsibleSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Markupy / Marže (deprecated — user 2026-07-18: „prec toto je uz v
//    materialoch"). Nechávam function definíciu bez použitia.
// ═══════════════════════════════════════════════════════════════════════
function MarkupsSection({
  settingsMap,
}: {
  settingsMap: Record<string, unknown>;
}) {
  return (
    <section className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-black tracking-tight">
          <Percent className="w-4 h-4 inline mr-1 text-amber-600" aria-hidden />
          Marža / Markupy (per rola produktu)
        </h2>
        <p className="text-xs text-muted-foreground">
          Vyjadrené ako podiel 0.0–0.99 (napr. 0.37 = 37 % marža na materiál).
          Používa sa v režime „Iba materiál + doprava" v Generátori CP.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MARKUP_KEYS.map((m) => (
          <MarkupRow
            key={m.key}
            settingKey={m.key}
            label={m.label}
            desc={m.desc}
            current={settingsMap[m.key]}
          />
        ))}
      </div>
    </section>
  );
}

function MarkupRow({
  settingKey,
  label,
  desc,
  current,
}: {
  settingKey: string;
  label: string;
  desc: string;
  current: unknown;
}) {
  const initial =
    typeof current === "number" ? String(current) : String(current ?? "");
  const [val, setVal] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function save() {
    if (val.trim()) {
      const n = parseFloat(val);
      if (!isFinite(n) || n < 0 || n >= 1) {
        alert(`${label}: hodnota musí byť 0.0 – 0.99.`);
        return;
      }
    }
    setSaving(true);
    setSaved(false);
    try {
      await saveSettingV2(settingKey, val.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-2.5">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step="0.01"
          min="0"
          max="0.99"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="prázdne = default"
          className="h-9 flex-1 min-w-0 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums text-right"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={
            "inline-flex items-center gap-1 rounded-md text-white text-xs font-black px-2.5 py-1.5 disabled:opacity-40 " +
            (saved ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700")
          }
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "OK" : "Uložiť"}
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 italic">
        {desc}
      </div>
    </label>
  );
}
