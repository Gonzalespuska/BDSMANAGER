"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { SIKA_PRODUCTS } from "@/lib/data/sika-products";
import { addStockAction, adjustStockAction, deleteStockAction } from "./actions";

interface StockItem {
  id: string;
  sap_number: string | null;
  product_name: string;
  brand: string;
  package_size_kg: number | null;
  package_unit: string;
  quantity_packages: number;
  min_alert_qty: number;
  location: string | null;
  notes: string | null;
  updated_at: string;
}

interface Movement {
  id: string;
  product_name: string;
  brand: string | null;
  package_size_kg: number | null;
  package_unit: string | null;
  delta: number;
  reason: string;
  notes: string | null;
  created_at: string;
  actor: { name: string } | null;
}

const BRAND_LABELS: Record<string, string> = {
  sika: "Sika",
  topstone: "Topstone",
  betonace: "Beton-Ace",
  stavekon: "Stavekon",
  schoenox: "Schönox",
  other: "Iné",
};

const REASON_LABELS: Record<string, string> = {
  manual_add: "Ručne pridané",
  pdf_import: "Z PDF objednávky",
  realization_take: "Výdaj — realizácia",
  adjustment: "Ručná úprava",
  loss: "Strata / odpis",
};

const PACKAGE_SIZES_KG = [
  1, 5, 6, 7.5, 10, 14.98, 20, 25, 30, 40, 300, 730,
];

export function SkladClient({
  initialStock,
  initialMovements,
}: {
  initialStock: StockItem[];
  initialMovements: Movement[];
}) {
  const [stock] = React.useState<StockItem[]>(initialStock);
  const [movements] = React.useState<Movement[]>(initialMovements);
  const [search, setSearch] = React.useState("");
  const [brandFilter, setBrandFilter] = React.useState<string>("all");
  const [addOpen, setAddOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock.filter((s) => {
      if (brandFilter !== "all" && s.brand !== brandFilter) return false;
      if (!q) return true;
      return (
        s.product_name.toLowerCase().includes(q) ||
        (s.sap_number ?? "").toLowerCase().includes(q) ||
        (s.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [stock, search, brandFilter]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať materiál (SAP, názov, umiestnenie)…"
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
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="rounded-lg border-2 bg-background px-3 py-2 text-sm font-semibold"
        >
          <option value="all">Všetci dodávatelia</option>
          {Object.entries(BRAND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="rounded-lg border-2 bg-background hover:bg-muted px-3 py-2 text-sm font-bold inline-flex items-center gap-1.5"
        >
          <Clock className="w-4 h-4" />
          História
        </button>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-sm font-black inline-flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Pridať materiál
        </button>
      </div>

      {/* Stock tabuľka */}
      <div className="overflow-auto border-2 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
              <th className="text-left px-3 py-2">Značka</th>
              <th className="text-left px-3 py-2">Produkt</th>
              <th className="text-left px-3 py-2 w-24">Balenie</th>
              <th className="text-right px-3 py-2 w-24">Ks</th>
              <th className="text-right px-3 py-2 w-24">Alert</th>
              <th className="text-left px-3 py-2 w-32">Umiestnenie</th>
              <th className="text-right px-3 py-2 w-32">Akcie</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-8 text-muted-foreground italic">
                  {stock.length === 0
                    ? `Sklad je prázdny. Klikni „Pridať materiál".`
                    : "Nič nenájdené."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => <StockRow key={s.id} item={s} />)
            )}
          </tbody>
        </table>
      </div>

      {addOpen && <AddModal onClose={() => setAddOpen(false)} />}
      {historyOpen && (
        <HistoryModal
          movements={movements}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function StockRow({ item }: { item: StockItem }) {
  const [adjusting, setAdjusting] = React.useState(false);
  const isLow = item.quantity_packages <= item.min_alert_qty;

  return (
    <>
      <tr className={cn("hover:bg-sky-50/50", isLow && "bg-rose-50/40")}>
        <td className="px-3 py-2">
          <span
            className={cn(
              "inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
              item.brand === "sika" && "bg-red-100 text-red-800",
              item.brand === "topstone" && "bg-amber-100 text-amber-800",
              item.brand === "betonace" && "bg-orange-100 text-orange-800",
              item.brand === "schoenox" && "bg-teal-100 text-teal-800",
              !["sika", "topstone", "betonace", "schoenox"].includes(item.brand) &&
                "bg-slate-100",
            )}
          >
            {BRAND_LABELS[item.brand] ?? item.brand}
          </span>
        </td>
        <td className="px-3 py-2">
          <div className="font-semibold">{item.product_name}</div>
          {item.sap_number && (
            <div className="text-[10px] text-muted-foreground font-mono">
              SAP {item.sap_number}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-xs font-semibold text-muted-foreground">
          {item.package_size_kg
            ? `${item.package_size_kg} ${item.package_unit}`
            : item.package_unit}
        </td>
        <td className="px-3 py-2 text-right">
          <span
            className={cn(
              "text-lg font-black tabular-nums",
              isLow ? "text-rose-700" : "text-foreground",
            )}
          >
            {item.quantity_packages}
          </span>
          {isLow && (
            <AlertTriangle
              className="inline-block w-4 h-4 text-rose-500 ml-1"
              aria-hidden
            />
          )}
        </td>
        <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
          ≤ {item.min_alert_qty}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {item.location ?? "—"}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => setAdjusting(!adjusting)}
            className="text-xs font-bold text-sky-700 hover:text-sky-800"
          >
            {adjusting ? "Zrušiť" : "Upraviť"}
          </button>
        </td>
      </tr>
      {adjusting && (
        <tr>
          <td colSpan={7} className="px-3 py-3 bg-sky-50/30 border-b">
            <AdjustForm item={item} onDone={() => setAdjusting(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function AdjustForm({
  item,
  onDone,
}: {
  item: StockItem;
  onDone: () => void;
}) {
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState<"adjustment" | "loss" | "manual_add">("manual_add");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit(sign: 1 | -1) {
    const n = parseInt(delta, 10);
    if (!isFinite(n) || n <= 0) {
      toast.error("Zadaj číslo väčšie než 0");
      return;
    }
    setPending(true);
    const r = await adjustStockAction({
      stock_id: item.id,
      delta: sign * n,
      reason: sign === 1 ? "manual_add" : reason === "manual_add" ? "adjustment" : reason,
      notes: notes || null,
    });
    setPending(false);
    if (!r.ok) {
      toast.error(`Chyba: ${r.error}`);
      return;
    }
    toast.success(sign === 1 ? `+${n} pridané` : `-${n} odčítané`);
    onDone();
  }

  async function del() {
    if (!confirm(`Zmazať ${item.product_name} úplne zo skladu?`)) return;
    setPending(true);
    const r = await deleteStockAction(item.id);
    setPending(false);
    if (!r.ok) return toast.error(`Chyba: ${r.error}`);
    toast.success("Zmazané");
    onDone();
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
          Počet balení
        </label>
        <input
          type="number"
          min="1"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          className="w-24 rounded border-2 bg-background px-2 py-1 text-sm font-bold tabular-nums text-center focus:border-sky-500 focus:outline-none"
          autoFocus
        />
      </div>
      <div>
        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
          Dôvod (pri výdaji)
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as never)}
          className="rounded border-2 bg-background px-2 py-1 text-sm"
        >
          <option value="adjustment">Ručná úprava</option>
          <option value="loss">Strata / odpis</option>
        </select>
      </div>
      <div className="flex-1 min-w-[150px]">
        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
          Poznámka
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border-2 bg-background px-2 py-1 text-sm"
          placeholder="Voliteľné"
        />
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => submit(1)}
        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-bold inline-flex items-center gap-1 shadow-sm disabled:opacity-50"
      >
        <ArrowUp className="w-4 h-4" /> Prijať
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => submit(-1)}
        className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-sm font-bold inline-flex items-center gap-1 shadow-sm disabled:opacity-50"
      >
        <ArrowDown className="w-4 h-4" /> Vydať
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={del}
        className="rounded-lg border-2 border-rose-300 hover:bg-rose-50 text-rose-700 px-2 py-1.5 text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50"
        aria-label="Zmazať položku"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ADD MODAL — ručne vs. PDF
// ═══════════════════════════════════════════════════════════════════════

function AddModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = React.useState<"manual" | "pdf">("manual");
  return (
    <ModalShell onClose={onClose} title="➕ Pridať materiál">
      <div className="space-y-4">
        {/* Toggle */}
        <div className="inline-flex rounded-lg border-2 bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold",
              mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            Ručne
          </button>
          <button
            type="button"
            onClick={() => setMode("pdf")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold",
              mode === "pdf" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            Nahrať PDF z objednávky
          </button>
        </div>

        {mode === "manual" ? <ManualAddForm onDone={onClose} /> : <PdfImportForm onDone={onClose} />}
      </div>
    </ModalShell>
  );
}

function ManualAddForm({ onDone }: { onDone: () => void }) {
  // Suggestion katalóg — Sika + custom
  const suggestions = React.useMemo(() => {
    return SIKA_PRODUCTS.map((p) => ({
      sap_number: p.sap_number,
      name: p.name,
      packaging: p.packaging,
    }));
  }, []);

  const [sap, setSap] = React.useState("");
  const [productName, setProductName] = React.useState("");
  const [brand, setBrand] = React.useState("sika");
  const [pkgSize, setPkgSize] = React.useState<string>("");
  const [pkgUnit, setPkgUnit] = React.useState("kg");
  const [qty, setQty] = React.useState<string>("");
  const [minAlert, setMinAlert] = React.useState<string>("0");
  const [location, setLocation] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [showSug, setShowSug] = React.useState(false);

  const filteredSug = React.useMemo(() => {
    const q = productName.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [productName, suggestions]);

  function pick(s: (typeof suggestions)[number]) {
    setSap(s.sap_number);
    setProductName(s.name);
    // Extract velkosť z packaging "10 kg" or "25 kg vrece"
    const m = s.packaging.match(/(\d+(?:[.,]\d+)?)\s*(kg|L|ks)/i);
    if (m) {
      setPkgSize(m[1].replace(",", "."));
      setPkgUnit(m[2].toLowerCase());
    }
    setShowSug(false);
  }

  async function submit() {
    const qNum = parseInt(qty, 10);
    if (!productName.trim() || !isFinite(qNum) || qNum <= 0) {
      toast.error("Zadaj názov produktu a počet balení > 0");
      return;
    }
    setPending(true);
    const r = await addStockAction({
      sap_number: sap.trim() || null,
      product_name: productName.trim(),
      brand,
      package_size_kg: pkgSize ? parseFloat(pkgSize) : null,
      package_unit: pkgUnit,
      quantity_packages: qNum,
      min_alert_qty: parseInt(minAlert, 10) || 0,
      location: location.trim() || null,
      notes: notes.trim() || null,
    });
    setPending(false);
    if (!r.ok) return toast.error(`Chyba: ${r.error}`);
    toast.success(`+${qNum} × ${productName} pridané do skladu`);
    onDone();
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
          Produkt (názov)
        </label>
        <input
          type="text"
          value={productName}
          onChange={(e) => {
            setProductName(e.target.value);
            setShowSug(true);
          }}
          onFocus={() => setShowSug(true)}
          placeholder="napr. Sikafloor-151"
          className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold focus:border-sky-500 focus:outline-none"
        />
        {showSug && filteredSug.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border-2 bg-background shadow-lg">
            {filteredSug.map((s) => (
              <button
                key={s.sap_number}
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b last:border-0"
              >
                <div className="font-bold text-sm">{s.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  SAP {s.sap_number} · {s.packaging}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            SAP kód (voliteľné)
          </label>
          <input
            type="text"
            value={sap}
            onChange={(e) => setSap(e.target.value)}
            placeholder="871178"
            className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            Značka
          </label>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold"
          >
            {Object.entries(BRAND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            Veľkosť 1 balenia
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="decimal"
              list="pkg-sizes"
              value={pkgSize}
              onChange={(e) => setPkgSize(e.target.value)}
              placeholder="30"
              className="flex-1 min-w-0 rounded-lg border-2 bg-background px-2 py-2 text-sm font-bold tabular-nums focus:border-sky-500 focus:outline-none"
            />
            <datalist id="pkg-sizes">
              {PACKAGE_SIZES_KG.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <select
              value={pkgUnit}
              onChange={(e) => setPkgUnit(e.target.value)}
              className="rounded-lg border-2 bg-background px-2 py-2 text-sm font-bold"
            >
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="ks">ks</option>
              <option value="rol">rol</option>
              <option value="m²">m²</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            Počet balení
          </label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="5"
            className="w-full rounded-lg border-2 bg-background px-3 py-2 text-lg font-black text-center tabular-nums focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            Alert pri &lt;=
          </label>
          <input
            type="number"
            min="0"
            value={minAlert}
            onChange={(e) => setMinAlert(e.target.value)}
            className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold text-center tabular-nums focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
          Umiestnenie (voliteľné)
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Regál A3, hala 2, ..."
          className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
          Poznámka (voliteľné)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl py-3 text-base font-black uppercase tracking-wider transition-colors bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-md inline-flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        {pending ? "Ukladám…" : "Pridať do skladu"}
      </button>
    </div>
  );
}

function PdfImportForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/40 p-6 text-center">
        <FileText className="w-10 h-10 mx-auto text-sky-500 mb-2" aria-hidden />
        <div className="text-sm font-bold mb-1">
          Drag & drop PDF z auto-order systému
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          (alebo klik pre výber súboru)
        </div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm mx-auto"
        />
        {file && (
          <div className="mt-2 text-xs text-emerald-700 font-semibold">
            ✓ {file.name}
          </div>
        )}
      </div>

      <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
        <div className="font-bold mb-0.5">⚠ Beta funkcia</div>
        Parsovanie PDF (extract položiek + kusov) ešte nie je hotové. Zatiaľ
        prosím pridávaj cez záložku „Ručne". Táto voľba slúži ako preview
        pre budúcu integráciu.
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
          Poznámka (napr. „Objednávka č. 12/2026")
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => {
          toast.info("PDF parser bude v ďalšej fáze. Zatiaľ pridaj ručne.");
          onDone();
        }}
        className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider bg-slate-200 text-slate-700 cursor-not-allowed"
        disabled
      >
        <Upload className="w-4 h-4 inline mr-1.5" />
        Importovať (nedostupné)
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HISTORY MODAL
// ═══════════════════════════════════════════════════════════════════════

function HistoryModal({
  movements,
  onClose,
}: {
  movements: Movement[];
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose} title="🕰 História posledných zmien">
      {movements.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground italic">
          Žiadne zmeny — ešte sa nič nepohlo.
        </div>
      ) : (
        <ul className="divide-y">
          {movements.map((m) => (
            <li key={m.id} className="py-2.5 flex items-start gap-3">
              <div
                className={cn(
                  "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm",
                  m.delta > 0 ? "bg-emerald-500" : "bg-rose-500",
                )}
              >
                {m.delta > 0 ? "+" : ""}
                {m.delta}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{m.product_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {m.package_size_kg
                    ? `${m.package_size_kg} ${m.package_unit ?? ""}`
                    : m.package_unit ?? ""}{" "}
                  · {REASON_LABELS[m.reason] ?? m.reason} ·{" "}
                  {new Date(m.created_at).toLocaleString("sk-SK", {
                    day: "numeric",
                    month: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {m.actor && ` · ${m.actor.name}`}
                </div>
                {m.notes && (
                  <div className="text-[11px] text-muted-foreground italic mt-0.5">
                    „{m.notes}"
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Shared modal shell
// ═══════════════════════════════════════════════════════════════════════

function ModalShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between z-10">
          <h2 className="font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Zavrieť"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
