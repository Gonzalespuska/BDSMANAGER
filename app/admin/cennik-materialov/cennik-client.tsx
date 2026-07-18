"use client";

import * as React from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { saveSettingV2 } from "@/app/admin/settings/actions";
import {
  FLOOR_TYPE_LABELS,
  MATERIALS,
  PRICEABLE_MATERIAL_IDS,
  type FloorType,
} from "@/lib/data/materials";

type Setting = { key: string; value: unknown };

export type MaterialExtra = {
  id: string;
  name: string;
  floor_types: FloorType[];
  step: StepKey;
  price_per_sqm: number | null;
  cost_per_sqm: number | null;
  consumption_kg_per_sqm: number | null;
  notes: string | null;
  variant: "epoxid" | "polyuretan" | null;
  active: boolean;
  created_at: string;
};

type StepKey = "uprava" | "penetracia" | "farebny" | "lak" | "ine";

const STEP_LABELS: Record<StepKey, string> = {
  uprava: "Úprava povrchu",
  penetracia: "Penetrácia",
  farebny: "Hlavný / Farebný náter",
  lak: "Vrchný lak",
  ine: "Iné",
};

const STEP_ORDER: StepKey[] = ["uprava", "penetracia", "farebny", "lak", "ine"];

const FLOOR_ORDER: FloorType[] = [
  "jednofarebna",
  "chipsova",
  "mramorova",
  "metalicka",
];

/** Odvodí krok podľa material.id sufixu. */
function stepFromId(id: string): StepKey {
  if (id.endsWith("-uprava")) return "uprava";
  if (id.includes("-penetracia")) return "penetracia";
  if (id.includes("-farebny")) return "farebny";
  if (id.includes("-lak")) return "lak";
  return "ine";
}

type PriceMode = "amount" | "margin";
type MaterialMaps = {
  price: Record<string, number>;
  cost: Record<string, number>;
  consumption: Record<string, number>;
  customName: Record<string, string>;
  priceMode: Record<string, PriceMode>;
  marginPct: Record<string, number>;
  /** User 2026-07-18: „tu v cenniku musi byt este ake pozname velkosti sudov
   *  kazdy je iny cize musim mat moznost napisat 1 alebo viac moznosti ake
   *  su na trhu a ake su na nich ceny". */
  packagingOptions: Record<string, PackagingOption[]>;
};

export type PackagingOption = {
  size_kg: number;
  price_eur: number;
  unit_label: string; // 'sud' | 'vedro' | 'vedierko' | 'vrece'
};

function buildMaps(settings: Setting[]): MaterialMaps {
  const price: Record<string, number> = {};
  const cost: Record<string, number> = {};
  const consumption: Record<string, number> = {};
  const customName: Record<string, string> = {};
  const priceMode: Record<string, PriceMode> = {};
  const marginPct: Record<string, number> = {};
  const packagingOptions: Record<string, PackagingOption[]> = {};
  for (const s of settings) {
    const key = s.key;
    if (!key.startsWith("material.")) continue;
    const raw = s.value;
    const suffix = key.slice("material.".length);
    if (suffix.endsWith(".custom_name")) {
      const id = suffix.slice(0, -".custom_name".length);
      const strVal = typeof raw === "string" ? raw : String(raw ?? "");
      if (strVal.trim()) customName[id] = strVal;
      continue;
    }
    if (suffix.endsWith(".price_mode")) {
      const id = suffix.slice(0, -".price_mode".length);
      const strVal = typeof raw === "string" ? raw : String(raw ?? "");
      if (strVal === "amount" || strVal === "margin") priceMode[id] = strVal;
      continue;
    }
    if (suffix.endsWith(".packaging_options")) {
      const id = suffix.slice(0, -".packaging_options".length);
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          packagingOptions[id] = parsed
            .filter(
              (x): x is PackagingOption =>
                x &&
                typeof x.size_kg === "number" &&
                x.size_kg > 0 &&
                typeof x.price_eur === "number" &&
                x.price_eur >= 0 &&
                typeof x.unit_label === "string",
            );
        }
      } catch {
        /* invalid JSON — skip */
      }
      continue;
    }
    const num = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!isFinite(num) || num < 0) continue;
    if (suffix.endsWith(".price_per_sqm")) {
      price[suffix.slice(0, -".price_per_sqm".length)] = num;
    } else if (suffix.endsWith(".cost_per_sqm")) {
      cost[suffix.slice(0, -".cost_per_sqm".length)] = num;
    } else if (suffix.endsWith(".consumption_kg_per_sqm")) {
      consumption[suffix.slice(0, -".consumption_kg_per_sqm".length)] = num;
    } else if (suffix.endsWith(".margin_pct")) {
      marginPct[suffix.slice(0, -".margin_pct".length)] = num;
    }
  }
  return {
    price,
    cost,
    consumption,
    customName,
    priceMode,
    marginPct,
    packagingOptions,
  };
}

type CombinedItem = {
  key: string; // material.id alebo extra.id
  origin: "hardcoded" | "extra";
  name: string;
  originalName: string; // hardcoded: MATERIALS[].name; extra: extra.name
  variant?: "epoxid" | "polyuretan";
  floorType: FloorType;
  step: StepKey;
  defaultPrice?: number;
  priceOverride?: number;
  priceMode?: PriceMode;
  marginPct?: number;
  cost?: number;
  consumption?: number;
  packagingOptions?: PackagingOption[];
  extraId?: string;
};

export function CennikMaterialovClient({
  settings,
  initialExtras,
}: {
  settings: Setting[];
  initialExtras: MaterialExtra[];
}) {
  const maps = React.useMemo(() => buildMaps(settings), [settings]);
  const [extras, setExtras] = React.useState<MaterialExtra[]>(initialExtras);
  const [activeFloor, setActiveFloor] = React.useState<FloorType>(
    FLOOR_ORDER[0],
  );
  const [stepFilter, setStepFilter] = React.useState<"all" | StepKey>("all");
  const [showAddForm, setShowAddForm] = React.useState(false);

  const combined = React.useMemo<CombinedItem[]>(() => {
    const rows: CombinedItem[] = [];
    const set = new Set(PRICEABLE_MATERIAL_IDS);
    for (const m of MATERIALS) {
      if (!set.has(m.id)) continue;
      rows.push({
        key: m.id,
        origin: "hardcoded",
        name: maps.customName[m.id] || m.name,
        originalName: m.name,
        variant: m.variant,
        floorType: m.floor_type,
        step: stepFromId(m.id),
        defaultPrice: m.price_per_sqm,
        priceOverride: maps.price[m.id],
        priceMode: maps.priceMode[m.id],
        marginPct: maps.marginPct[m.id],
        cost: maps.cost[m.id],
        consumption: maps.consumption[m.id],
        packagingOptions: maps.packagingOptions[m.id],
      });
    }
    for (const e of extras) {
      for (const ft of e.floor_types) {
        rows.push({
          key: `extra-${e.id}-${ft}`,
          origin: "extra",
          name: e.name,
          originalName: e.name,
          variant: e.variant ?? undefined,
          floorType: ft as FloorType,
          step: e.step,
          priceOverride: e.price_per_sqm ?? undefined,
          cost: e.cost_per_sqm ?? undefined,
          consumption: e.consumption_kg_per_sqm ?? undefined,
          extraId: e.id,
        });
      }
    }
    return rows;
  }, [maps, extras]);

  const filtered = React.useMemo(() => {
    return combined
      .filter((r) => r.floorType === activeFloor)
      .filter((r) => (stepFilter === "all" ? true : r.step === stepFilter));
  }, [combined, activeFloor, stepFilter]);

  const grouped = React.useMemo(() => {
    const m = new Map<StepKey, CombinedItem[]>();
    for (const r of filtered) {
      const arr = m.get(r.step) ?? [];
      arr.push(r);
      m.set(r.step, arr);
    }
    return m;
  }, [filtered]);

  async function addExtra(payload: {
    name: string;
    step: StepKey;
    floor_types: FloorType[];
    variant: "epoxid" | "polyuretan" | null;
    price_per_sqm: number | null;
    cost_per_sqm: number | null;
    consumption_kg_per_sqm: number | null;
  }) {
    const r = await fetch("/api/admin/material-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) {
      alert("Chyba: " + j.error);
      return;
    }
    setExtras((prev) => [j.item, ...prev]);
    setShowAddForm(false);
  }

  async function deleteExtra(id: string) {
    if (!confirm("Zmazať tento extra materiál z DB?")) return;
    const r = await fetch("/api/admin/material-extras", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!j.ok) {
      alert("Chyba: " + j.error);
      return;
    }
    setExtras((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {FLOOR_ORDER.map((ft) => {
            const isActive = ft === activeFloor;
            return (
              <button
                key={ft}
                type="button"
                onClick={() => setActiveFloor(ft)}
                className={
                  "inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 border-2 transition-colors " +
                  (isActive
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-100"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-violet-300")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/floor-types/${ft}.jpg`}
                  alt=""
                  className="w-9 h-9 rounded-md object-cover"
                  loading="lazy"
                />
                <div className="text-left">
                  <div className="text-sm font-black leading-tight">
                    {FLOOR_TYPE_LABELS[ft]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Krok:
          </label>
          <select
            value={stepFilter}
            onChange={(e) => setStepFilter(e.target.value as "all" | StepKey)}
            className="h-9 px-3 rounded-lg border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
          >
            <option value="all">Všetky kroky</option>
            {STEP_ORDER.map((s) => (
              <option key={s} value={s}>
                {STEP_LABELS[s]}
              </option>
            ))}
          </select>

          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-black px-3 py-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" aria-hidden />
              {showAddForm ? "Zavrieť" : "Pridať materiál"}
            </button>
          </div>
        </div>

        {showAddForm && (
          <AddExtraForm
            defaultFloor={activeFloor}
            defaultStep={stepFilter === "all" ? "penetracia" : stepFilter}
            onCancel={() => setShowAddForm(false)}
            onSave={addExtra}
          />
        )}
      </div>

      {/* Zoznam */}
      <div className="space-y-4">
        {STEP_ORDER.filter((s) => grouped.has(s)).map((s) => (
          <section
            key={s}
            className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
          >
            <div className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-200">
              {STEP_LABELS[s]}{" "}
              <span className="text-xs opacity-60 font-normal">
                ({grouped.get(s)!.length})
              </span>
            </div>
            <ul className="space-y-1.5">
              {grouped.get(s)!.map((row) => (
                <MaterialRow
                  key={row.key}
                  row={row}
                  onDeleteExtra={
                    row.origin === "extra" && row.extraId
                      ? () => deleteExtra(row.extraId!)
                      : undefined
                  }
                />
              ))}
            </ul>
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-8 text-center text-sm text-muted-foreground">
            Žiadne položky pre {FLOOR_TYPE_LABELS[activeFloor]}
            {stepFilter !== "all" ? ` · ${STEP_LABELS[stepFilter]}` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Add extra form
function AddExtraForm({
  defaultFloor,
  defaultStep,
  onCancel,
  onSave,
}: {
  defaultFloor: FloorType;
  defaultStep: StepKey;
  onCancel: () => void;
  onSave: (payload: {
    name: string;
    step: StepKey;
    floor_types: FloorType[];
    variant: "epoxid" | "polyuretan" | null;
    price_per_sqm: number | null;
    cost_per_sqm: number | null;
    consumption_kg_per_sqm: number | null;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [step, setStep] = React.useState<StepKey>(defaultStep);
  const [floors, setFloors] = React.useState<FloorType[]>([defaultFloor]);
  const [variant, setVariant] = React.useState<"" | "epoxid" | "polyuretan">("");
  const [price, setPrice] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [consumption, setConsumption] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const hasJednofarebna = floors.includes("jednofarebna");

  function toggleFloor(ft: FloorType) {
    setFloors((prev) =>
      prev.includes(ft) ? prev.filter((x) => x !== ft) : [...prev, ft],
    );
  }

  async function submit() {
    if (!name.trim()) return alert("Meno materiálu je povinné.");
    if (floors.length === 0) return alert("Vyber aspoň jeden typ podlahy.");
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        step,
        floor_types: floors,
        variant: hasJednofarebna && variant ? variant : null,
        price_per_sqm: price ? parseFloat(price) : null,
        cost_per_sqm: cost ? parseFloat(cost) : null,
        consumption_kg_per_sqm: consumption ? parseFloat(consumption) : null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black text-violet-900 dark:text-violet-100">
          + Nový extra materiál
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-7 h-7 rounded-md hover:bg-violet-200/60 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
          Názov materiálu
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Napr. Sikafloor-151 (multifunkčný primer)"
          className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold mt-0.5"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Krok (kategória)
          </span>
          <select
            value={step}
            onChange={(e) => setStep(e.target.value as StepKey)}
            className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold mt-0.5"
          >
            {STEP_ORDER.map((s) => (
              <option key={s} value={s}>
                {STEP_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <div className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Vhodné pre typ(y) podlahy
          </span>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            {FLOOR_ORDER.map((ft) => {
              const active = floors.includes(ft);
              return (
                <button
                  key={ft}
                  type="button"
                  onClick={() => toggleFloor(ft)}
                  className={
                    "text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-md border-2 " +
                    (active
                      ? "border-violet-500 bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200"
                      : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-violet-300")
                  }
                >
                  {FLOOR_TYPE_LABELS[ft]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {hasJednofarebna && (
        <div className="rounded-lg border-2 border-sky-300 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/20 p-3 space-y-1.5">
          <div className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">
            Jednofarebná — variant (voliteľné, ale ceny sa líšia)
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { v: "" as const, label: "Univerzálny (oba)" },
              { v: "epoxid" as const, label: "Epoxid" },
              { v: "polyuretan" as const, label: "Polyuretán" },
            ].map((o) => (
              <button
                key={o.v || "none"}
                type="button"
                onClick={() => setVariant(o.v)}
                className={
                  "text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-md border-2 " +
                  (variant === o.v
                    ? "border-sky-500 bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-sky-300")
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Predaj €/m²
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="voliteľné"
            className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums text-right mt-0.5"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-400">
            Náklad €/m²
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="voliteľné"
            className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums text-right mt-0.5"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-400">
            Spotreba kg/m²
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            placeholder="voliteľné"
            className="w-full h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums text-right mt-0.5"
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-black px-3 py-1.5"
        >
          Zrušiť
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Uložiť materiál
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Row — inline edit prices + name (custom_name override pre hardcoded)
function MaterialRow({
  row,
  onDeleteExtra,
}: {
  row: CombinedItem;
  onDeleteExtra?: () => void | Promise<void>;
}) {
  const isExtra = row.origin === "extra";
  const [nameVal, setNameVal] = React.useState(row.name);
  const [priceMode, setPriceMode] = React.useState<PriceMode>(
    row.priceMode ?? "amount",
  );
  const [priceVal, setPriceVal] = React.useState<string>(
    row.priceOverride != null ? String(row.priceOverride) : "",
  );
  const [marginVal, setMarginVal] = React.useState<string>(
    row.marginPct != null ? String(row.marginPct) : "",
  );
  const [costVal, setCostVal] = React.useState<string>(
    row.cost != null ? String(row.cost) : "",
  );
  const [consumptionVal, setConsumptionVal] = React.useState<string>(
    row.consumption != null ? String(row.consumption) : "",
  );
  // Balenia — user 2026-07-18: „tu v cenniku musi byt este ake pozname
  // velkosti sudov kazdy je iny cize musim mat moznost napisat 1 alebo viac
  // moznosti ake su na trhu a ake su na nich ceny".
  const [packagingList, setPackagingList] = React.useState<PackagingOption[]>(
    row.packagingOptions ?? [],
  );
  const [showPackaging, setShowPackaging] = React.useState(
    (row.packagingOptions?.length ?? 0) > 0,
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  function addPackaging() {
    setPackagingList((prev) => [
      ...prev,
      { size_kg: 30, price_eur: 0, unit_label: "sud" },
    ]);
  }
  function updatePackaging(idx: number, patch: Partial<PackagingOption>) {
    setPackagingList((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function removePackaging(idx: number) {
    setPackagingList((prev) => prev.filter((_, i) => i !== idx));
  }

  const priceHasOverride = row.priceOverride != null;
  const costHasVal = row.cost != null;
  const consumptionHasVal = row.consumption != null;
  const nameIsCustom = row.originalName !== row.name;

  // Effective predaj €/m² pri režime marža = náklad / (1 − marža%)
  const computedFromMargin = React.useMemo(() => {
    const c = costVal.trim() ? parseFloat(costVal) : NaN;
    const m = marginVal.trim() ? parseFloat(marginVal) : NaN;
    if (
      priceMode !== "margin" ||
      !isFinite(c) ||
      !isFinite(m) ||
      m >= 100 ||
      m < 0
    )
      return null;
    return c / (1 - m / 100);
  }, [priceMode, costVal, marginVal]);

  async function saveHardcoded() {
    setSaving(true);
    setSaved(false);
    try {
      const c = costVal.trim();
      const s = consumptionVal.trim();
      const m = marginVal.trim();
      // V režime marža ukladáme spočítanú cenu (computedFromMargin) ako
      // price_per_sqm — generator CP číta iba jeden kľúč a nemusí sa
      // starať o mode. Zároveň si pamätáme mode+margin_pct pre UI reload.
      let priceToStore = "";
      if (priceMode === "amount") {
        priceToStore = priceVal.trim();
        if (priceToStore) {
          const n = parseFloat(priceToStore);
          if (!isFinite(n) || n < 0) {
            alert("Predaj musí byť kladné číslo alebo prázdne.");
            return;
          }
        }
      } else if (priceMode === "margin") {
        if (!c) {
          alert("V režime marža vyplň najprv Náklad €/m².");
          return;
        }
        if (!m) {
          alert("V režime marža vyplň Marža %.");
          return;
        }
        const cN = parseFloat(c);
        const mN = parseFloat(m);
        if (!isFinite(cN) || cN < 0 || !isFinite(mN) || mN < 0 || mN >= 100) {
          alert("Marža musí byť 0–99 % a náklad kladné číslo.");
          return;
        }
        priceToStore = (cN / (1 - mN / 100)).toFixed(2);
      }
      for (const [v, lbl] of [
        [c, "Náklad"],
        [s, "Spotreba"],
      ] as const) {
        if (v) {
          const n = parseFloat(v);
          if (!isFinite(n) || n < 0) {
            alert(`${lbl} musí byť kladné číslo alebo prázdne.`);
            return;
          }
        }
      }
      const customNameToSave =
        nameVal.trim() && nameVal.trim() !== row.originalName ? nameVal.trim() : "";
      // Balenia — filter validne + ulozime ako JSON (alebo prazdny string
      // ak nic aby sa key mohol clearnut).
      const validPackaging = packagingList.filter(
        (p) => p.size_kg > 0 && p.price_eur >= 0 && p.unit_label,
      );
      const packagingToStore =
        validPackaging.length > 0 ? JSON.stringify(validPackaging) : "";
      await Promise.all([
        saveSettingV2(`material.${row.key}.price_per_sqm`, priceToStore),
        saveSettingV2(`material.${row.key}.cost_per_sqm`, c),
        saveSettingV2(`material.${row.key}.consumption_kg_per_sqm`, s),
        saveSettingV2(`material.${row.key}.custom_name`, customNameToSave),
        saveSettingV2(`material.${row.key}.price_mode`, priceMode),
        saveSettingV2(
          `material.${row.key}.margin_pct`,
          priceMode === "margin" ? m : "",
        ),
        saveSettingV2(`material.${row.key}.packaging_options`, packagingToStore),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function saveExtra() {
    if (!row.extraId) return;
    setSaving(true);
    setSaved(false);
    try {
      const p = priceVal.trim() ? parseFloat(priceVal) : null;
      const c = costVal.trim() ? parseFloat(costVal) : null;
      const s = consumptionVal.trim() ? parseFloat(consumptionVal) : null;
      const r = await fetch("/api/admin/material-extras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.extraId,
          name: nameVal.trim() || row.name,
          price_per_sqm: p,
          cost_per_sqm: c,
          consumption_kg_per_sqm: s,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        alert("Chyba: " + j.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function vymazatVsetko() {
    if (!confirm("Vymazať všetky hodnoty (predaj, náklad, spotreba, meno)?"))
      return;
    setPriceVal("");
    setCostVal("");
    setMarginVal("");
    setConsumptionVal("");
    setNameVal(row.originalName);
    setPriceMode("amount");
    setSaving(true);
    try {
      if (isExtra && row.extraId) {
        await fetch("/api/admin/material-extras", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.extraId,
            price_per_sqm: null,
            cost_per_sqm: null,
            consumption_kg_per_sqm: null,
          }),
        });
      } else {
        await Promise.all([
          saveSettingV2(`material.${row.key}.price_per_sqm`, ""),
          saveSettingV2(`material.${row.key}.cost_per_sqm`, ""),
          saveSettingV2(`material.${row.key}.consumption_kg_per_sqm`, ""),
          saveSettingV2(`material.${row.key}.custom_name`, ""),
          saveSettingV2(`material.${row.key}.price_mode`, ""),
          saveSettingV2(`material.${row.key}.margin_pct`, ""),
        ]);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  const anyValue =
    priceHasOverride ||
    costHasVal ||
    consumptionHasVal ||
    nameIsCustom ||
    row.marginPct != null;

  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <input
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            className={
              "w-full text-sm font-black bg-transparent border-b border-dashed focus:outline-none focus:border-solid px-0.5 py-0.5 " +
              (nameIsCustom
                ? "border-emerald-500 text-emerald-900 dark:text-emerald-200"
                : "border-slate-300 dark:border-slate-700 hover:border-slate-500")
            }
            title="Klik pre premenovanie"
          />
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 inline-flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/floor-types/${row.floorType}.jpg`}
                alt=""
                className="w-3.5 h-3.5 rounded object-cover"
                loading="lazy"
              />
              {FLOOR_TYPE_LABELS[row.floorType]}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {STEP_LABELS[row.step]}
            </span>
            {row.variant && (
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {row.variant}
              </span>
            )}
            {isExtra && (
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                extra
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <div
              className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex-1 inline-flex items-center gap-1"
              title="Predaj €/m² sa použije v generátori CP na nacenovanie práce (klient si objedná realizáciu). V móde „Iba materiál + doprava" v generátori sa použije cena za balenie z Balení nižšie — keď si niekto chce iba kúpiť materiál."
            >
              Predaj
              <span
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[9px] cursor-help"
                title="Predaj €/m² sa použije v generátori CP na nacenovanie práce (klient si objedná realizáciu). V móde „Iba materiál + doprava" v generátori sa použije cena za balenie z Balení nižšie — keď si niekto chce iba kúpiť materiál."
              >
                ?
              </span>
            </div>
            {!isExtra && (
              <div className="inline-flex text-[10px] font-black uppercase tracking-wider rounded border border-slate-300 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPriceMode("amount")}
                  className={
                    "px-1.5 py-0.5 " +
                    (priceMode === "amount"
                      ? "bg-emerald-600 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100")
                  }
                >
                  €/m²
                </button>
                <button
                  type="button"
                  onClick={() => setPriceMode("margin")}
                  className={
                    "px-1.5 py-0.5 border-l border-slate-300 dark:border-slate-700 " +
                    (priceMode === "margin"
                      ? "bg-emerald-600 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100")
                  }
                >
                  marža%
                </button>
              </div>
            )}
          </div>
          {priceMode === "amount" || isExtra ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceVal}
                onChange={(e) => setPriceVal(e.target.value)}
                placeholder={row.defaultPrice != null ? String(row.defaultPrice) : "—"}
                className={
                  "h-9 flex-1 min-w-0 px-2 rounded-md border text-sm font-bold tabular-nums text-right " +
                  (priceHasOverride
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900")
                }
              />
              <span className="text-xs text-muted-foreground shrink-0">€</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
                  value={marginVal}
                  onChange={(e) => setMarginVal(e.target.value)}
                  placeholder="napr. 50"
                  className="h-9 flex-1 min-w-0 px-2 rounded-md border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-sm font-bold tabular-nums text-right"
                />
                <span className="text-xs text-muted-foreground shrink-0">%</span>
              </div>
              {computedFromMargin != null && (
                <div className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 text-right tabular-nums">
                  = {computedFromMargin.toFixed(2)} €/m²
                </div>
              )}
              {computedFromMargin == null && (
                <div className="text-[10px] text-muted-foreground text-right italic">
                  vyplň Náklad + marža
                </div>
              )}
            </div>
          )}
        </div>

        <label className="block">
          <div className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-400 mb-0.5">
            Náklad €/m²
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              value={costVal}
              onChange={(e) => setCostVal(e.target.value)}
              placeholder="—"
              className={
                "h-9 flex-1 min-w-0 px-2 rounded-md border text-sm font-bold tabular-nums text-right " +
                (costHasVal
                  ? "border-sky-400 bg-sky-50 dark:bg-sky-950/30"
                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900")
              }
            />
            <span className="text-xs text-muted-foreground shrink-0">€</span>
          </div>
        </label>

        <label className="block">
          <div className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-400 mb-0.5">
            Spotreba kg/m²
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              value={consumptionVal}
              onChange={(e) => setConsumptionVal(e.target.value)}
              placeholder="—"
              className={
                "h-9 flex-1 min-w-0 px-2 rounded-md border text-sm font-bold tabular-nums text-right " +
                (consumptionHasVal
                  ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30"
                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900")
              }
            />
            <span className="text-xs text-muted-foreground shrink-0">kg</span>
          </div>
        </label>
      </div>

      {/* Balenia — user 2026-07-18: „tu v cenniku musi byt este ake pozname
          velkosti sudov kazdy je iny cize musim mat moznost napisat 1 alebo
          viac moznosti ake su na trhu a ake su na nich ceny". Zbaleny
          collapsible s add-tlacidlom + zoznam size/cena/jednotka rows.
          Ceny sa pouziju v mode „Iba material + doprava" v generatori. */}
      {!isExtra && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-2">
          <button
            type="button"
            onClick={() => setShowPackaging((v) => !v)}
            className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <span className="inline-flex items-center gap-1.5">
              📦 Balenia · {packagingList.length}
              <span className="text-slate-500 dark:text-slate-500 normal-case font-normal">
                (pre „Iba materiál" predaj)
              </span>
            </span>
            <span>{showPackaging ? "▾" : "▸"}</span>
          </button>
          {showPackaging && (
            <div className="mt-2 space-y-1.5">
              {packagingList.length === 0 && (
                <div className="text-[11px] italic text-slate-500 dark:text-slate-500 px-1">
                  Zatiaľ žiadne balenia. Klik na „+ Balenie" pridá 10 kg / 30 kg / …
                </div>
              )}
              {packagingList.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 flex-wrap bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                >
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={p.size_kg}
                    onChange={(e) =>
                      updatePackaging(i, {
                        size_kg: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-8 w-16 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums text-right"
                  />
                  <span className="text-[10px] font-black text-slate-500">kg</span>
                  <select
                    value={p.unit_label}
                    onChange={(e) =>
                      updatePackaging(i, { unit_label: e.target.value })
                    }
                    className="h-8 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  >
                    <option value="sud">sud</option>
                    <option value="vedro">vedro</option>
                    <option value="vedierko">vedierko</option>
                    <option value="vrece">vrece</option>
                  </select>
                  <span className="text-[10px] font-black text-slate-500 ml-1">
                    cena
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.price_eur}
                    onChange={(e) =>
                      updatePackaging(i, {
                        price_eur: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-8 w-24 px-1.5 rounded border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-sm font-bold tabular-nums text-right"
                  />
                  <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400">
                    €
                  </span>
                  <button
                    type="button"
                    onClick={() => removePackaging(i)}
                    className="ml-auto text-rose-500 hover:text-rose-700 p-1"
                    title="Zmazať toto balenie"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addPackaging}
                className="inline-flex items-center gap-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-black px-2.5 py-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Balenie
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={isExtra ? saveExtra : saveHardcoded}
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
        {anyValue && (
          <button
            type="button"
            onClick={vymazatVsetko}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 px-2 py-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
            title="Vymazať všetky hodnoty tohto riadku"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Vymazať
          </button>
        )}
        {isExtra && onDeleteExtra && (
          <button
            type="button"
            onClick={onDeleteExtra}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-300 px-2 py-1.5 rounded-md ml-auto disabled:opacity-40"
            title="Zmazať celý extra materiál z DB"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Odstrániť materiál
          </button>
        )}
      </div>
    </li>
  );
}
