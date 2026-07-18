"use client";

import * as React from "react";
import { Loader2, Percent, Plus, Save, Trash2 } from "lucide-react";
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
      <DefaultSystemsSection systems={systems} settingsMap={settingsMap} />
      <MinOrderSection settingsMap={settingsMap} />
      <VolumeDiscountsSection settingsMap={settingsMap} />
      <MarkupsSection settingsMap={settingsMap} />
    </div>
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
    <section className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-black tracking-tight">
          🧮 Minimálna objednávka
        </h2>
        <p className="text-xs text-muted-foreground">
          Ak by cena zákazky vyšla pod túto hodnotu, generátor CP ju
          automaticky vyfúkne pridaním „dopravy" tak, aby cena bola
          nezvyčajne vyzerajúca (1001.50 – 1028.50 €) — neguľate čísla
          pôsobia dôveryhodnejšie než guľatých 1000 €. Deterministické z
          hash-u vstupu (rovnaký lead = rovnaké číslo).
        </p>
        <p className="text-xs text-muted-foreground mt-1 italic">
          Pravidlo neplatí pre manuálne CP (bez m² plochy, iba surcharge).
        </p>
      </header>
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
    </section>
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
    <section className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-black tracking-tight">
          🎯 Defaultné systémy per typ podlahy
        </h2>
        <p className="text-xs text-muted-foreground">
          Ktorý systém sa automaticky vyberie v Generátori CP keď obchodák
          klikne na typ podlahy. 95 % zákaziek → default, obchodák prepne
          manuálne ak zákazník chce iný.
        </p>
      </header>
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
    </section>
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
      <div className="flex items-center gap-1.5">
        <select
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-9 flex-1 min-w-0 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
        >
          {systems.length === 0 && <option value="">(žiadne systémy)</option>}
          {systems.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
              {s.binder ? ` · ${s.binder}` : ""}
            </option>
          ))}
        </select>
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
    <section className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <header>
        <h2 className="text-lg font-black tracking-tight">
          📉 Množstevné zľavy (Volume tiers)
        </h2>
        <p className="text-xs text-muted-foreground">
          Automaticky sa aplikujú v Generátori CP podľa plochy m². Aplikujú
          sa na subtotal (pred manuálnou Špeciálnou zľavou). Nie na dopravu.
        </p>
      </header>
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
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Markupy / Marže
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
