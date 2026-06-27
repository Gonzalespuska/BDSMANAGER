"use client";

import * as React from "react";
import { MapPin } from "lucide-react";

import skPlacesRaw from "@/lib/data/sk-places.json";
import { cn } from "@/lib/utils";

/**
 * Mesto/obec input s dropdown autocomplete pre VŠETKY slovenské obce
 * (4587 zo zdroja GeoNames SK, vzdialenosť vypočítaná Haversinom z Ružomberka
 * × 1.3 road factor). Zoznam je staticky bundlovaný, žiadne API volania.
 *
 * Šípky ↑/↓ navigujú, Enter/Tab/klik vyberie. Po výbere zavolá `onComplete()`.
 */

const SK_PLACES = skPlacesRaw as [string, number][];

interface CityEntry {
  display: string;
  km: number;
}

const CITY_LIST: CityEntry[] = SK_PLACES.map(([display, km]) => ({
  display,
  km,
}));

// Pre rýchle exportované km lookup mimo komponentu.
const CITY_KM_BY_NORM: Map<string, number> = new Map();
for (const [name, km] of SK_PLACES) {
  CITY_KM_BY_NORM.set(normalize(name), km);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function getCityKmFromRK(city: string | null | undefined): number | null {
  if (!city) return null;
  const km = CITY_KM_BY_NORM.get(normalize(city));
  return typeof km === "number" ? km : null;
}

function filterCities(query: string, max = 10): CityEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const prefix: CityEntry[] = [];
  const contains: CityEntry[] = [];
  for (const c of CITY_LIST) {
    const n = normalize(c.display);
    if (n.startsWith(q)) prefix.push(c);
    else if (n.includes(q)) contains.push(c);
    if (prefix.length >= max) break;
  }
  return [...prefix, ...contains].slice(0, max);
}

export function CityAutocomplete({
  id,
  value,
  onChange,
  onComplete,
  placeholder,
  className,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** Zavolá sa keď user vyberie mesto cez Enter/Tab/klik — môže fokusnúť ďalší input. */
  onComplete?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);

  const matches = React.useMemo(() => filterCities(value, 10), [value]);

  React.useEffect(() => {
    setHighlighted(0);
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(city: CityEntry) {
    onChange(city.display);
    setOpen(false);
    setTimeout(() => onComplete?.(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (open && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(matches.length - 1, h + 1));
      return;
    }
    if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
      return;
    }
    if ((e.key === "Enter" || e.key === "Tab") && matches.length > 0 && open) {
      e.preventDefault();
      pick(matches[highlighted] ?? matches[0]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full h-11 px-3 py-2 rounded-md border border-input bg-background text-base font-bold outline-none focus:ring-2 focus:ring-sky-500/30"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls="city-listbox"
      />

      {open && matches.length > 0 && (
        <ul
          id="city-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border bg-background shadow-2xl max-h-72 overflow-y-auto py-1"
        >
          {matches.map((c, idx) => {
            const isHi = idx === highlighted;
            return (
              <li
                key={c.display}
                role="option"
                aria-selected={isHi}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                className={cn(
                  "px-3 py-2 flex items-center justify-between gap-3 cursor-pointer text-sm",
                  isHi ? "bg-sky-50 text-sky-900" : "hover:bg-muted/40",
                )}
              >
                <span className="inline-flex items-center gap-2 font-semibold">
                  <MapPin
                    className={cn(
                      "w-3.5 h-3.5",
                      isHi ? "text-sky-600" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  {c.display}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {c.km} km
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
