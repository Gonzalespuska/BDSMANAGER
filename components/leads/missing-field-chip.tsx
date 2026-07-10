"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

/**
 * MissingFieldChip — inline edit pre chýbajúce polia leadu.
 *
 * Ak `value` existuje → obyčajný chip s hodnotou (klik ho otvorí na úpravu)
 * Ak `value` chýba → prázdny chip s placeholderom (napr. „+ m²", „+ Mesto")
 *   → klik otvorí input alebo dropdown → uloží cez API → optimistic update
 *
 * Používa sa na lead karte v /agent aby obchodák pri hovore mohol rýchlo
 * doplniť plochu, mesto, typ podlahy, priestor bez otvárania detailu.
 */

export type FieldKind = "text" | "number" | "typ_podlahy" | "priestor";

interface Props {
  leadId: string;
  field: "plocha" | "lokalita" | "typ_podlahy" | "priestor";
  value: string | null | undefined;
  kind: FieldKind;
  placeholder: string;
  /** Jednotka za hodnotu (napr. „m²"). Nepovinné. */
  suffix?: string;
  /** Options pre dropdown (kind = typ_podlahy / priestor). */
  options?: string[];
  onSaved?: (newValue: string) => void;
}

const TYP_PODLAHY_OPTIONS = [
  "Jednofarebná",
  "Chipsová",
  "Mramorová",
  "Metalická",
  "Antistatická",
];

const PRIESTOR_OPTIONS = [
  "Garáž",
  "Byt / dom (interiér)",
  "Priemyselná hala",
  "Showroom / obchod",
  "Kancelária",
  "Kúpeľňa",
  "Vonkajšie",
];

export function MissingFieldChip({
  leadId,
  field,
  value,
  kind,
  placeholder,
  suffix,
  options,
  onSaved,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [localValue, setLocalValue] = React.useState<string>(value ?? "");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  const displayValue = value ?? localValue;
  const hasValue = displayValue !== "" && displayValue != null;

  // Auto-focus input po otvorení
  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Klik mimo → zavrieť (zahodí bez uloženia)
  React.useEffect(() => {
    if (!editing) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setEditing(false);
        setLocalValue(value ?? "");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [editing, value]);

  async function save(newValue: string) {
    if (newValue === (value ?? "")) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      const r = await fetch("/api/lead/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          field,
          value: newValue,
        }),
      });
      const json = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !json.ok) {
        toast.error(`Chyba: ${json.error ?? "unknown"}`);
        setPending(false);
        return;
      }
      setLocalValue(newValue);
      setEditing(false);
      setPending(false);
      onSaved?.(newValue);
      toast.success(`${labelForField(field)} uložené`);
    } catch (e) {
      toast.error(`Chyba: ${e instanceof Error ? e.message : "network"}`);
      setPending(false);
    }
  }

  const opts = options ?? getDefaultOptions(kind);

  // ─── EDITING MODE ───
  if (editing) {
    return (
      <div ref={wrapRef} className="relative inline-flex">
        {kind === "typ_podlahy" || kind === "priestor" ? (
          <div className="inline-flex items-stretch rounded-md border-2 border-sky-400 bg-white shadow-md overflow-hidden">
            <select
              value={displayValue}
              onChange={(e) => save(e.target.value)}
              disabled={pending}
              className="px-2.5 py-1 text-xs font-bold bg-white border-0 focus:outline-none pr-6 appearance-none min-w-[100px]"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">{placeholder}</option>
              {opts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {pending && (
              <div className="px-1.5 flex items-center bg-white">
                <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
              </div>
            )}
          </div>
        ) : (
          <div className="inline-flex items-stretch rounded-md border-2 border-sky-400 bg-white shadow-md overflow-hidden">
            <input
              ref={inputRef}
              type={kind === "number" ? "number" : "text"}
              inputMode={kind === "number" ? "decimal" : "text"}
              value={displayValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save(localValue);
                if (e.key === "Escape") {
                  setEditing(false);
                  setLocalValue(value ?? "");
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder={placeholder}
              disabled={pending}
              className={cn(
                "px-2 py-1 text-xs font-bold bg-white border-0 focus:outline-none tabular-nums",
                kind === "number" ? "w-16 text-center" : "w-28",
              )}
            />
            {suffix && (
              <span className="px-1 py-1 text-xs font-bold text-muted-foreground bg-white">
                {suffix}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                save(localValue);
              }}
              disabled={pending}
              className="px-1.5 flex items-center bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
              aria-label="Uložiť"
            >
              {pending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3 stroke-[3]" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(false);
                setLocalValue(value ?? "");
              }}
              disabled={pending}
              className="px-1.5 flex items-center bg-slate-100 hover:bg-slate-200 text-slate-600 border-l"
              aria-label="Zrušiť"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── DISPLAY MODE ───
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all group",
        hasValue
          ? "bg-zinc-100 text-zinc-800 hover:bg-sky-100 hover:text-sky-800"
          : "border-2 border-dashed border-amber-300 bg-amber-50/50 text-amber-800 hover:border-amber-500 hover:bg-amber-50 animate-pulse-slow",
      )}
      aria-label={hasValue ? `Upraviť ${labelForField(field)}` : `Doplniť ${labelForField(field)}`}
    >
      {hasValue ? (
        <>
          <span>{displayValue}</span>
          {suffix && <span className="opacity-60">{suffix}</span>}
          <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
        </>
      ) : (
        <>
          <span className="text-[13px]">+</span>
          <span>{placeholder}</span>
          {kind === "typ_podlahy" || kind === "priestor" ? (
            <ChevronDown className="w-3 h-3 opacity-70" />
          ) : null}
        </>
      )}
    </button>
  );
}

function getDefaultOptions(kind: FieldKind): string[] {
  if (kind === "typ_podlahy") return TYP_PODLAHY_OPTIONS;
  if (kind === "priestor") return PRIESTOR_OPTIONS;
  return [];
}

function labelForField(field: string): string {
  switch (field) {
    case "plocha":
      return "Plocha";
    case "lokalita":
      return "Mesto";
    case "typ_podlahy":
      return "Typ podlahy";
    case "priestor":
      return "Priestor";
    default:
      return field;
  }
}
