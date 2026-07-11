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
};

type ProcedureStep = { step: number; title: string; note: string };

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

export function SystemsAdmin({
  initialSystems,
}: {
  initialSystems: System[];
}) {
  const router = useRouter();
  const [systems, setSystems] = React.useState<System[]>(initialSystems);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {systems.length} systém{systems.length === 1 ? "" : "ov"} celkom
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nový systém
        </button>
      </div>

      <ul className="space-y-2">
        {systems.map((s) => (
          <SystemCard
            key={s.id}
            system={s}
            expanded={expanded === s.id}
            onToggle={() =>
              setExpanded((cur) => (cur === s.id ? null : s.id))
            }
            onChanged={refresh}
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
  expanded,
  onToggle,
  onChanged,
}: {
  system: System;
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
          <StepsEditor system={system} onChanged={onChanged} />
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
    setMsg("✓ Uložené");
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
        <Field label="Aktívny">
          <label className="inline-flex items-center gap-2 h-9">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm font-bold">
              {active ? "Áno — dostupný pre obchodákov" : "Nie — skrytý"}
            </span>
          </label>
        </Field>
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
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span className="uppercase font-bold">{product.product_role}</span>
            <span>·</span>
            <span>SKU {product.sku}</span>
            <span>·</span>
            <span>{product.consumption_per_m2} kg/m²</span>
            <span>·</span>
            <span>
              {product.unit_size_kg} kg/{product.unit_label}
            </span>
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
      </div>
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
      </div>
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
  onChanged,
}: {
  system: System;
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
    setMsg("✓ Postup uložený");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          🔨 Postup krokov (uvidí realizator)
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 text-xs font-black"
        >
          <Plus className="w-3.5 h-3.5" />
          Krok
        </button>
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
    if (!code.trim() || !label.trim()) {
      setErr("Kód a label sú povinné");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim(),
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
          <Field label="Kód (uniq)">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="napr. 264"
              autoFocus
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-black"
            />
          </Field>
          <Field label="Label (zobrazí sa)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="napr. Sikafloor 264"
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
