"use client";

import * as React from "react";
import { Loader2, Palette, Save, Trash2 } from "lucide-react";
import { saveSettingV2 } from "@/app/admin/settings/actions";
import {
  FLOOR_TYPE_LABELS,
  MATERIALS,
  PRICEABLE_MATERIAL_IDS,
  type FloorType,
} from "@/lib/data/materials";

type Setting = { key: string; value: unknown };

export function CennikMaterialovClient({ settings }: { settings: Setting[] }) {
  const priceMap = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of settings) {
      const key = s.key;
      if (!key.startsWith("material.") || !key.endsWith(".price_per_sqm"))
        continue;
      const id = key.slice("material.".length, -".price_per_sqm".length);
      const raw = s.value;
      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (isFinite(num) && num >= 0) m[id] = num;
    }
    return m;
  }, [settings]);

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
            <div className="text-sm font-black tracking-tight flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-violet-500" aria-hidden />
              {FLOOR_TYPE_LABELS[floorType]}
              <span className="text-xs opacity-60 font-normal">
                ({items.length})
              </span>
            </div>
            <ul className="space-y-1.5">
              {items.map((m) => (
                <MaterialPriceRow
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  variant={m.variant}
                  defaultPrice={m.price_per_sqm}
                  override={priceMap[m.id]}
                />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function MaterialPriceRow({
  id,
  name,
  variant,
  defaultPrice,
  override,
}: {
  id: string;
  name: string;
  variant?: "epoxid" | "polyuretan";
  defaultPrice: number;
  override?: number;
}) {
  const [val, setVal] = React.useState<string>(
    override != null ? String(override) : "",
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const trimmed = val.trim();
      if (trimmed) {
        const num = parseFloat(trimmed);
        if (!isFinite(num) || num < 0) {
          alert("Nesprávna cena — musí byť kladné číslo alebo prázdne.");
          return;
        }
      }
      await saveSettingV2(`material.${id}.price_per_sqm`, trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    setVal("");
    setSaving(true);
    try {
      await saveSettingV2(`material.${id}.price_per_sqm`, "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = override != null;
  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2 flex items-center gap-2 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-black">
          {name}
          {variant && (
            <span className="ml-2 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              {variant}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">{id}</div>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        default:{" "}
        <span className="font-black text-slate-700 dark:text-slate-300">
          {defaultPrice} €/m²
        </span>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.01"
          min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="—"
          className={
            "h-9 w-24 px-2 rounded-md border text-sm font-bold tabular-nums text-right " +
            (hasOverride
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900")
          }
        />
        <span className="text-xs text-muted-foreground">€/m²</span>
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
          {saved ? "Uložené" : "Uložiť"}
        </button>
        {hasOverride && (
          <button
            type="button"
            onClick={clearOverride}
            disabled={saving}
            className="text-xs font-bold text-rose-600 hover:text-rose-800 px-2 py-1 disabled:opacity-40"
            title="Vymazať override, vrátiť na default"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
