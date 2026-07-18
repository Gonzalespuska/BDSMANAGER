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
};

/** Vypočítaná cena za m² pre daný produkt.
 *  = spotreba_kg_na_m2 × (cena_za_balenie / veľkosť_balenia_kg)
 *  Vráti null ak niektorý vstup chýba alebo je 0.
 */
function computeProductPricePerM2(p: {
  consumption_per_m2: number;
  unit_size_kg: number;
  price_per_unit?: number | null;
}): number | null {
  if (!p.price_per_unit || !p.unit_size_kg) return null;
  const pricePerKg = p.price_per_unit / p.unit_size_kg;
  return p.consumption_per_m2 * pricePerKg;
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
  const [libraryTab, setLibraryTab] = React.useState(false);

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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLibraryTab(false)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors",
              !libraryTab
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            Systémy ({systems.length})
          </button>
          <button
            type="button"
            onClick={() => setLibraryTab(true)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors",
              libraryTab
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            📚 Knižnica krokov ({library.length})
          </button>
        </div>
        {!libraryTab && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nový systém
          </button>
        )}
      </div>

      {libraryTab ? (
        <LibraryPanel library={library} onChanged={refreshLibrary} />
      ) : (
        <ul className="space-y-2">
          {systems.map((s) => (
            <SystemCard
              key={s.id}
              system={s}
              library={library}
              expanded={expanded === s.id}
              onToggle={() =>
                setExpanded((cur) => (cur === s.id ? null : s.id))
              }
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

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
}: {
  system: System;
  library: LibraryStep[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const steps: ProcedureStep[] = Array.isArray(system.procedure_steps)
    ? (system.procedure_steps as ProcedureStep[])
    : [];
  return (
    <li
      className={cn(
        "rounded-xl border-2 bg-white transition-colors",
        system.active ? "border-slate-200" : "border-rose-200 bg-rose-50/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm shrink-0">
          {system.code.substring(0, 4).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base leading-tight">{system.label}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
              {FLOOR_TYPES.find((t) => t.v === system.floor_type)?.label ??
                system.floor_type}
            </span>
            {system.binder && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold capitalize">
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
          <StepsEditor system={system} library={library} onChanged={onChanged} />
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
  const [floorType, setFloorType] = React.useState(system.floor_type);
  const [binder, setBinder] = React.useState(system.binder ?? "");
  const [sortOrder, setSortOrder] = React.useState(String(system.sort_order));
  const [active, setActive] = React.useState(system.active);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

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
        floor_type: floorType,
        binder: floorType === "jednofarebna" ? binder || null : null,
        sort_order: parseInt(sortOrder) || 100,
        active,
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
        <Field label="Poradie (nižšie = vyššie hore)">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold tabular-nums"
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
        <Field label="Typ podlahy">
          <select
            value={floorType}
            onChange={(e) => setFloorType(e.target.value)}
            className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
          >
            {FLOOR_TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        {floorType === "jednofarebna" && (
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
  const [label, setLabel] = React.useState(product.label);
  const [cons, setCons] = React.useState(String(product.consumption_per_m2));
  const [unitSize, setUnitSize] = React.useState(String(product.unit_size_kg));
  const [unitLabel, setUnitLabel] = React.useState(product.unit_label);
  const [price, setPrice] = React.useState(
    product.price_per_unit != null ? String(product.price_per_unit) : "",
  );
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const r = await fetch("/api/admin/systems/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: product.id,
        product_role: role,
        sku,
        label,
        consumption_per_m2: parseFloat(cons),
        unit_size_kg: parseFloat(unitSize),
        unit_label: unitLabel,
        price_per_unit: price.trim() ? parseFloat(price) : null,
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
                <span className="font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                  {fmtEur(computeProductPricePerM2(product))}/m²
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
        <Field label="SKU">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold"
          />
        </Field>
        <Field label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold col-span-2"
          />
        </Field>
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
  const [label, setLabel] = React.useState("");
  const [cons, setCons] = React.useState("");
  const [unitSize, setUnitSize] = React.useState("");
  const [unitLabel, setUnitLabel] = React.useState("sud");
  const [price, setPrice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/systems/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_id: systemId,
        product_role: role,
        sku,
        label,
        consumption_per_m2: parseFloat(cons),
        unit_size_kg: parseFloat(unitSize),
        unit_label: unitLabel,
        price_per_unit: price.trim() ? parseFloat(price) : null,
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
        <Field label="SKU">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="napr. SIKAFLOOR-151"
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold"
          />
        </Field>
        <Field label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="napr. Sikafloor-151 Primer 10 kg"
            className="w-full h-9 px-2 rounded border border-slate-300 text-sm font-bold col-span-2"
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
}: {
  system: System;
  library: LibraryStep[];
  onChanged: () => void;
}) {
  const initial: ProcedureStep[] = Array.isArray(system.procedure_steps)
    ? (system.procedure_steps as ProcedureStep[])
    : [];
  const [steps, setSteps] = React.useState<ProcedureStep[]>(initial);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

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
        </div>
      </div>
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
  const [code, setCode] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [floorType, setFloorType] = React.useState("jednofarebna");
  const [binder, setBinder] = React.useState("epoxid");
  const [sortOrder, setSortOrder] = React.useState("100");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    if (!label.trim()) {
      setErr("Label je povinný");
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
        floor_type: floorType,
        binder: floorType === "jednofarebna" ? binder : null,
        sort_order: parseInt(sortOrder) || 100,
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
          <Field label="Typ podlahy">
            <select
              value={floorType}
              onChange={(e) => setFloorType(e.target.value)}
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            >
              {FLOOR_TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          {floorType === "jednofarebna" && (
            <Field label="Živica">
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
          <Field label="Poradie">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold tabular-nums"
            />
          </Field>
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
