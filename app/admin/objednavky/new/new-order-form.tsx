"use client";

import * as React from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createOrderAction, type OrderItem } from "../actions";
import type { SikaProduct } from "@/lib/data/sika-products";
import { SIKA_CATEGORY_LABELS } from "@/lib/data/sika-products";

export function NewOrderForm({ catalog }: { catalog: SikaProduct[] }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [areaM2, setAreaM2] = React.useState("");
  const [supplier, setSupplier] = React.useState("Sika");
  const [items, setItems] = React.useState<OrderItem[]>([]);
  const [search, setSearch] = React.useState("");
  const [customSap, setCustomSap] = React.useState("");
  const [customName, setCustomName] = React.useState("");
  const [customPack, setCustomPack] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.slice(0, 15);
    return catalog
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sap_number.includes(q) ||
          (p.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [catalog, search]);

  function addProduct(p: SikaProduct) {
    const existing = items.findIndex((i) => i.sap_number === p.sap_number);
    if (existing >= 0) {
      const copy = [...items];
      copy[existing] = { ...copy[existing], quantity: copy[existing].quantity + 1 };
      setItems(copy);
    } else {
      setItems([
        ...items,
        {
          sap_number: p.sap_number,
          name: p.name,
          packaging: p.packaging,
          quantity: 1,
        },
      ]);
    }
  }

  function addCustom() {
    const sap = customSap.trim();
    const name = customName.trim();
    const pack = customPack.trim();
    if (!sap || !name || !pack) return;
    setItems([...items, { sap_number: sap, name, packaging: pack, quantity: 1 }]);
    setCustomSap("");
    setCustomName("");
    setCustomPack("");
  }

  function updateQty(i: number, qty: number) {
    const copy = [...items];
    copy[i] = { ...copy[i], quantity: Math.max(0, qty) };
    setItems(copy);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          fd.set("items", JSON.stringify(items));
          await createOrderAction(fd);
        } finally {
          setPending(false);
        }
      }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-4"
    >
      {/* LEFT — meta + selected items */}
      <div className="lg:col-span-2 space-y-4">
        {/* Meta */}
        <section className="rounded-2xl border-2 border-orange-200 bg-orange-50/40 p-4 space-y-3">
          <h2 className="font-bold text-sm inline-flex items-center gap-2">
            📋 Info o objednávke
          </h2>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Názov *
            </label>
            <input
              type="text"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Byt 1 – PU systém, 84 m²"
              className="w-full mt-1 rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Plocha (m²)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                name="area_m2"
                value={areaM2}
                onChange={(e) => setAreaM2(e.target.value)}
                placeholder="84"
                className="w-full mt-1 rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold focus:border-orange-500 focus:outline-none tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Dodávateľ
              </label>
              <input
                type="text"
                name="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Sika"
                className="w-full mt-1 rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Skladba / poznámka
            </label>
            <textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Skladba: 01 Primer → Level-30 (~2,5 mm) → 03 Primer (medzivrstva) → Sikafloor-3000FX Amberish Grey → Sikafloor-304W Matt."
              className="w-full mt-1 rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
            />
          </div>
        </section>

        {/* Selected items table */}
        <section className="rounded-2xl border-2 bg-background overflow-hidden">
          <header className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <h2 className="font-bold text-sm inline-flex items-center gap-2">
              📦 Položky ({items.length})
            </h2>
          </header>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground italic">
              Zatiaľ prázdna. Klikni na produkt vpravo alebo pridaj vlastný.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                  <th className="text-center px-2 py-2 w-8">#</th>
                  <th className="text-left px-2 py-2 w-24">SAP</th>
                  <th className="text-left px-2 py-2">Produkt</th>
                  <th className="text-left px-2 py-2 w-24">Balenie</th>
                  <th className="text-center px-2 py-2 w-20">Ks</th>
                  <th className="text-center px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-orange-50/30">
                    <td className="text-center px-2 py-2 tabular-nums font-bold text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{it.sap_number}</td>
                    <td className="px-2 py-2 font-semibold">{it.name}</td>
                    <td className="px-2 py-2 text-xs">{it.packaging}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={it.quantity}
                        onChange={(e) => updateQty(i, parseInt(e.target.value, 10) || 0)}
                        className="w-16 rounded border-2 bg-background px-1.5 py-0.5 text-center text-sm font-bold tabular-nums focus:border-orange-500 focus:outline-none"
                      />
                    </td>
                    <td className="text-center px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-rose-600 hover:text-rose-800"
                        aria-label="Odstrániť"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || items.length === 0 || !title.trim()}
            className="rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-2.5 text-sm font-bold transition-colors"
          >
            {pending ? "Ukladám…" : "💾 Uložiť objednávku"}
          </button>
        </div>
      </div>

      {/* RIGHT — catalog search */}
      <div className="space-y-3">
        <section className="rounded-2xl border-2 bg-background overflow-hidden sticky top-4">
          <header className="px-4 py-3 border-b bg-slate-50">
            <h2 className="font-bold text-sm inline-flex items-center gap-2">
              🔍 Sika katalóg
            </h2>
          </header>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hľadať (napr. 304W, primer, Level, chipsy…)"
                className="w-full rounded-lg border-2 bg-background pl-9 pr-9 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[400px] overflow-auto divide-y">
            {filtered.map((p) => (
              <button
                key={p.sap_number}
                type="button"
                onClick={() => addProduct(p)}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      "bg-slate-100 text-slate-700",
                    )}
                  >
                    {SIKA_CATEGORY_LABELS[p.category ?? "other"] ?? "📦"}
                  </span>
                  <Plus className="w-3.5 h-3.5 text-orange-600 group-hover:scale-125 transition-transform" />
                </div>
                <div className="mt-1 text-xs font-semibold">{p.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  SAP {p.sap_number} · {p.packaging}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                Nič nenájdené. Zadaj vlastný produkt ↓
              </div>
            )}
          </div>
          <div className="border-t p-3 space-y-2 bg-slate-50/50">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              + Vlastný produkt
            </div>
            <input
              type="text"
              value={customSap}
              onChange={(e) => setCustomSap(e.target.value)}
              placeholder="SAP číslo"
              className="w-full rounded border bg-background px-2 py-1 text-xs font-mono focus:border-orange-500 focus:outline-none"
            />
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Názov produktu"
              className="w-full rounded border bg-background px-2 py-1 text-xs focus:border-orange-500 focus:outline-none"
            />
            <input
              type="text"
              value={customPack}
              onChange={(e) => setCustomPack(e.target.value)}
              placeholder="Balenie (napr. 25 kg)"
              className="w-full rounded border bg-background px-2 py-1 text-xs focus:border-orange-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customSap.trim() || !customName.trim() || !customPack.trim()}
              className="w-full rounded bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white px-2 py-1 text-xs font-bold"
            >
              + Pridať do zoznamu
            </button>
          </div>
        </section>
      </div>
    </form>
  );
}
