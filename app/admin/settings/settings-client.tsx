"use client";

import * as React from "react";
import { Search, X, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveMaterialPriceAction, resetMaterialPriceAction, saveSettingAction } from "./actions";

interface MaterialView {
  id: string;
  floor_type: string;
  name: string;
  unit: string;
  variant: string | null;
  optional: boolean;
  hidden_in_pdf: boolean;
  requires_custom_label: boolean;
  original_price_per_sqm: number;
  original_price_per_unit: number | null;
  original_price_per_sqm_per_mm: number | null;
  effective_price_per_sqm: number;
  effective_price_per_unit: number | null;
  effective_price_per_sqm_per_mm: number | null;
  is_overridden: boolean;
  override_updated_at: string | null;
  unit_label: string | null;
}

interface SettingView {
  key: string;
  value: unknown;
  label: string;
  description: string | null;
  updated_at: string;
}

const FLOOR_LABELS: Record<string, string> = {
  jednofarebna: "Jednofarebná",
  chipsova: "Chipsová",
  mramorova: "Mramorová",
  metalicka: "Metalická",
};

const FLOOR_COLORS: Record<string, string> = {
  jednofarebna: "bg-sky-100 text-sky-800",
  chipsova: "bg-amber-100 text-amber-800",
  mramorova: "bg-violet-100 text-violet-800",
  metalicka: "bg-emerald-100 text-emerald-800",
};

export function SettingsClient({
  activeTab,
  materials,
  settings,
}: {
  activeTab: string;
  materials: MaterialView[];
  settings: SettingView[];
}) {
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b flex gap-1 -mb-px flex-wrap">
        <TabLink id="materials" active={activeTab} label="Materiály & cenník" count={materials.length} />
        <TabLink id="markups" active={activeTab} label="Marže materiálov" count={settings.filter(s => s.key.startsWith("markup.")).length} />
        <TabLink id="global" active={activeTab} label="Ostatné (DPH, doprava, min. zákazka)" count={settings.filter(s => !s.key.startsWith("markup.")).length} />
      </div>

      {activeTab === "materials" && <MaterialsTab materials={materials} />}
      {activeTab === "markups" && <MarkupsTab settings={settings.filter(s => s.key.startsWith("markup.") || s.key === "margin.material")} />}
      {activeTab === "global" && <GlobalTab settings={settings.filter(s => !s.key.startsWith("markup.") && s.key !== "margin.material")} />}
    </div>
  );
}

function TabLink({ id, active, label, count }: { id: string; active: string; label: string; count: number }) {
  const isActive = active === id;
  return (
    <a
      href={`?tab=${id}`}
      className={cn(
        "px-4 py-2 text-sm font-bold border-b-2 transition-colors",
        isActive
          ? "border-sky-500 text-sky-700"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}{" "}
      <span className="ml-1 text-xs font-normal opacity-70 tabular-nums">
        ({count})
      </span>
    </a>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MATERIALS TAB
// ══════════════════════════════════════════════════════════════════════

function MaterialsTab({ materials }: { materials: MaterialView[] }) {
  const [search, setSearch] = React.useState("");
  const [floorFilter, setFloorFilter] = React.useState<string>("all");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (floorFilter !== "all" && m.floor_type !== floorFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.variant ?? "").toLowerCase().includes(q) ||
        (FLOOR_LABELS[m.floor_type] ?? m.floor_type).toLowerCase().includes(q)
      );
    });
  }, [materials, search, floorFilter]);

  const overriddenCount = materials.filter((m) => m.is_overridden).length;

  return (
    <div className="space-y-3">
      {/* Search + filter */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať materiál (napr. epoxid, lak, chipsy, penetrácia…)"
            className="w-full rounded-lg border-2 bg-background pl-9 pr-9 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Vymazať"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          className="rounded-lg border-2 bg-background px-3 py-2 text-sm font-semibold focus:border-sky-500 focus:outline-none"
        >
          <option value="all">Všetky typy podlahy</option>
          <option value="jednofarebna">🎨 Jednofarebná</option>
          <option value="chipsova">🎨 Chipsová</option>
          <option value="mramorova">🎨 Mramorová</option>
          <option value="metalicka">🎨 Metalická</option>
        </select>
      </div>

      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <span>
          Zobrazených: <strong>{filtered.length}</strong> / {materials.length}
        </span>
        {overriddenCount > 0 && (
          <span className="text-amber-700 font-semibold">
            ✏️ Prepísaných cien: {overriddenCount}
          </span>
        )}
      </div>

      {/* Materials table */}
      <div className="overflow-auto border-2 rounded-xl max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
              <th className="text-left px-3 py-2 w-32">Typ</th>
              <th className="text-left px-3 py-2">Názov</th>
              <th className="text-left px-3 py-2 w-20">Variant</th>
              <th className="text-right px-3 py-2 w-40">Cena</th>
              <th className="text-right px-3 py-2 w-24">Akcie</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((m) => (
              <MaterialRow key={m.id} m={m} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center p-6 text-muted-foreground italic">
                  Nič nenájdené pre „{search}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaterialRow({ m }: { m: MaterialView }) {
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  // Ktoré price field je relevantné pre tento material
  const priceField =
    m.unit === "count"
      ? "price_per_unit"
      : m.unit === "level"
        ? "price_per_sqm_per_mm"
        : "price_per_sqm";
  const priceLabel =
    m.unit === "count"
      ? `€/${m.unit_label ?? "ks"}`
      : m.unit === "level"
        ? "€/m²/mm"
        : "€/m²";
  const originalPrice =
    m.unit === "count"
      ? m.original_price_per_unit
      : m.unit === "level"
        ? m.original_price_per_sqm_per_mm
        : m.original_price_per_sqm;
  const effectivePrice =
    m.unit === "count"
      ? m.effective_price_per_unit
      : m.unit === "level"
        ? m.effective_price_per_sqm_per_mm
        : m.effective_price_per_sqm;

  const [inputValue, setInputValue] = React.useState(String(effectivePrice ?? ""));

  return (
    <tr className={cn("hover:bg-sky-50/50", m.is_overridden && "bg-amber-50/40")}>
      <td className="px-3 py-2">
        <span
          className={cn(
            "inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
            FLOOR_COLORS[m.floor_type] ?? "bg-slate-100",
          )}
        >
          {FLOOR_LABELS[m.floor_type] ?? m.floor_type}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="font-semibold">{m.name}</div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {m.id}
          {m.hidden_in_pdf && (
            <span className="ml-2 text-amber-700 font-bold">🙈 skrytý v PDF</span>
          )}
          {m.optional && (
            <span className="ml-2 text-sky-700">voliteľné</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground italic">
        {m.variant ?? "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <form
            action={async (fd) => {
              setPending(true);
              try {
                await saveMaterialPriceAction(fd);
              } finally {
                setPending(false);
                setEditing(false);
              }
            }}
            className="inline-flex items-center gap-1"
          >
            <input type="hidden" name="material_id" value={m.id} />
            <input type="hidden" name="price_field" value={priceField} />
            <input
              type="number"
              step="0.01"
              min="0"
              name="price"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              className="w-20 rounded border-2 border-sky-400 px-1.5 py-0.5 text-right text-sm tabular-nums font-bold focus:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">
              {priceLabel}
            </span>
            <button
              type="submit"
              disabled={pending}
              className="ml-1 p-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
              aria-label="Uložiť"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setInputValue(String(effectivePrice ?? ""));
              }}
              className="p-1 rounded bg-slate-200 hover:bg-slate-300"
              aria-label="Zrušiť"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={cn(
              "font-black tabular-nums hover:underline decoration-dotted",
              m.is_overridden ? "text-amber-800" : "text-foreground",
            )}
            title={
              m.is_overridden
                ? `Prepísané. Pôvodná cena: ${originalPrice}`
                : "Klik pre úpravu"
            }
          >
            {effectivePrice ?? "—"} {priceLabel}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {m.is_overridden && !editing && (
          <form
            action={async (fd) => {
              setPending(true);
              try {
                await resetMaterialPriceAction(fd);
              } finally {
                setPending(false);
              }
            }}
          >
            <input type="hidden" name="material_id" value={m.id} />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-rose-700 font-semibold"
              title={`Reset na pôvodnú cenu ${originalPrice} ${priceLabel}`}
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════
// GLOBAL SETTINGS TAB
// ══════════════════════════════════════════════════════════════════════

function GlobalTab({ settings }: { settings: SettingView[] }) {
  if (settings.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Zatiaľ žiadne globálne nastavenia — spusti SQL migráciu{" "}
          <code>22_settings_and_materials.sql</code> ktorá seedne defaults.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {settings.map((s) => (
        <SettingRow key={s.key} setting={s} />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MATERIAL MARKUPS TAB (per-role marže — %)
// ══════════════════════════════════════════════════════════════════════

const MARKUP_META: Record<
  string,
  { icon: string; label: string; examples: string; color: string }
> = {
  "markup.primer": {
    icon: "🧴",
    label: "Penetrácie / Primery",
    examples:
      "Sikafloor-01, -03, -150 Plus, -151, -156, -161 · Topstone EP02",
    color: "sky",
  },
  "markup.main": {
    icon: "🎨",
    label: "Hlavné farebné nátery",
    examples:
      "Sikafloor-264 Plus, -3000, -3000FX, -392, -262AS N · Topstone EP11 metalic",
    color: "violet",
  },
  "markup.topcoat": {
    icon: "✨",
    label: "Vrchné laky",
    examples:
      "Sikafloor-3310, -304W Matt, -305W, -TC 442W · Topstone EP22 Plus",
    color: "emerald",
  },
  "markup.additive": {
    icon: "🎯",
    label: "Doplnky",
    examples:
      "Sikafloor Level-30, Chipy STAVEKON, Kremičitý piesok, Sika CLN 50, Topstone Akcelerátor",
    color: "amber",
  },
  "markup.transport": {
    icon: "🚚",
    label: "Doprava / paletné",
    examples: "EUR paleta 1200×800, doprava (Ostrava → SK, Bratislava, …)",
    color: "slate",
  },
  "margin.material": {
    icon: "🌐",
    label: "Fallback globálna marža",
    examples:
      "Ak niektorá per-role marža vyššie nie je nastavená, použije sa táto ako fallback.",
    color: "rose",
  },
};

function MarkupsTab({ settings }: { settings: SettingView[] }) {
  if (settings.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Marže per rola nie sú v DB. Pusti SQL migráciu{" "}
          <code className="font-mono font-bold">26_material_markups.sql</code>{" "}
          v Supabase SQL editore.
        </p>
        <a
          href="https://supabase.com/dashboard/project/wzcehdynanuuzztfrqyi/sql/new"
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-sky-700 hover:text-sky-800 underline font-bold text-sm"
        >
          Otvoriť SQL editor →
        </a>
      </div>
    );
  }

  // Zoradenie podľa MARKUP_META poradia (primer → main → topcoat → additive → transport → globálna)
  const order = [
    "markup.primer",
    "markup.main",
    "markup.topcoat",
    "markup.additive",
    "markup.transport",
    "margin.material",
  ];
  const sorted = [...settings].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-sky-200 bg-sky-50/60 p-4 text-sm">
        <div className="font-bold text-sky-900 mb-1">
          💡 Ako fungujú marže na materiáli
        </div>
        <div className="text-sky-800 leading-snug space-y-1">
          <div>
            <strong>Predajná cena</strong> = <strong>Nákup</strong> ÷ (1 −
            marža). Napr. marža 37 % → náklad 100 € → predaj 158,73 €
            (58,73 € zisk).
          </div>
          <div>
            Per-role marže nižšie sa aplikujú na materiál podľa jeho role
            (primer/main/topcoat/additive/transport). Fallback globálna
            marža sa použije len ak per-role nie je nastavená.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((s) => (
          <MarkupCard key={s.key} setting={s} />
        ))}
      </div>
    </div>
  );
}

function MarkupCard({ setting }: { setting: SettingView }) {
  const meta = MARKUP_META[setting.key] ?? {
    icon: "⚙️",
    label: setting.label,
    examples: setting.description ?? "",
    color: "slate",
  };

  const rawValue =
    typeof setting.value === "number"
      ? setting.value
      : typeof setting.value === "string"
        ? parseFloat(setting.value)
        : parseFloat(String(setting.value));

  // Zobrazujeme v UI ako percent (37 % namiesto 0.37)
  const percentInit = isFinite(rawValue) ? (rawValue * 100).toFixed(0) : "37";
  const [percent, setPercent] = React.useState(percentInit);
  const [pending, setPending] = React.useState(false);

  const pctNum = parseFloat(percent);
  const validPct = isFinite(pctNum) && pctNum >= 0 && pctNum < 100;
  const sellMultiplier = validPct ? 1 / (1 - pctNum / 100) : null;

  const colorClasses: Record<string, { border: string; bg: string; text: string; ring: string }> = {
    sky: { border: "border-sky-300", bg: "bg-sky-50", text: "text-sky-900", ring: "focus:ring-sky-400" },
    violet: { border: "border-violet-300", bg: "bg-violet-50", text: "text-violet-900", ring: "focus:ring-violet-400" },
    emerald: { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-900", ring: "focus:ring-emerald-400" },
    amber: { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-900", ring: "focus:ring-amber-400" },
    slate: { border: "border-slate-300", bg: "bg-slate-50", text: "text-slate-900", ring: "focus:ring-slate-400" },
    rose: { border: "border-rose-300", bg: "bg-rose-50", text: "text-rose-900", ring: "focus:ring-rose-400" },
  };
  const c = colorClasses[meta.color] ?? colorClasses.slate;

  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await saveSettingAction(fd);
        } finally {
          setPending(false);
        }
      }}
      className={cn(
        "rounded-xl border-2 p-4 space-y-3 bg-background",
        c.border,
      )}
    >
      <input type="hidden" name="key" value={setting.key} />
      {/* Value je uložená ako fraction (0.37), nie percent (37) */}
      <input
        type="hidden"
        name="value"
        value={validPct ? (pctNum / 100).toString() : "0.37"}
      />

      <div className="flex items-start gap-3">
        <div className={cn("shrink-0 text-3xl leading-none")}>{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{meta.label}</div>
          <code className="text-[10px] text-muted-foreground font-mono">
            {setting.key}
          </code>
          <div className="text-[11px] text-muted-foreground italic mt-1 leading-snug">
            {meta.examples}
          </div>
        </div>
      </div>

      <div className={cn("rounded-lg px-3 py-2.5", c.bg)}>
        <div className="flex items-baseline gap-1.5">
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Marža
          </label>
          <input
            type="number"
            step="1"
            min="0"
            max="99"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className={cn(
              "w-16 rounded-md border-2 bg-white px-2 py-1 text-lg font-black text-right tabular-nums focus:outline-none focus:ring-2",
              c.border,
              c.ring,
            )}
          />
          <span className={cn("text-lg font-black", c.text)}>%</span>
        </div>
        {sellMultiplier && (
          <div className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
            Predaj = Nákup × <strong>{sellMultiplier.toFixed(3)}</strong>
            {" "}(napr. 100 € nákup → <strong>{(100 * sellMultiplier).toFixed(2)} €</strong> predaj)
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !validPct}
        className={cn(
          "w-full rounded-lg py-2 text-sm font-bold text-white transition-colors",
          "bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {pending ? "Ukladám…" : `Uložiť ${percent} %`}
      </button>
    </form>
  );
}

function SettingRow({ setting }: { setting: SettingView }) {
  const [value, setValue] = React.useState(
    typeof setting.value === "number"
      ? String(setting.value)
      : typeof setting.value === "string"
        ? setting.value
        : JSON.stringify(setting.value),
  );
  const [pending, setPending] = React.useState(false);

  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await saveSettingAction(fd);
        } finally {
          setPending(false);
        }
      }}
      className="rounded-xl border-2 p-3 space-y-2 bg-background hover:border-sky-300 transition-colors"
    >
      <input type="hidden" name="key" value={setting.key} />
      <div>
        <div className="font-bold text-sm">{setting.label}</div>
        <code className="text-[10px] text-muted-foreground font-mono">
          {setting.key}
        </code>
        {setting.description && (
          <div className="text-[11px] text-muted-foreground italic mt-0.5">
            {setting.description}
          </div>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          name="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg border-2 bg-background px-3 py-1.5 text-sm font-bold focus:border-sky-500 focus:outline-none tabular-nums"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-bold"
        >
          {pending ? "…" : "Uložiť"}
        </button>
      </div>
    </form>
  );
}
