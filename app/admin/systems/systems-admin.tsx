"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * SystemsAdmin — CRUD UI pre realizačné systémy (264, 3000, TopStopne…).
 * User: "daj mi aj moznost pridat novy system a pridelit ho do typu podlahy".
 * User: "admin musi mat moznost tieto postupy taktiez upravovat".
 */

type Product = {
  id: string;
  product_role: string;
  sku: string;
  label: string;
  consumption_per_m2: number;
  unit_size_kg: number;
  unit_label: string;
  sort_order: number;
  /** Cena za jedno balenie (napr. 1 sud = 25 kg → 150 €). Optional. */
  price_per_unit?: number | null;
  /** Spec 2026-07-18 Faza 2: kolkokrat sa vrstva aplikuje. Default 1. */
  pocet_vrstiev?: number;
  /** Voliteľná vrstva — obchodák ju môže zaškrtnúť/odškrtnúť v CP. */
  volitelna?: boolean;
  /** Rezerva % pre výpočet potreby kg (default 8 %). */
  rezerva_percent?: number;
};

/** Vypočítaná cena za m² pre daný produkt.
 *  = spotreba_kg_na_m2 × (cena_za_balenie / veľkosť_balenia_kg)
 *  Vráti null ak niektorý vstup chýba alebo je 0.
 */
function computeProductPricePerM2(p: {
  consumption_per_m2: number;
  unit_size_kg: number;
  price_per_unit?: number | null;
  pocet_vrstiev?: number;
}): number | null {
  if (!p.price_per_unit || !p.unit_size_kg) return null;
  const pricePerKg = p.price_per_unit / p.unit_size_kg;
  const vrstvy = p.pocet_vrstiev && p.pocet_vrstiev > 0 ? p.pocet_vrstiev : 1;
  return p.consumption_per_m2 * pricePerKg * vrstvy;
}

// PREDAJ za m² — default 37% marza (MARZA_MATERIAL_PER_ROLE z lib/data/pricing).
// User 2026-07-18: „v realizacne systemy musi ukazovat aj cenu za m2 kolko sa
// to bude predavat a cenu kolko to stoji nas na m2".
const DEFAULT_MARZA = 0.37;
function computeSellPricePerM2(p: {
  consumption_per_m2: number;
  unit_size_kg: number;
  price_per_unit?: number | null;
  pocet_vrstiev?: number;
}): number | null {
  const cost = computeProductPricePerM2(p);
  if (cost == null) return null;
  return cost / (1 - DEFAULT_MARZA);
}

// Potreba kg/m² = spotreba × vrstvy × (1 + rezerva %). Spec 2026-07-18 Faza 2.
function computeProductPotrebaKgPerM2(p: {
  consumption_per_m2: number;
  pocet_vrstiev?: number;
  rezerva_percent?: number;
}): number {
  const vrstvy = p.pocet_vrstiev && p.pocet_vrstiev > 0 ? p.pocet_vrstiev : 1;
  const rezerva =
    p.rezerva_percent != null && p.rezerva_percent >= 0
      ? p.rezerva_percent
      : 8;
  return p.consumption_per_m2 * vrstvy * (1 + rezerva / 100);
}

function fmtEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2).replace(/\.?0+$/, "") + " €";
}

type ProcedureStep = { step: number; title: string; note: string };
type ResponsibilityStep = { step: number; title: string; isControl?: boolean };

type System = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  floor_type: string;
  /** Multi floor types — user 2026-07-18. Ak chyba (stary system), fallback
   *  je [floor_type]. */
  floor_types?: string[];
  binder: string | null;
  sort_order: number;
  active: boolean;
  procedure_steps: unknown;
  responsibility_steps?: unknown;
  products: Product[];
};

const FLOOR_TYPES: Array<{ v: string; label: string }> = [
  { v: "jednofarebna", label: "Jednofarebná" },
  { v: "chipsova", label: "Chipsová" },
  { v: "mramorova", label: "Mramorová" },
  { v: "metalicka", label: "Metalická" },
];

const PRODUCT_ROLES: Array<{ v: string; label: string }> = [
  { v: "primer", label: "Penetrácia (primer)" },
  { v: "binder", label: "Hlavná živica (binder)" },
  { v: "topcoat", label: "Vrchný lak (topcoat)" },
  { v: "chip", label: "Chipsy" },
  { v: "other", label: "Iné" },
];

export type LibraryStep = {
  id: string;
  title: string;
  default_note: string;
  sort_order: number;
  active: boolean;
};

export function SystemsAdmin({
  initialSystems,
}: {
  initialSystems: System[];
}) {
  const router = useRouter();
  const [systems, setSystems] = React.useState<System[]>(initialSystems);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [library, setLibrary] = React.useState<LibraryStep[]>([]);
  // Reorder mode — user 2026-07-18: „takisto aj pri realizacnych systemoch
  // chcem mat moznost ich presuvat ako ja chcem". Ked reorderMode=true,
  // kazdy SystemCard ukaze ChevronUp/Down; save prepocita sort_order a
  // batch-PATCH-ne cez API.
  const [reorderMode, setReorderMode] = React.useState(false);
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [orderSaved, setOrderSaved] = React.useState(false);

  function moveSystemUp(idx: number) {
    if (idx === 0) return;
    setSystems((prev) => {
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveSystemDown(idx: number) {
    setSystems((prev) => {
      if (idx === prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }
  async function saveSystemOrder() {
    setSavingOrder(true);
    setOrderSaved(false);
    try {
      // Prepocitaj sort_order: 10, 20, 30, ... (necham medzery aby manualny
      // insert medzi bol jednoduchy).
      const updates = systems.map((s, i) => ({
        id: s.id,
        sort_order: (i + 1) * 10,
      }));
      await Promise.all(
        updates.map((u) =>
          fetch("/api/admin/systems", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u),
          }),
        ),
      );
      setOrderSaved(true);
      setReorderMode(false);
      setTimeout(() => setOrderSaved(false), 1500);
      void refresh();
    } finally {
      setSavingOrder(false);
    }
  }

  async function refresh() {
    try {
      const r = await fetch("/api/admin/systems");
      const j = await r.json();
      if (j.ok) setSystems(j.systems);
    } catch {
      /* ignore */
    }
    router.refresh();
  }

  async function refreshLibrary() {
    try {
      const r = await fetch("/api/admin/procedure-step-library");
      const j = await r.json();
      if (j.ok) setLibrary(j.steps as LibraryStep[]);
    } catch {
      /* ignore — chýbajúca migrácia 40 */
    }
  }

  React.useEffect(() => {
    void refreshLibrary();
  }, []);

  return (
    <div className="space-y-3">
      {/* User 2026-07-18: „ta kniznica krokov nech je radsej tam v tom poli
          postup krokov vedla hned to bude lepsie". Top-level tab
          „Knižnica krokov" bol zbytocny — refactor: LibraryPanel je
          teraz inline v Postup krokov cez tlacidlo „Spravovať knižnicu"
          v StepsEditor headeri. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Systémy ({systems.length})
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!reorderMode ? (
            <>
              <button
                type="button"
                onClick={() => setReorderMode(true)}
                className="inline-flex items-center gap-1 rounded-md border-2 border-sky-300 dark:border-sky-800 bg-white dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-black px-3 py-1.5 hover:border-sky-500"
                title="Presúvať systémy hore/dole a uložiť poradie"
              >
                ✎ Upraviť poradie
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Nový systém
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setReorderMode(false);
                  void refresh();
                }}
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black px-3 py-1.5"
              >
                Zrušiť
              </button>
              <button
                type="button"
                onClick={saveSystemOrder}
                disabled={savingOrder}
                className={
                  "inline-flex items-center gap-1 rounded-md text-white text-xs font-black px-3 py-1.5 disabled:opacity-40 " +
                  (orderSaved
                    ? "bg-emerald-500"
                    : "bg-emerald-600 hover:bg-emerald-700")
                }
              >
                {savingOrder ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {orderSaved ? "Uložené" : "Uložiť poradie"}
              </button>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {systems.map((s, i) => (
          <SystemCard
            key={s.id}
            system={s}
            library={library}
            expanded={expanded === s.id}
            onToggle={() =>
              setExpanded((cur) => (cur === s.id ? null : s.id))
            }
            onChanged={refresh}
            onLibraryChanged={refreshLibrary}
            reorderMode={reorderMode}
            isFirst={i === 0}
            isLast={i === systems.length - 1}
            onMoveUp={() => moveSystemUp(i)}
            onMoveDown={() => moveSystemDown(i)}
          />
        ))}
      </ul>

      {creating && (
        <NewSystemModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function SystemCard({
  system,
  library,
  expanded,
  onToggle,
  onChanged,
  onLibraryChanged,
  reorderMode = false,
  isFirst = false,
  isLast = false,
  onMoveUp,
  onMoveDown,
}: {
  system: System;
  library: LibraryStep[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onLibraryChanged: () => void;
  reorderMode?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const steps: ProcedureStep[] = Array.isArray(system.procedure_steps)
    ? (system.procedure_steps as ProcedureStep[])
    : [];
  return (
    <li
      className={cn(
        "rounded-xl border-2 bg-white dark:bg-slate-900 transition-colors relative",
        system.active ? "border-slate-200 dark:border-slate-800" : "border-rose-200 bg-rose-50/40",
        reorderMode && "ring-2 ring-sky-400/40 dark:ring-sky-700",
      )}
    >
      {reorderMode && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-0.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.();
            }}
            disabled={isFirst}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
            title="Nahor"
          >
            <ChevronUp className="w-4 h-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.();
            }}
            disabled={isLast}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
            title="Nadol"
          >
            <ChevronDown className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        disabled={reorderMode}
        className="w-full flex items-center gap-3 p-3 text-left disabled:cursor-default"
      >
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm shrink-0">
          {system.code.substring(0, 4).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base leading-tight">{system.label}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {(system.floor_types && system.floor_types.length > 0
              ? system.floor_types
              : [system.floor_type]
            ).map((ft) => (
              <span
                key={ft}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold"
              >
                {FLOOR_TYPES.find((t) => t.v === ft)?.label ?? ft}
              </span>
            ))}
            {system.binder && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[10px] font-bold capitalize">
                {system.binder}
              </span>
            )}
            <span>
              {system.products.length} komp · {steps.length} krok
              {steps.length === 1 ? "" : steps.length < 5 ? "y" : "ov"}
            </span>
            {!system.active && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                DEAKTIVOVANÝ
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50/40">
          <SystemEditor system={system} onChanged={onChanged} />
          <ProductsEditor system={system} onChanged={onChanged} />
          <StepsEditor
            system={system}
            library={library}
            onChanged={onChanged}
            onLibraryChanged={onLibraryChanged}
          />
          {/* Zodpovednost — user 2026-07-18: „v realizacii daj prec
              zodpovednost toto". Editor komponenty ostáva v kóde
              (mozne skoro pouzit) ale nezobrazujeme ho. */}
          {false && <ResponsibilityStepsEditor system={system} onChanged={onChanged} />}
        </div>
      )}
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────
function SystemEditor({
  system,
  onChanged,
}: {
  system: System;
  onChanged: () => void;
}) {
  const [label, setLabel] = React.useState(system.label);
  const [description, setDescription] = React.useState(
    system.description ?? "",
  );
  // Multi floor_types — user 2026-07-18. Fallback z legacy single floor_type
  // ak novy pole este chyba na starych systemoch.
  const [floorTypes, setFloorTypes] = React.useState<string[]>(
    system.floor_types && system.floor_types.length > 0
      ? system.floor_types
      : system.floor_type
        ? [system.floor_type]
        : ["jednofarebna"],
  );
  const [binder, setBinder] = React.useState(system.binder ?? "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  function toggleFloorType(v: string) {
    setFloorTypes((prev) => {
      if (prev.includes(v)) {
        // nemozeme zmazat vsetky
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== v);
      }
      return [...prev, v];
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/systems", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: system.id,
        label,
        description: description || null,
        floor_types: floorTypes,
        binder:
          floorTypes.includes("jednofarebna") ? binder || null : null,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setMsg("✓ Uložené a nasadené pre celý tím");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        📝 Základné info
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Label (zobrazí sa)">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
          />
        </Field>
        <Field label="Popis">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Krátky popis systému"
            className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
          />
        </Field>
        <Field label="Typ podlahy (môžeš vybrať viac)">
          <div className="flex flex-wrap gap-1.5">
            {FLOOR_TYPES.map((t) => {
              const on = floorTypes.includes(t.v);
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => toggleFloorType(t.v)}
                  className={
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-black border-2 transition-colors " +
                    (on
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-400")
                  }
                >
                  <span>{on ? "✓" : "+"}</span> {t.label}
                </button>
              );
            })}
          </div>
        </Field>
        {floorTypes.includes("jednofarebna") && (
          <Field label="Živica (iba pre jednofarebnu)">
            <select
              value={binder}
              onChange={(e) => setBinder(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            >
              <option value="">— vyber —</option>
              <option value="epoxid">Epoxid</option>
              <option value="polyuretan">Polyuretán</option>
            </select>
          </Field>
        )}
        {/* Aktívny checkbox odstranene — user 2026-07-18: „toto prec".
            System je aktivny defaultne po vytvoreni. Skrytie sa da urobit
            cez zmazanie systemu ak treba. */}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black shadow-sm disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Uložiť
        </button>
        {msg && <span className="text-xs font-bold text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
function ProductsEditor({
  system,
  onChanged,
}: {
  system: System;
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  // Sum náklad/predaj cez všetky komponenty ktoré maju cenu. Voliteľné
  // vrstvy počítajú do sumy len ak sú „volitelna=false" (default include);
  // ak volitelna=true, obchodák si ich v CP zaklikne, nesčítavame default.
  const nonOptional = system.products.filter((p) => !p.volitelna);
  const systemCostPerM2 = nonOptional.reduce((sum, p) => {
    const c = computeProductPricePerM2(p);
    return c != null ? sum + c : sum;
  }, 0);
  const systemSellPerM2 = nonOptional.reduce((sum, p) => {
    const s = computeSellPricePerM2(p);
    return s != null ? sum + s : sum;
  }, 0);
  const systemPotrebaKgPerM2 = system.products.reduce(
    (sum, p) => (p.volitelna ? sum : sum + computeProductPotrebaKgPerM2(p)),
    0,
  );
  const hasPricedProducts = system.products.some(
    (p) => computeProductPricePerM2(p) != null,
  );
  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          📦 Komponenty + spotreba
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 text-xs font-black"
        >
          <Plus className="w-3.5 h-3.5" />
          Pridať komponent
        </button>
      </div>
      {hasPricedProducts && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border-2 border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            🧮 Systém spolu / m²
          </span>
          <span
            className="font-black text-rose-800 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 px-2 py-0.5 rounded text-xs"
            title="Sum nákladov všetkých komponentov s cenou"
          >
            Náklad: {fmtEur(systemCostPerM2)}/m²
          </span>
          <span
            className="font-black text-violet-800 bg-violet-50 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 px-2 py-0.5 rounded text-xs"
            title="Potreba kg/m² so zohľadnením vrstiev + rezervy. Použité na výpočet počtu balení pri objednávke."
          >
            📦 Potreba: {systemPotrebaKgPerM2.toFixed(3)} kg/m²
          </span>
          <span
            className="font-black text-emerald-800 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 px-2 py-0.5 rounded text-xs"
            title={`Predaj = náklad ÷ (1 − ${(DEFAULT_MARZA * 100).toFixed(0)}% marža)`}
          >
            Predaj: {fmtEur(systemSellPerM2)}/m²
          </span>
          <span
            className="ml-auto font-bold text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums"
            title="Predaj − náklad"
          >
            Zisk: {fmtEur(systemSellPerM2 - systemCostPerM2)}/m²
          </span>
        </div>
      )}
      {system.products.length === 0 && !adding && (
        <div className="text-xs text-slate-500 italic">
          Zatiaľ žiadne komponenty. Pridaj aspoň primer + hlavnú živicu.
        </div>
      )}
      <ul className="space-y-2">
        {system.products.map((p) => (
          <ProductRow key={p.id} product={p} onChanged={onChanged} />
        ))}
        {adding && (
          <NewProductRow
            systemId={system.id}
            onCreated={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </ul>
    </section>
  );
}

function ProductRow({
  product,
  onChanged,
}: {
  product: Product;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [role, setRole] = React.useState(product.product_role);
  const [sku, setSku] = React.useState(product.sku);
  const [cons, setCons] = React.useState(String(product.consumption_per_m2));
  const [unitSize, setUnitSize] = React.useState(String(product.unit_size_kg));
  const [unitLabel, setUnitLabel] = React.useState(product.unit_label);
  const [price, setPrice] = React.useState(
    product.price_per_unit != null ? String(product.price_per_unit) : "",
  );
  const [pocetVrstiev, setPocetVrstiev] = React.useState(
    String(product.pocet_vrstiev ?? 1),
  );
  const [volitelna, setVolitelna] = React.useState<boolean>(
    product.volitelna === true,
  );
  const [rezervaPercent, setRezervaPercent] = React.useState(
    String(product.rezerva_percent ?? 8),
  );
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    // Auto-generuj label ze sku + balenie — user 2026-07-18: „label vymaz".
    // Format: „SIKAFLOOR-151 · 10 kg vedro"
    const autoLabel = `${sku} · ${unitSize} kg ${unitLabel}`;
    const r = await fetch("/api/admin/systems/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: product.id,
        product_role: role,
        sku,
        label: autoLabel,
        consumption_per_m2: parseFloat(cons),
        unit_size_kg: parseFloat(unitSize),
        unit_label: unitLabel,
        price_per_unit: price.trim() ? parseFloat(price) : null,
        pocet_vrstiev: parseInt(pocetVrstiev, 10) || 1,
        volitelna,
        rezerva_percent: parseFloat(rezervaPercent) || 8,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) {
      setEditing(false);
      onChanged();
    }
  }

  async function remove() {
    if (!confirm(`Zmazať komponent „${product.label}"?`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/systems/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: product.id }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChanged();
  }

  if (!editing) {
    return (
      <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-3">
        <div className="shrink-0 w-8 h-8 rounded bg-amber-100 text-amber-700 flex items-center justify-center">
          <Package className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black leading-tight">{product.label}</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
            <span className="uppercase font-bold">{product.product_role}</span>
            <span>·</span>
            <span>SKU {product.sku}</span>
            <span>·</span>
            <span>{product.consumption_per_m2} kg/m²</span>
            <span>·</span>
            <span>
              {product.unit_size_kg} kg/{product.unit_label}
            </span>
            {(product.pocet_vrstiev ?? 1) > 1 && (
              <>
                <span>·</span>
                <span className="font-black text-sky-700 dark:text-sky-400">
                  ×{product.pocet_vrstiev} vrstvy
                </span>
              </>
            )}
            {product.volitelna && (
              <span
                className="uppercase font-black text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-1.5 py-0.5 rounded"
                title="Voliteľná vrstva — obchodák ju môže zaškrtnúť/odškrtnúť v cenovej ponuke"
              >
                voliteľné
              </span>
            )}
            {product.price_per_unit != null && (
              <>
                <span>·</span>
                <span className="font-black text-emerald-700">
                  {fmtEur(product.price_per_unit)}/{product.unit_label}
                </span>
              </>
            )}
            {computeProductPricePerM2(product) != null && (
              <>
                <span>·</span>
                <span
                  className="font-black text-rose-800 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 px-1.5 py-0.5 rounded"
                  title="Náklad za m² (cena_za_balenie / balenie × spotreba)"
                >
                  Náklad: {fmtEur(computeProductPricePerM2(product))}/m²
                </span>
                <span
                  className="font-black text-emerald-800 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 px-1.5 py-0.5 rounded"
                  title={`Predaj za m² (náklad ÷ (1 − ${(DEFAULT_MARZA * 100).toFixed(0)}% marža))`}
                >
                  Predaj: {fmtEur(computeSellPricePerM2(product))}/m²
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-bold text-sky-700 hover:underline"
        >
          Upraviť
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-xs font-bold text-rose-700 hover:underline disabled:opacity-50"
        >
          Zmazať
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border-2 border-sky-300 bg-sky-50/40 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rola">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold"
          >
            {PRODUCT_ROLES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Materiál (search / SKU)">
          <MaterialPicker
            currentSku={sku}
            categoryHint={role}
            onPick={(it) => {
              setSku(it.sap_number);
              if (it.consumption_per_m2 != null) setCons(String(it.consumption_per_m2));
              if (it.packaging_kg != null) setUnitSize(String(it.packaging_kg));
              if (it.unit_label) setUnitLabel(it.unit_label);
              if (it.default_cost_eur != null) setPrice(String(it.default_cost_eur));
            }}
            onManualChange={setSku}
          />
        </Field>
        {/* Label field odstranene — user 2026-07-18: „label vymaz". Label
            sa dynamicky odvodi zo SKU + balenia (napr. „SIKAFLOOR-151 · 10 kg
            vedro") aby obchodak nemusel typovat ten isty text 2x.
            Nizsie v save() label sa vypocita ze sku + unitSize + unitLabel. */}
        <Field label="Spotreba (kg/m²)">
          <input
            type="number"
            step="0.01"
            value={cons}
            onChange={(e) => setCons(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
          />
        </Field>
        <Field label="Balenie (kg)">
          <input
            type="number"
            step="0.1"
            value={unitSize}
            onChange={(e) => setUnitSize(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
          />
        </Field>
        <Field label="Jednotka">
          <select
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold"
          >
            <option value="sud">sud</option>
            <option value="vedro">vedro</option>
            <option value="vedierko">vedierko</option>
            <option value="vrece">vrece</option>
          </select>
        </Field>
        <Field label={`Cena za ${unitLabel} (€)`}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="napr. 125"
            className="w-full h-9 px-2 rounded border-2 border-emerald-300 bg-emerald-50/60 text-sm font-bold tabular-nums"
          />
        </Field>
        <Field label="Počet vrstiev">
          <input
            type="number"
            step="1"
            min="1"
            max="10"
            value={pocetVrstiev}
            onChange={(e) => setPocetVrstiev(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
            title="Koľkokrát sa táto vrstva aplikuje. Napr. 2 = 2 nátery"
          />
        </Field>
        <Field label="Rezerva % (odpad)">
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={rezervaPercent}
            onChange={(e) => setRezervaPercent(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
            title="Odpad + zaokrúhlenie na celé sudy pri objednávke (default 8 %)"
          />
        </Field>
        <Field label="Voliteľná">
          <label className="inline-flex items-center gap-2 h-9">
            <input
              type="checkbox"
              checked={volitelna}
              onChange={(e) => setVolitelna(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {volitelna ? "Áno — obchodák zvolí" : "Nie — vždy zahrnutá"}
            </span>
          </label>
        </Field>
      </div>
      {price.trim() && parseFloat(unitSize) > 0 && parseFloat(cons) > 0 && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs font-black text-emerald-800 tabular-nums">
          Auto-výpočet:{" "}
          {fmtEur(
            (parseFloat(cons) * parseFloat(price)) / parseFloat(unitSize),
          )}
          /m²{" "}
          <span className="font-normal opacity-70">
            ({cons} kg/m² × {(parseFloat(price) / parseFloat(unitSize)).toFixed(
              2,
            )}{" "}
            €/kg)
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-3 py-1.5 text-xs font-black"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Uložiť
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-black"
        >
          Zrušiť
        </button>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────
// MaterialPicker — search kombobox z sika_catalog. User 2026-07-18:
// „napisem 151 a vyberem ju". Pri picku auto-fillneme sku/spotreba/
// balenie/cena/jednotku do parent form-y cez onPick(item).
// ────────────────────────────────────────────────────────────────────────
type CatalogItem = {
  sap_number: string;
  name: string;
  packaging: string;
  packaging_kg: number | null;
  default_cost_eur: number | null;
  category: string | null;
  unit_label: string;
  consumption_per_m2: number | null;
};

function MaterialPicker({
  currentSku,
  categoryHint,
  onPick,
  onManualChange,
}: {
  currentSku: string;
  categoryHint?: string;
  onPick: (item: CatalogItem) => void;
  onManualChange: (sku: string) => void;
}) {
  const [q, setQ] = React.useState(currentSku);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // Sync q pri external change (napr. po picku sa currentSku prepise)
  React.useEffect(() => {
    setQ(currentSku);
  }, [currentSku]);

  // Debounced search
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim().length > 0) params.set("q", q.trim());
        if (categoryHint) params.set("category", categoryHint);
        const r = await fetch(`/api/admin/materials-catalog?${params.toString()}`);
        const j = (await r.json()) as { ok?: boolean; items?: CatalogItem[] };
        if (j.ok && j.items) setItems(j.items);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, categoryHint]);

  // Click outside → close
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          onManualChange(e.target.value);
          setOpen(true);
        }}
        placeholder="Napíš 151 → vyber Sikafloor-151"
        className="w-full h-9 px-2 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 text-sm font-bold"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-500">Hľadám…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-3 text-xs text-slate-500 italic">
              Nič — voľne napíš SKU alebo pridaj materiál v Cenníku.
            </div>
          )}
          {items.map((it) => (
            <button
              key={it.sap_number}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(it);
                setQ(it.sap_number);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-sky-50 dark:hover:bg-sky-950/40 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
            >
              <div className="text-sm font-black">{it.name}</div>
              <div className="text-[10px] text-slate-500 flex gap-2 flex-wrap tabular-nums">
                <span className="font-mono">{it.sap_number}</span>
                {it.packaging && <span>· {it.packaging}</span>}
                {it.consumption_per_m2 != null && (
                  <span>· spotreba {it.consumption_per_m2} kg/m²</span>
                )}
                {it.default_cost_eur != null && (
                  <span className="font-black text-emerald-700 dark:text-emerald-400">
                    · {it.default_cost_eur} €/{it.unit_label}
                  </span>
                )}
                {it.category && (
                  <span className="uppercase font-bold">· {it.category}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewProductRow({
  systemId,
  onCreated,
  onCancel,
}: {
  systemId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [role, setRole] = React.useState("primer");
  const [sku, setSku] = React.useState("");
  const [cons, setCons] = React.useState("");
  const [unitSize, setUnitSize] = React.useState("");
  const [unitLabel, setUnitLabel] = React.useState("sud");
  const [price, setPrice] = React.useState("");
  const [pocetVrstiev, setPocetVrstiev] = React.useState("1");
  const [volitelna, setVolitelna] = React.useState<boolean>(false);
  const [rezervaPercent, setRezervaPercent] = React.useState("8");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Auto-fill fields po picku z catalog — user 2026-07-18: „ostatne veci
  // spotreba, jednotka sud, cena za sud vsetko je v cennik materialov
  // nemusi to tam byt nech si to bere data odtial".
  function pickCatalogItem(it: CatalogItem) {
    setSku(it.sap_number);
    if (it.consumption_per_m2 != null) setCons(String(it.consumption_per_m2));
    if (it.packaging_kg != null) setUnitSize(String(it.packaging_kg));
    if (it.unit_label) setUnitLabel(it.unit_label);
    if (it.default_cost_eur != null) setPrice(String(it.default_cost_eur));
    if (it.category && ["primer", "binder", "topcoat", "chip", "other"].includes(it.category)) {
      setRole(it.category);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    // Label sa auto-generuje zo SKU + balenia — user 2026-07-18: „label vymaz".
    const autoLabel = `${sku} · ${unitSize} kg ${unitLabel}`;
    const r = await fetch("/api/admin/systems/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_id: systemId,
        product_role: role,
        sku,
        label: autoLabel,
        consumption_per_m2: parseFloat(cons),
        unit_size_kg: parseFloat(unitSize),
        unit_label: unitLabel,
        price_per_unit: price.trim() ? parseFloat(price) : null,
        pocet_vrstiev: parseInt(pocetVrstiev, 10) || 1,
        volitelna,
        rezerva_percent: parseFloat(rezervaPercent) || 8,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setErr(j.error);
      return;
    }
    onCreated();
  }

  return (
    <li className="rounded-lg border-2 border-dashed border-sky-400 bg-sky-50/50 p-3 space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-sky-800">
        + Nový komponent
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rola">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold"
          >
            {PRODUCT_ROLES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Materiál (search)">
          <MaterialPicker
            currentSku={sku}
            categoryHint={role}
            onPick={pickCatalogItem}
            onManualChange={setSku}
          />
        </Field>
        <Field label="Spotreba (kg/m²)">
          <input
            type="number"
            step="0.01"
            value={cons}
            onChange={(e) => setCons(e.target.value)}
            placeholder="0.30"
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
          />
        </Field>
        <Field label="Balenie (kg)">
          <input
            type="number"
            step="0.1"
            value={unitSize}
            onChange={(e) => setUnitSize(e.target.value)}
            placeholder="30"
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
          />
        </Field>
        <Field label="Jednotka">
          <select
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold"
          >
            <option value="sud">sud</option>
            <option value="vedro">vedro</option>
            <option value="vedierko">vedierko</option>
            <option value="vrece">vrece</option>
          </select>
        </Field>
        <Field label={`Cena za ${unitLabel} (€)`}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="voliteľné"
            className="w-full h-9 px-2 rounded border-2 border-emerald-300 bg-emerald-50/60 text-sm font-bold tabular-nums"
          />
        </Field>
        <Field label="Počet vrstiev">
          <input
            type="number"
            step="1"
            min="1"
            max="10"
            value={pocetVrstiev}
            onChange={(e) => setPocetVrstiev(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
            title="Koľkokrát sa táto vrstva aplikuje (napr. 2 = dvojitý náter)"
          />
        </Field>
        <Field label="Rezerva % (odpad)">
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={rezervaPercent}
            onChange={(e) => setRezervaPercent(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold tabular-nums"
            title="Odpad + zaokrúhlenie na celé sudy pri objednávke (default 8 %)"
          />
        </Field>
        <Field label="Voliteľná">
          <label className="inline-flex items-center gap-2 h-9">
            <input
              type="checkbox"
              checked={volitelna}
              onChange={(e) => setVolitelna(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {volitelna ? "Áno" : "Nie"}
            </span>
          </label>
        </Field>
      </div>
      {price.trim() &&
        parseFloat(unitSize) > 0 &&
        parseFloat(cons) > 0 && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs font-black text-emerald-800 tabular-nums">
            Auto:{" "}
            {fmtEur(
              (parseFloat(cons) * parseFloat(price)) / parseFloat(unitSize),
            )}
            /m²
          </div>
        )}
      {err && <div className="text-xs text-rose-700">⚠ {err}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-3 py-1.5 text-xs font-black"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Pridať
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-black"
        >
          Zrušiť
        </button>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────
function StepsEditor({
  system,
  library,
  onChanged,
  onLibraryChanged,
}: {
  system: System;
  library: LibraryStep[];
  onChanged: () => void;
  onLibraryChanged: () => void;
}) {
  const initial: ProcedureStep[] = Array.isArray(system.procedure_steps)
    ? (system.procedure_steps as ProcedureStep[])
    : [];
  const [steps, setSteps] = React.useState<ProcedureStep[]>(initial);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [showLibrary, setShowLibrary] = React.useState(false);

  function add() {
    setSteps((prev) => [
      ...prev,
      { step: prev.length + 1, title: "", note: "" },
    ]);
  }
  function addFromLibrary(libId: string) {
    const lib = library.find((l) => l.id === libId);
    if (!lib) return;
    setSteps((prev) => [
      ...prev,
      {
        step: prev.length + 1,
        title: lib.title,
        note: lib.default_note,
      },
    ]);
  }
  function update(i: number, patch: Partial<ProcedureStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    setSteps((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((s, idx) => ({ ...s, step: idx + 1 })),
    );
  }
  function moveUp(i: number) {
    if (i === 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next.map((s, idx) => ({ ...s, step: idx + 1 }));
    });
  }
  function moveDown(i: number) {
    setSteps((prev) => {
      if (i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next.map((s, idx) => ({ ...s, step: idx + 1 }));
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/systems", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: system.id, procedure_steps: steps }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setMsg("✓ Postup uložený — realizátori uvidia zmenu okamžite");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          🔨 Postup krokov (uvidí realizator)
        </div>
        <div className="flex items-center gap-1.5">
          {library.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addFromLibrary(e.target.value);
                  e.target.value = "";
                }
              }}
              defaultValue=""
              className="h-7 rounded border border-slate-300 text-xs font-bold px-2 bg-white hover:bg-slate-50 cursor-pointer"
              title="Pridať krok z knižnice — title + default popis sa skopírujú"
            >
              <option value="" disabled>
                📚 Pridať z knižnice…
              </option>
              {library
                .filter((l) => l.active)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 text-xs font-black"
          >
            <Plus className="w-3.5 h-3.5" />
            Prázdny krok
          </button>
          {/* Toggle inline library management — user 2026-07-18: „ta
              kniznica krokov nech je radsej tam v tom poli postup krokov
              vedla hned to bude lepsie". */}
          <button
            type="button"
            onClick={() => setShowLibrary((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-black transition-colors",
              showLibrary
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white border-violet-300 text-violet-700 hover:bg-violet-50 dark:bg-slate-800 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-slate-700",
            )}
            title="Spravovať knižnicu krokov (pridať/upraviť/zmazať)"
          >
            📚 {showLibrary ? "Zavrieť knižnicu" : `Knižnica (${library.length})`}
          </button>
        </div>
      </div>
      {showLibrary && (
        <div className="rounded-lg border-2 border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20 p-3">
          <LibraryPanel library={library} onChanged={onLibraryChanged} />
        </div>
      )}
      {steps.length === 0 && (
        <div className="text-xs text-slate-500 italic">
          Zatiaľ žiadne kroky.
        </div>
      )}
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-200 bg-slate-50 p-2 flex gap-2"
          >
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center text-xs">
                {s.step}
              </div>
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                title="Nahor"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === steps.length - 1}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                title="Nadol"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 space-y-1.5">
              <input
                value={s.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder={`Názov kroku (napr. „Penetrácia — Sikafloor 151")`}
                className="w-full h-8 px-2 rounded border border-slate-300 text-sm font-black"
              />
              <textarea
                rows={2}
                value={s.note}
                onChange={(e) => update(i, { note: e.target.value })}
                placeholder="Podrobnosti (spotreba, sušenie, tipy…)"
                className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-semibold resize-none"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 text-rose-500 hover:text-rose-700"
              title="Zmazať krok"
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Uložiť postup
        </button>
        {msg && <span className="text-xs font-bold text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
function NewSystemModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = React.useState("");
  const [description, setDescription] = React.useState("");
  // Multi floor_types — user 2026-07-18. Default aspon 1.
  const [floorTypes, setFloorTypes] = React.useState<string[]>(["jednofarebna"]);
  const [binder, setBinder] = React.useState("epoxid");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function toggleFloorType(v: string) {
    setFloorTypes((prev) => {
      if (prev.includes(v)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== v);
      }
      return [...prev, v];
    });
  }

  async function save() {
    if (!label.trim()) {
      setErr("Label je povinný");
      return;
    }
    if (floorTypes.length === 0) {
      setErr("Vyber aspoň 1 typ podlahy");
      return;
    }
    // Auto-generate slug/code from label — user 2026-07-18: „v novy system
    // daj prec to kod". Interny identifikator vytvorime zo slug labelu
    // + timestamp suffix aby nekolidoval s existujucim.
    const autoCode =
      label
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || `sys-${Date.now().toString(36)}`;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: autoCode,
        label: label.trim(),
        description: description || null,
        floor_types: floorTypes,
        binder: floorTypes.includes("jednofarebna") ? binder : null,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setErr(j.error);
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white px-5 py-3 flex items-center gap-3">
          <Package className="w-5 h-5" />
          <div className="font-black text-lg">Nový systém</div>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Label (zobrazí sa)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="napr. Sikafloor 264"
              autoFocus
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            />
          </Field>
          <Field label="Popis">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="napr. Epoxid, univerzálny 2K"
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            />
          </Field>
          <Field label="Typ podlahy (viac možností)">
            <div className="flex flex-wrap gap-1.5">
              {FLOOR_TYPES.map((t) => {
                const on = floorTypes.includes(t.v);
                return (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => toggleFloorType(t.v)}
                    className={
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-black border-2 transition-colors " +
                      (on
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-400")
                    }
                  >
                    <span>{on ? "✓" : "+"}</span> {t.label}
                  </button>
                );
              })}
            </div>
          </Field>
          {floorTypes.includes("jednofarebna") && (
            <Field label="Živica (iba pre jednofarebnu)">
              <select
                value={binder}
                onChange={(e) => setBinder(e.target.value)}
                className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                <option value="epoxid">Epoxid</option>
                <option value="polyuretan">Polyuretán</option>
              </select>
            </Field>
          )}
          {err && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
              ⚠ {err}
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 bg-slate-50 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2 text-sm font-bold"
          >
            Zrušiť
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Vytvoriť
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function Trash({ ...props }: React.SVGProps<SVGSVGElement>) {
  return <Trash2 {...props} />;
}
void Trash;

// ──────────────────────────────────────────────────────────────────────
// Responsibility Steps Editor — kroky pre Protokol Zodpovednosti
// User 2026-07-12: "ak pridam system co to ma zmenit na postupe a
// zodpovednosti a taktiez inventure … v admine ked pridam system to musi
// implikovat ostatne veci"
function ResponsibilityStepsEditor({
  system,
  onChanged,
}: {
  system: System;
  onChanged: () => void;
}) {
  const initial: ResponsibilityStep[] = Array.isArray(system.responsibility_steps)
    ? (system.responsibility_steps as ResponsibilityStep[])
    : [];
  const [steps, setSteps] = React.useState<ResponsibilityStep[]>(initial);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  function add() {
    setSteps((prev) => [
      ...prev,
      { step: prev.length + 1, title: "", isControl: false },
    ]);
  }
  function update(i: number, patch: Partial<ResponsibilityStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    setSteps((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((s, idx) => ({ ...s, step: idx + 1 })),
    );
  }
  function moveUp(i: number) {
    if (i === 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next.map((s, idx) => ({ ...s, step: idx + 1 }));
    });
  }
  function moveDown(i: number) {
    setSteps((prev) => {
      if (i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next.map((s, idx) => ({ ...s, step: idx + 1 }));
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/systems", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: system.id, responsibility_steps: steps }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setMsg("✓ Zodpovednosť uložená — realizátori uvidia zmenu okamžite");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          ✍️ Zodpovednosť — kroky (uvidí realizator na Zodpovednosť papieri)
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-xs font-black"
        >
          <Plus className="w-3.5 h-3.5" />
          Krok
        </button>
      </div>
      <div className="text-[10px] text-slate-600 leading-snug bg-amber-50 border border-amber-200 rounded p-2">
        Tieto kroky sa auto-priradia členom tímu round-robin. Ak označíš{" "}
        <strong>Kontrolný</strong>, na papieri má sivé pozadie a poznámku
        &quot;podpisuje INÁ osoba&quot;. Príklad chipsová: pridaj 11. krok
        &quot;Sypanie chipsov&quot;.
      </div>
      {steps.length === 0 && (
        <div className="text-xs text-slate-500 italic">
          Zatiaľ žiadne kroky. Pridaj — inak Zodpovednosť papier bude prázdny.
        </div>
      )}
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "rounded-lg border p-2 flex gap-2",
              s.isControl
                ? "border-amber-300 bg-amber-50/60"
                : "border-slate-200 bg-slate-50",
            )}
          >
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-amber-600 text-white font-black flex items-center justify-center text-xs">
                {s.step}
              </div>
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                title="Nahor"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === steps.length - 1}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                title="Nadol"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 space-y-1.5">
              <input
                value={s.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder={`Názov kroku (napr. Sypanie chipsov)`}
                className="w-full h-8 px-2 rounded border border-slate-300 text-sm font-black"
              />
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                <input
                  type="checkbox"
                  checked={!!s.isControl}
                  onChange={(e) => update(i, { isControl: e.target.checked })}
                  className="w-3.5 h-3.5"
                />
                ⚠ Kontrolný krok (INÁ osoba podpisuje)
              </label>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 text-rose-500 hover:text-rose-700"
              title="Zmazať krok"
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Uložiť Zodpovednosť
        </button>
        {msg && <span className="text-xs font-bold text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// LibraryPanel — CRUD pre `procedure_step_library`. Admin si spravuje
// zoznam typicky-použiteľných krokov aj s default popismi. Keď potom
// tvorí systém, vyberá z tohto zoznamu.
//
// User 2026-07-12: „pridaj toto do admina ako jednotlive body ktore mozem
// pridavat k systemom … mozem ku tomu bodu dat popis najskor a potom
// pridelujem uz iba".
function LibraryPanel({
  library,
  onChanged,
}: {
  library: LibraryStep[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);

  async function createStep() {
    const title = newTitle.trim();
    if (!title) return;
    setBusyId("__create__");
    const maxSort =
      library.length > 0
        ? Math.max(...library.map((l) => l.sort_order))
        : 0;
    const r = await fetch("/api/admin/procedure-step-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        default_note: "",
        sort_order: maxSort + 10,
      }),
    });
    const j = await r.json();
    setBusyId(null);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setNewTitle("");
    setMsg("✓ Pridané");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  async function update(id: string, patch: Partial<LibraryStep>) {
    setBusyId(id);
    const r = await fetch("/api/admin/procedure-step-library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const j = await r.json();
    setBusyId(null);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setMsg("✓ Uložené a nasadené pre celý tím");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  async function del(id: string) {
    if (!confirm("Odstrániť tento krok z knižnice? Systémy ktoré ho už majú pridaný ostanú nedotknuté.")) return;
    setBusyId(id);
    const r = await fetch("/api/admin/procedure-step-library", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    setBusyId(null);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setMsg("✓ Odstránené");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  return (
    <section className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-black text-slate-900">
            📚 Knižnica krokov postupu
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Zoznam typicky-použiteľných krokov. Ku každému môžeš mať default
            popis (materiál, spotreba, tipy). Pri tvorbe systému ich vyberáš
            z rozbaľovacieho zoznamu — title + popis sa skopírujú.
          </div>
        </div>
        {msg && (
          <span className="text-xs font-bold text-emerald-700">{msg}</span>
        )}
      </div>

      {/* Pridať nový krok */}
      <div className="flex items-center gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createStep();
          }}
          placeholder={`Názov nového kroku (napr. „Ofóliovanie")`}
          className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={createStep}
          disabled={busyId === "__create__" || !newTitle.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-sm font-black disabled:opacity-50"
        >
          {busyId === "__create__" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Pridať
        </button>
      </div>

      {/* Zoznam krokov */}
      {library.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Knižnica je prázdna. Pridaj prvý krok vyššie alebo spusti migráciu
          <code className="mx-1 px-1 py-0.5 rounded bg-slate-200 font-mono text-xs">
            40_procedure_step_library.sql
          </code>
          ktorá zaseeduje 23 default krokov.
        </div>
      ) : (
        <ol className="space-y-2">
          {library.map((l) => (
            <LibraryStepRow
              key={l.id}
              step={l}
              busy={busyId === l.id}
              onUpdate={(patch) => update(l.id, patch)}
              onDelete={() => del(l.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function LibraryStepRow({
  step,
  busy,
  onUpdate,
  onDelete,
}: {
  step: LibraryStep;
  busy: boolean;
  onUpdate: (patch: Partial<LibraryStep>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = React.useState(step.title);
  const [note, setNote] = React.useState(step.default_note);
  const [expanded, setExpanded] = React.useState(false);
  const dirty = title !== step.title || note !== step.default_note;

  React.useEffect(() => {
    setTitle(step.title);
    setNote(step.default_note);
  }, [step.title, step.default_note]);

  return (
    <li
      className={cn(
        "rounded-lg border-2 bg-white p-2.5 transition-colors",
        step.active ? "border-slate-200" : "border-rose-200 bg-rose-50/40",
        dirty && "ring-2 ring-amber-300",
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-0 h-8 px-2 rounded border border-slate-300 text-sm font-black"
        />
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="rounded px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
        >
          {expanded ? "▲ Skryť popis" : `▼ Popis${note ? " ✓" : ""}`}
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ active: !step.active })}
          disabled={busy}
          className={cn(
            "rounded px-2 py-1 text-xs font-bold",
            step.active
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-rose-50 text-rose-700 hover:bg-rose-100",
          )}
        >
          {step.active ? "Aktívny" : "Vypnutý"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => onUpdate({ title, default_note: note })}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-black"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Uložiť
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded p-1 text-rose-500 hover:bg-rose-50"
          title="Odstrániť z knižnice"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {expanded && (
        <div className="mt-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Default popis — čo tento krok obnáša (materiál, spotreba, tipy, kontrola). Skopíruje sa keď krok pridáš do systému."
            className="w-full px-3 py-2 rounded border border-slate-300 text-sm resize-y"
          />
        </div>
      )}
    </li>
  );
}
