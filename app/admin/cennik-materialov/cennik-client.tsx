"use client";

import * as React from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { saveSettingV2 } from "@/app/admin/settings/actions";
import {
  FLOOR_TYPE_LABELS,
  MATERIALS,
  PRICEABLE_MATERIAL_IDS,
  type FloorType,
} from "@/lib/data/materials";

type Setting = { key: string; value: unknown };

/**
 * 3 kľúče na materiál:
 *   material.<id>.price_per_sqm         → predajná cena €/m² (override defaultu)
 *   material.<id>.cost_per_sqm          → naša nákupná cena €/m² (Sika/Topstone náklad)
 *   material.<id>.consumption_kg_per_sqm→ spotreba materiálu kg/m² (pre postupy)
 */
type MaterialMaps = {
  price: Record<string, number>;
  cost: Record<string, number>;
  consumption: Record<string, number>;
};

function buildMaps(settings: Setting[]): MaterialMaps {
  const price: Record<string, number> = {};
  const cost: Record<string, number> = {};
  const consumption: Record<string, number> = {};
  for (const s of settings) {
    const key = s.key;
    if (!key.startsWith("material.")) continue;
    const raw = s.value;
    const num = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!isFinite(num) || num < 0) continue;
    const suffix = key.slice("material.".length);
    if (suffix.endsWith(".price_per_sqm")) {
      price[suffix.slice(0, -".price_per_sqm".length)] = num;
    } else if (suffix.endsWith(".cost_per_sqm")) {
      cost[suffix.slice(0, -".cost_per_sqm".length)] = num;
    } else if (suffix.endsWith(".consumption_kg_per_sqm")) {
      consumption[suffix.slice(0, -".consumption_kg_per_sqm".length)] = num;
    }
  }
  return { price, cost, consumption };
}

export function CennikMaterialovClient({ settings }: { settings: Setting[] }) {
  const maps = React.useMemo(() => buildMaps(settings), [settings]);

  const priceable = React.useMemo(() => {
    const set = new Set(PRICEABLE_MATERIAL_IDS);
    return MATERIALS.filter((m) => set.has(m.id));
  }, []);

  const grouped = React.useMemo(() => {
    const map = new Map<FloorType, typeof priceable>();
    for (const m of priceable) {
      const arr = map.get(m.floor_type) ?? [];
      arr.push(m);
      map.set(m.floor_type, arr);
    }
    return map;
  }, [priceable]);

  return (
    <div className="space-y-4">
      {(Array.from(grouped.entries()) as Array<[FloorType, typeof priceable]>).map(
        ([floorType, items]) => (
          <section
            key={floorType}
            className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
          >
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/floor-types/${floorType}.jpg`}
                alt={FLOOR_TYPE_LABELS[floorType]}
                className="w-14 h-14 rounded-lg object-cover border-2 border-slate-200 dark:border-slate-700 shrink-0"
                loading="lazy"
              />
              <div>
                <div className="text-base font-black tracking-tight leading-tight">
                  {FLOOR_TYPE_LABELS[floorType]}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {items.length} operácií
                </div>
              </div>
            </div>
            <ul className="space-y-1.5">
              {items.map((m) => (
                <MaterialRow
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  variant={m.variant}
                  defaultPrice={m.price_per_sqm}
                  priceOverride={maps.price[m.id]}
                  cost={maps.cost[m.id]}
                  consumption={maps.consumption[m.id]}
                />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function MaterialRow({
  id,
  name,
  variant,
  defaultPrice,
  priceOverride,
  cost,
  consumption,
}: {
  id: string;
  name: string;
  variant?: "epoxid" | "polyuretan";
  defaultPrice: number;
  priceOverride?: number;
  cost?: number;
  consumption?: number;
}) {
  const [priceVal, setPriceVal] = React.useState<string>(
    priceOverride != null ? String(priceOverride) : "",
  );
  const [costVal, setCostVal] = React.useState<string>(
    cost != null ? String(cost) : "",
  );
  const [consumptionVal, setConsumptionVal] = React.useState<string>(
    consumption != null ? String(consumption) : "",
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function saveAll() {
    setSaving(true);
    setSaved(false);
    try {
      const p = priceVal.trim();
      const c = costVal.trim();
      const s = consumptionVal.trim();
      if (p) {
        const n = parseFloat(p);
        if (!isFinite(n) || n < 0) {
          alert("Predajná cena musí byť kladné číslo alebo prázdne.");
          return;
        }
      }
      if (c) {
        const n = parseFloat(c);
        if (!isFinite(n) || n < 0) {
          alert("Nákupná cena musí byť kladné číslo alebo prázdne.");
          return;
        }
      }
      if (s) {
        const n = parseFloat(s);
        if (!isFinite(n) || n < 0) {
          alert("Spotreba musí byť kladné číslo alebo prázdne.");
          return;
        }
      }
      await Promise.all([
        saveSettingV2(`material.${id}.price_per_sqm`, p),
        saveSettingV2(`material.${id}.cost_per_sqm`, c),
        saveSettingV2(`material.${id}.consumption_kg_per_sqm`, s),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    setPriceVal("");
    setCostVal("");
    setConsumptionVal("");
    setSaving(true);
    try {
      await Promise.all([
        saveSettingV2(`material.${id}.price_per_sqm`, ""),
        saveSettingV2(`material.${id}.cost_per_sqm`, ""),
        saveSettingV2(`material.${id}.consumption_kg_per_sqm`, ""),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  }

  const priceHasOverride = priceOverride != null;
  const costHasVal = cost != null;
  const consumptionHasVal = consumption != null;

  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-black">
            {name}
            {variant && (
              <span className="ml-2 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {variant}
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {id}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* PREDAJ */}
        <label className="block">
          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-0.5">
            Predaj €/m²
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceVal}
              onChange={(e) => setPriceVal(e.target.value)}
              placeholder={String(defaultPrice)}
              className={
                "h-9 flex-1 min-w-0 px-2 rounded-md border text-sm font-bold tabular-nums text-right " +
                (priceHasOverride
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900")
              }
            />
            <span className="text-xs text-muted-foreground shrink-0">€</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            default: {defaultPrice}
          </div>
        </label>

        {/* NÁKUP */}
        <label className="block">
          <div className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-400 mb-0.5">
            Nákup €/m²
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
          <div className="text-[10px] text-muted-foreground mt-0.5">
            naša nákupná
          </div>
        </label>

        {/* SPOTREBA */}
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
          <div className="text-[10px] text-muted-foreground mt-0.5">
            pre postupy realizátorov
          </div>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={saveAll}
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
          {saved ? "Uložené" : "Uložiť všetko"}
        </button>
        {(priceHasOverride || costHasVal || consumptionHasVal) && (
          <button
            type="button"
            onClick={clearAll}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 px-2 py-1.5 disabled:opacity-40"
            title="Vymazať všetky 3 hodnoty (vrátiť na default)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
      </div>
    </li>
  );
}
