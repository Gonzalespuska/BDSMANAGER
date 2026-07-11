"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  Hammer,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Ruler,
  Send,
  StickyNote,
  Trash2,
  Users as UsersIcon,
  X,
} from "lucide-react";

import { listUsersByRoleAction } from "@/app/agent/actions";
import { cn } from "@/lib/utils";
import { formatPhoneSK } from "@/lib/phone-format";
import {
  addCalendarEventAction,
  addCalendarNoteAction,
  deleteCalendarNoteAction,
  updateCalendarNoteAction,
} from "./actions";
import { ManualAssignModal } from "./manual-assign-modal";
import { SuggestDayButton } from "./suggest-day-button";

/**
 * Format Date → "YYYY-MM-DD" v LOKÁLNOM timezone.
 *
 * Prečo nie toISOString().slice(0,10): toISOString je vždy UTC. V SK
 * (UTC+2) sa lokálny 9.7. 00:00 stane 8.7. 22:00 UTC → slice(0,10)
 * vráti "2026-07-08" namiesto "2026-07-09" (off-by-one). Toto trápilo
 * userov kliknutím na deň → modal ukázal predchádzajúci deň.
 */
function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Normalizuj mesto pre case + diacritics insensitive match. */
function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Time24Picker — dva NUMBER inputy (HH + MM), garantovane 24h formát.
 *
 * Prečo nie <input type="time">: závisí na OS locale a v en-US ukazuje
 * AM/PM. Chceme čistý 24h vzhľad.
 *
 * Prečo nie <select>: user chce zadať aj neštandardný čas ako 8:20
 * alebo 9:37 — selecty by ho obmedzili na 15-min kroky.
 *
 * Value: "HH:MM" (napr. "09:00"), rovnaký formát ako natívny input.
 * Validácia:
 *   • Hodiny: 0-23 (clampujeme, nie fixné pracovné hodiny)
 *   • Minúty: 0-59
 *   • Text: 2 znaky max, digit-only
 *   • Onblur padding na "09" / "07"
 */
/**
 * DayAgendaView — hourly schedule pre dnes, iba obchod/admin. User:
 * "ked obchodak dnes nech mu to ukaze dnes na hodiny presne o kolkej ma
 * kto co, a potom sa viem prekliknut spat na mesiac".
 *
 * Layout: vertikálny stĺpec 6:00–20:00, každá hodina slot. Eventy sú
 * umiestnené v hodinovom slote podľa starts_at. Rôzne farby podľa kind:
 * violet = obhliadka, emerald = realizácia.
 */
function DayAgendaView({
  date,
  notes,
  onOpenDayModal,
}: {
  date: string;
  notes: CalendarNote[];
  onOpenDayModal: () => void;
}) {
  const d = new Date(date + "T00:00:00");
  const niceDate = d.toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Hodiny 6-20 (pracovný deň)
  const hours = React.useMemo(
    () => Array.from({ length: 15 }, (_, i) => 6 + i),
    [],
  );

  // Rozdel eventy podľa hodiny (starts_at) — kľúč = HH
  const byHour = React.useMemo(() => {
    const map = new Map<number, CalendarNote[]>();
    for (const n of notes) {
      let h = 9; // default ak nie je starts_at
      if (n.starts_at) {
        const dt = new Date(n.starts_at);
        if (!isNaN(dt.getTime())) h = dt.getHours();
      }
      if (h < 6) h = 6;
      if (h > 20) h = 20;
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(n);
    }
    return map;
  }, [notes]);

  const totalCount = notes.length;
  const inspectionCount = notes.filter((n) =>
    /obhliadka|🔍/i.test(n.body),
  ).length;
  const realizationCount = notes.filter((n) =>
    /realiz|🔨/i.test(n.body),
  ).length;

  return (
    <div className="p-4 md:p-5 space-y-3">
      {/* Header — dátum + súhrn */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-sky-700">
            Dnes
          </div>
          <div className="text-xl md:text-2xl font-black tracking-tight">
            {niceDate}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inspectionCount > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-100 border border-violet-200 text-violet-800 text-sm font-black">
              🔍 {inspectionCount} obhliadk{inspectionCount === 1 ? "a" : inspectionCount < 5 ? "y" : "ov"}
            </span>
          )}
          {realizationCount > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-sm font-black">
              🔨 {realizationCount} realizác{realizationCount === 1 ? "ia" : "ie"}
            </span>
          )}
          {totalCount === 0 && (
            <span className="text-sm font-semibold text-muted-foreground italic">
              🌴 Voľný deň
            </span>
          )}
        </div>
      </div>

      {/* Hourly timeline */}
      <div className="rounded-xl border-2 bg-white overflow-hidden">
        <ul className="divide-y">
          {hours.map((h) => {
            const events = byHour.get(h) ?? [];
            const isNow =
              new Date().getHours() === h &&
              date === new Date().toISOString().slice(0, 10);
            return (
              <li
                key={h}
                className={cn(
                  "flex gap-3 px-3 py-2 min-h-[52px]",
                  isNow && "bg-sky-50/70",
                )}
              >
                {/* Hour label */}
                <div
                  className={cn(
                    "shrink-0 w-14 text-right pr-2 pt-0.5",
                    events.length > 0 || isNow
                      ? "text-slate-800 font-black text-sm"
                      : "text-slate-400 font-bold text-xs",
                  )}
                >
                  {String(h).padStart(2, "0")}:00
                  {isNow && (
                    <div className="text-[9px] font-black uppercase text-sky-600 mt-0.5">
                      TERAZ
                    </div>
                  )}
                </div>
                {/* Events */}
                <div className="flex-1 min-w-0 space-y-1">
                  {events.length === 0 ? (
                    <div
                      className={cn(
                        "h-full border-l-2 pl-3 py-1 text-xs italic",
                        isNow
                          ? "border-sky-400 text-sky-700"
                          : "border-slate-100 text-slate-300",
                      )}
                    >
                      —
                    </div>
                  ) : (
                    events.map((n) => {
                      const isInspection = /obhliadka|🔍/i.test(n.body);
                      const isRealization = /realiz|🔨/i.test(n.body);
                      const tint = isInspection
                        ? {
                            border: "border-violet-400",
                            bg: "bg-violet-50",
                            text: "text-violet-900",
                            pill: "bg-violet-500",
                          }
                        : isRealization
                          ? {
                              border: "border-emerald-400",
                              bg: "bg-emerald-50",
                              text: "text-emerald-900",
                              pill: "bg-emerald-500",
                            }
                          : {
                              border: "border-sky-400",
                              bg: "bg-sky-50",
                              text: "text-sky-900",
                              pill: "bg-sky-500",
                            };
                      const timeStr = n.starts_at
                        ? new Date(n.starts_at).toLocaleTimeString("sk-SK", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "";
                      const emoji = isInspection ? "🔍" : isRealization ? "🔨" : "📞";
                      const memberName = n.target_user_name ?? "?";
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={onOpenDayModal}
                          className={cn(
                            "w-full text-left rounded-lg border-l-4 pl-3 pr-3 py-2 hover:shadow-sm transition-all group",
                            tint.border,
                            tint.bg,
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* User: "nech to zacina emoji lupy meno
                                obhliadkara nemusi byt lead vidno". */}
                            <span aria-hidden className="text-lg leading-none">
                              {emoji}
                            </span>
                            <span className={cn("font-black text-sm truncate", tint.text)}>
                              {memberName}
                            </span>
                            {timeStr && (
                              <span
                                className={cn(
                                  "ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow-sm",
                                  tint.pill,
                                )}
                              >
                                {timeStr}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * CalendarFilterDropdown — obchod/admin toggle "Zobraz kalendár: všetkých /
 * konkrétneho realizatora / obhliadkára". User: "prehlad je picovina to sa
 * ma robit v tom kalendari tym ze prepnes". Setuje ?filter_user URL param
 * → server re-fetch notes s filter.
 */
function CalendarFilterDropdown({
  users,
  activeUserId,
}: {
  users: FilterableUser[];
  activeUserId: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = activeUserId
    ? users.find((u) => u.id === activeUserId) ?? null
    : null;

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function navigateTo(userId: string | null) {
    const url = new URL(window.location.href);
    if (userId) {
      url.searchParams.set("filter_user", userId);
    } else {
      url.searchParams.delete("filter_user");
    }
    window.location.href = url.pathname + url.search;
  }

  const inspectors = users.filter((u) => u.role === "obhliadky");
  const realizators = users.filter((u) => u.role === "realizacie");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border-2",
          active
            ? "bg-sky-500 hover:bg-sky-600 text-white border-sky-500 shadow-sm"
            : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
        )}
        title="Filter kalendára — zobraz iba eventy konkrétneho kolegu"
      >
        <Eye className="w-3.5 h-3.5" aria-hidden />
        {active ? `Kalendár: ${active.name.split(" ")[0]}` : "Zobraz kalendár"}
        <ChevronDown
          className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border-2 bg-white shadow-xl overflow-hidden">
          <button
            type="button"
            onClick={() => navigateTo(null)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-sky-50 transition-colors text-sm font-bold border-b",
              !active && "bg-sky-100 text-sky-900",
            )}
          >
            <UsersIcon className="w-4 h-4" aria-hidden />
            Všetci (celý tím)
            {!active && <Check className="w-4 h-4 ml-auto" aria-hidden />}
          </button>
          {realizators.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50/60">
                🔨 Realizátori
              </div>
              {realizators.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => navigateTo(u.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-emerald-50 transition-colors text-sm font-bold",
                    activeUserId === u.id && "bg-emerald-100 text-emerald-900",
                  )}
                >
                  {u.name}
                  {activeUserId === u.id && (
                    <Check className="w-4 h-4 ml-auto" aria-hidden />
                  )}
                </button>
              ))}
            </>
          )}
          {inspectors.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-violet-700 bg-violet-50/60 border-t">
                🔍 Obhliadkári
              </div>
              {inspectors.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => navigateTo(u.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-violet-50 transition-colors text-sm font-bold",
                    activeUserId === u.id && "bg-violet-100 text-violet-900",
                  )}
                >
                  {u.name}
                  {activeUserId === u.id && (
                    <Check className="w-4 h-4 ml-auto" aria-hidden />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Time24Picker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // Rozdeľ value na h/m — držíme ich ako string aby sme umožnili
  // "9" (mid-typing) → padne na "09" po blur.
  // Ak value je prázdny "", inputs zostanú prázdne (placeholder HH/MM).
  const parsed = React.useMemo(() => {
    if (!value) return { h: "", m: "" };
    const [hh, mm] = value.split(":");
    return {
      h: (hh || "").padStart(2, "0"),
      m: (mm || "").padStart(2, "0"),
    };
  }, [value]);

  const [rawH, setRawH] = React.useState(parsed.h);
  const [rawM, setRawM] = React.useState(parsed.m);

  // Sync externých zmien value → local rawH/rawM
  React.useEffect(() => {
    setRawH(parsed.h);
    setRawM(parsed.m);
  }, [parsed.h, parsed.m]);

  function commit(hOverride?: string, mOverride?: string) {
    const rawHVal = hOverride ?? rawH;
    const rawMVal = mOverride ?? rawM;
    // Ak sú OBE prázdne → nevyplneny cas, onChange("")
    if (!rawHVal && !rawMVal) {
      onChange("");
      return;
    }
    // Ak je HH vyplnené, MM sa auto-doplní na "00" (aby user nemusel
    // klikať dvakrát pre "13:00"). To iste sa nedeje naopak — ak je
    // MM vyplnené ale HH nie, počkáme kým user zadá HH.
    if (!rawHVal) {
      // Iba MM napísané → onChange stále prázdne kým HH je prázdne
      onChange("");
      return;
    }
    const hPadded = String(
      Math.max(0, Math.min(23, parseInt(rawHVal, 10) || 0)),
    ).padStart(2, "0");
    const mPadded = String(
      Math.max(0, Math.min(59, parseInt(rawMVal || "0", 10) || 0)),
    ).padStart(2, "0");
    if (hPadded !== rawH) setRawH(hPadded);
    if (mPadded !== rawM) setRawM(mPadded);
    onChange(`${hPadded}:${mPadded}`);
  }

  // Fixná šírka inputu (w-20 = 80px). Nechceme flex-1 lebo box je
  // potom neprimerane široký a text "09" vyzerá stratený.
  // Text-center + style={{textAlign:"center"}} — dvojitá poistka
  // (niekedy Tailwind text-center prehrá s browser defaultami).
  const baseCls =
    "h-12 w-20 rounded-lg border-2 border-input bg-background text-2xl font-black tabular-nums text-center " +
    "disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-violet-400 " +
    "focus:border-violet-400 transition-colors";

  return (
    <div className="flex items-center justify-center gap-3">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={rawH}
        onChange={(e) => {
          // Iba cifry, max 2. Živý clamp na 0-23.
          // slice(-2) = ber POSLEDNÉ 2 cifry (nie prvé). Ak už bolo
          // "00" a user napíše "8", value je "008" → slice(-2)="08".
          const digits = e.target.value.replace(/\D/g, "").slice(-2);
          if (digits.length === 2) {
            const num = parseInt(digits, 10);
            if (num > 23) {
              setRawH(digits.slice(-1));
              return;
            }
          }
          setRawH(digits);
        }}
        onBlur={() => commit()}
        // Focus AJ click → select all. Bez click by user musel manuálne
        // selectovať pri druhom vstupe do pola s hotovým "00".
        onFocus={(e) => {
          // Defer select() na next frame — inak browser cursor placement
          // po mouseup deselektne text hneď po focus-e.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onMouseUp={(e) => {
          // Zabraň browserovi deselectnut text po mouseup.
          e.preventDefault();
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = parseInt(rawH || "0", 10) || 0;
            const next = e.key === "ArrowUp" ? (cur + 1) % 24 : (cur + 23) % 24;
            const s = String(next).padStart(2, "0");
            setRawH(s);
            commit(s, undefined);
          }
        }}
        disabled={disabled}
        aria-label="Hodina"
        placeholder="HH"
        style={{ textAlign: "center", padding: 0 }}
        className={baseCls}
      />
      <span className="text-2xl font-black text-slate-400 select-none">:</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={rawM}
        onChange={(e) => {
          // Živý clamp na 0-59. slice(-2) = ber posledné 2 cifry.
          const digits = e.target.value.replace(/\D/g, "").slice(-2);
          if (digits.length === 2) {
            const num = parseInt(digits, 10);
            if (num > 59) {
              setRawM(digits.slice(-1));
              return;
            }
          }
          setRawM(digits);
        }}
        onBlur={() => commit()}
        onFocus={(e) => {
          // Defer select() na next frame — inak browser cursor placement
          // po mouseup deselektne text hneď po focus-e.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onMouseUp={(e) => {
          // Zabraň browserovi deselectnut text po mouseup.
          e.preventDefault();
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = parseInt(rawM || "0", 10) || 0;
            const step = 5;
            const next =
              e.key === "ArrowUp"
                ? (cur + step) % 60
                : (cur - step + 60) % 60;
            const s = String(next).padStart(2, "0");
            setRawM(s);
            commit(undefined, s);
          }
        }}
        disabled={disabled}
        aria-label="Minúta"
        placeholder="MM"
        style={{ textAlign: "center", padding: 0 }}
        className={baseCls}
      />
    </div>
  );
}

export type CalendarNote = {
  id: string;
  date: string; // YYYY-MM-DD
  body: string;
  kind?: "note" | "call" | "meeting";
  starts_at?: string | null;
  contact_name?: string | null;
  created_at: string;
  // Ak note bola vytvorena z lead handover (kind='meeting'), tieto polia
  // sa preplní na serveri v /app/calendar/page.tsx — aby Day Modal
  // vedel zobraziť rich kartu klienta (telefón, m², typ, priestor).
  lead_id?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_data?: Record<string, unknown> | null;
  lead_status?: string | null;
  /** Meno cieľového člena tímu (obhliadkár/realizátor). Zobrazuje sa
   * v mesačnom aj dennom náhľade kalendára (nie meno klienta — to je
   * až v Day Modal detaili). */
  target_user_name?: string | null;
};

export type CalendarCallback = {
  lead_id: string;
  lead_name: string;
  phone: string | null;
  at: string; // ISO datetime
  attempts: number;
};

export type AssignLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  m2: string | null;
  floor_type: string | null;
};

export interface FilterableUser {
  id: string;
  name: string;
  role: string;
}

interface Props {
  initialMonth: string; // YYYY-MM
  notes: CalendarNote[];
  callbacks: CalendarCallback[];
  /** Rola aktuálneho usera — určuje či vidí + tlačidlá "Nová obhliadka / Realizácia". */
  role?: string;
  /** Assign mode — obchodák prišiel z lead karty a priraďuje robotu. */
  assignMode?: "inspection" | "realization" | null;
  /** Profil leadu (name, email, phone) — pre banner + Day modal keď assign mode. */
  assignLead?: AssignLead | null;
  /** Manual pick mode — otvoril + Nová obhliadka / realizácia bez leadu → otvor picker */
  manualPick?: boolean;
  /** Zoznam členov tímu na filter (obchodák/admin) — dropdown v hlavičke. */
  filterableUsers?: FilterableUser[];
  /** Aktuálne aktívny filter (user id). */
  activeFilterUserId?: string | null;
}

const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const MONTHS = [
  "Január",
  "Február",
  "Marec",
  "Apríl",
  "Máj",
  "Jún",
  "Júl",
  "August",
  "September",
  "Október",
  "November",
  "December",
];

export function CalendarGrid({
  initialMonth,
  notes,
  callbacks,
  role,
  assignMode,
  assignLead,
  manualPick,
  filterableUsers = [],
  activeFilterUserId = null,
}: Props) {
  const canAssign = role === "obchod" || role === "admin";
  const isAssigning = !!assignMode;
  const [manualOpen, setManualOpen] = React.useState<
    "inspection" | "realization" | null
  >(manualPick && assignMode ? assignMode : null);
  const [monthStr, setMonthStr] = React.useState(initialMonth);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [localNotes, setLocalNotes] = React.useState<CalendarNote[]>(notes);
  const [addEventOpen, setAddEventOpen] = React.useState(false);
  const searchParams = useSearchParams();

  // Dnes/Mesiac toggle (obchod/admin) — user: "ked obchodak alebo admin
  // dnes nech mu to ukaze dnes na hodiny presne o kolkej ma kto co, a
  // potom sa viem prekliknut spat na mesiac".
  const [viewMode, setViewMode] = React.useState<"month" | "day">("month");

  React.useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  // BUG FIX 2026-07-11: keď obchodák klikne "Nová obhliadka" Link, Next.js
  // aktualizuje props (manualPick=true, assignMode='inspection') ale
  // komponent sa NEUNMOUNTUJE → useState initializer sa nespustí znova →
  // manualOpen zostáva null → modal sa neotvorí. useEffect syncne.
  React.useEffect(() => {
    if (manualPick && assignMode) {
      setManualOpen(assignMode);
    }
  }, [manualPick, assignMode]);

  // Ak URL má ?day=YYYY-MM-DD (napr. z SuggestDayButton "Prejsť na
  // tento deň"), auto-otvor day modal na ten dátum.
  React.useEffect(() => {
    const dayParam = searchParams.get("day");
    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
      setSelected(dayParam);
    }
  }, [searchParams]);

  const [year, monthIdx] = monthStr.split("-").map(Number);
  // monthIdx je 1-12, JS Date používa 0-11
  const firstOfMonth = new Date(year, monthIdx - 1, 1);
  const daysInMonth = new Date(year, monthIdx, 0).getDate();
  // ISO weekday: 1=Po ... 7=Ne. getDay() vracia 0=Ne ... 6=So.
  const firstDayWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Po
  const totalCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;

  const todayStr = toLocalIsoDate(new Date());

  function prevMonth() {
    const d = new Date(year, monthIdx - 2, 1);
    setMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function nextMonth() {
    const d = new Date(year, monthIdx, 1);
    setMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function gotoToday() {
    setMonthStr(todayStr.slice(0, 7));
    setSelected(todayStr);
  }

  const cells: Array<{ date: string; dayOfMonth: number; inMonth: boolean }> =
    [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - firstDayWeekday;
    const d = new Date(year, monthIdx - 1, 1 + dayOffset);
    const iso = toLocalIsoDate(d);
    cells.push({
      date: iso,
      dayOfMonth: d.getDate(),
      inMonth: d.getMonth() === monthIdx - 1,
    });
  }

  const notesByDate = new Map<string, CalendarNote[]>();
  for (const n of localNotes) {
    if (!notesByDate.has(n.date)) notesByDate.set(n.date, []);
    notesByDate.get(n.date)!.push(n);
  }
  const callbacksByDate = new Map<string, CalendarCallback[]>();
  for (const c of callbacks) {
    const d = c.at.slice(0, 10);
    if (!callbacksByDate.has(d)) callbacksByDate.set(d, []);
    callbacksByDate.get(d)!.push(c);
  }

  const selectedNotes = selected ? (notesByDate.get(selected) ?? []) : [];
  const selectedCallbacks = selected
    ? (callbacksByDate.get(selected) ?? [])
    : [];

  return (
    <>
      {/* ASSIGN MODE BANNER — zobrazuje profil zákazníka pri priradzovaní.
          Redesign 2026-07-11: user "toto by mohlo byt krajsie prazdneho
          atd, v bublinach by mohli byt tie veci ze mesto rozmer typ, cislo
          mail v osobitnom riadku, otvorit lead → otvorit detail". */}
      {isAssigning && assignLead && (
        <div
          className={cn(
            "rounded-2xl border-2 p-5 mb-3 shadow-sm",
            assignMode === "inspection"
              ? "border-violet-300 bg-gradient-to-br from-violet-50 via-white to-violet-50/40"
              : "border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40",
          )}
        >
          {/* HEADER — emoji + label + meno + CTA vpravo */}
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "w-14 h-14 rounded-full inline-flex items-center justify-center text-2xl shrink-0 shadow-lg",
                assignMode === "inspection"
                  ? "bg-violet-500 text-white shadow-violet-500/30"
                  : "bg-emerald-500 text-white shadow-emerald-500/30",
              )}
            >
              {assignMode === "inspection" ? "🔍" : "🔨"}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-[10px] uppercase tracking-widest font-black inline-flex items-center gap-1.5",
                  assignMode === "inspection"
                    ? "text-violet-700"
                    : "text-emerald-700",
                )}
              >
                Priraďuješ{" "}
                {assignMode === "inspection" ? "obhliadku" : "realizáciu"}{" "}
                zákazníkovi
              </div>
              <div className="text-2xl font-black tracking-tight leading-tight mt-1">
                {assignLead.name || (
                  <span className="italic text-muted-foreground">
                    bez mena
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/agent/leads/${assignLead.id}`}
              target="_blank"
              className={cn(
                "shrink-0 text-xs font-bold inline-flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/80 transition-colors",
                assignMode === "inspection"
                  ? "text-violet-700 border border-violet-200"
                  : "text-emerald-700 border border-emerald-200",
              )}
            >
              Otvoriť detail ↗
            </Link>
          </div>

          {/* KONTAKT — osobitný riadok: tel: + email: (biele karty s ikonami) */}
          {(assignLead.phone || assignLead.email) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {assignLead.phone && (
                <a
                  href={`tel:${assignLead.phone}`}
                  className="flex items-center gap-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 px-3 py-2.5 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 text-sm">
                    📞
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-black uppercase tracking-wider text-emerald-700">
                      Telefón
                    </div>
                    <div className="font-black tabular-nums text-sm text-slate-900 truncate">
                      {formatPhoneSK(assignLead.phone)}
                    </div>
                  </div>
                </a>
              )}
              {assignLead.email && (
                <a
                  href={`mailto:${assignLead.email}`}
                  className="flex items-center gap-2.5 rounded-xl bg-white border border-slate-200 hover:border-sky-400 hover:bg-sky-50/40 px-3 py-2.5 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 text-sm">
                    ✉
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-black uppercase tracking-wider text-sky-700">
                      Email
                    </div>
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {assignLead.email}
                    </div>
                  </div>
                </a>
              )}
            </div>
          )}

          {/* CHIPS — bubliny s mestom / rozmerom / typom */}
          {(assignLead.city || assignLead.m2 || assignLead.floor_type) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {assignLead.city && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800 whitespace-nowrap shadow-sm">
                  📍 {assignLead.city}
                </span>
              )}
              {assignLead.m2 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800 whitespace-nowrap shadow-sm">
                  📐 {assignLead.m2} m²
                </span>
              )}
              {assignLead.floor_type && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800 whitespace-nowrap shadow-sm">
                  🎨 {assignLead.floor_type}
                </span>
              )}
            </div>
          )}

          {/* AUTO-SUGGEST — nájdi optimálny deň podľa mesta klienta.
              Batchuje cesty (ak tím má v ten deň iné zákazky v tom istom
              meste, jedna cesta = viac roboty). */}
          <SuggestDayButton
            city={assignLead.city ?? null}
            mode={assignMode}
          />

          {/* HINT — dole */}
          <div
            className={cn(
              "mt-3 text-xs font-semibold inline-flex items-center gap-1.5 px-3 py-2 rounded-lg",
              assignMode === "inspection"
                ? "bg-violet-100/60 text-violet-800"
                : "bg-emerald-100/60 text-emerald-800",
            )}
          >
            💡 Alebo klikni na voľný deň v kalendári — otvorí sa formulár na
            priradenie.
          </div>
        </div>
      )}

      {/* Calendar grid — tučný a čistý */}
      <div className="rounded-2xl border-2 bg-background overflow-hidden shadow-sm flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b-2 bg-gradient-to-b from-sky-50/50 to-transparent gap-2 flex-wrap">
          <div className="font-extrabold text-xl tracking-tight">
            {MONTHS[monthIdx - 1]}{" "}
            <span className="text-muted-foreground font-bold">{year}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canAssign && (
              <>
                {/* Manual add — user "toto nech je moznost manualne pridat
                    obhliadku a realizaciu aj to tam napis niekde manualne
                    pridanie". Rôzne od normálneho flow (kde sa realizácia
                    priradí z /obhliadnute Finálna CP tab s kompletnými
                    lead dátami) — tu je ručný vstup pre lead ktorý neprešiel
                    cez CRM pipeline (napr. malá garáž od známeho). */}
                <span
                  className="hidden md:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 mr-1"
                  title="Ručné pridanie obhliadky/realizácie mimo štandardného lead pipeline-u"
                >
                  ✏ Manuálne pridanie:
                </span>
                {/* BUG FIX 2026-07-11 (rev.2): Predtym to boli <Link href="…?manual=1">.
                    Modal sa otvoril na zaklade URL param — ale close handler
                    stripoval URL cez window.history.replaceState, co desyncne
                    Next.js router state od browser URL. Dalsi klik na Link →
                    Next.js si mysli ze URL sa nezmenil → soft nav = no-op →
                    modal sa neotvori. Az refresh (fresh URL read) to opravil.
                    Fix: buttons ktore priamo togglu manualOpen state, ziadny
                    URL round-trip. */}
                <button
                  type="button"
                  onClick={() => setManualOpen("inspection")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm"
                  title="Manuálne pridať obhliadku — vyber lead + dátum + obhliadkára"
                >
                  <ClipboardList className="w-3.5 h-3.5" aria-hidden />
                  Nová obhliadka
                </button>
                <button
                  type="button"
                  onClick={() => setManualOpen("realization")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                  title="Manuálne pridať realizáciu — vyber lead + dátum + realizátora"
                >
                  <Hammer className="w-3.5 h-3.5" aria-hidden />
                  Nová realizácia
                </button>
                <div className="w-px h-6 bg-border mx-1" />
              </>
            )}
            {/* User 2026-07-11: "kto má voľno filter preč" — dropdown
                bol tu odstránený. Ak sa v budúcnosti bude hodit, treba
                ho vrátiť z gitu. */}
            {/* Dnes / Mesiac toggle — VŠETKY role (obchod, admin,
                obhliadkár, realizátor). User: "realizator ma viac veci
                na dnes tak nech kukne cas". Obhliadkár tiež — vidí
                svoje priradené obhliadky pod sebou. */}
            <div className="inline-flex rounded-lg border-2 border-slate-200 p-0.5 bg-white">
              <button
                type="button"
                onClick={() => {
                  setViewMode("day");
                  const t = new Date();
                  setMonthStr(
                    `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`,
                  );
                }}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-black transition-colors",
                  viewMode === "day"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                Dnes
              </button>
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-black transition-colors",
                  viewMode === "month"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                Mesiac
              </button>
            </div>
            <button
              type="button"
              onClick={prevMonth}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
              aria-label="Predchádzajúci mesiac"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
              aria-label="Ďalší mesiac"
            >
              <ChevronRight className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* DAY VIEW — hourly agenda pre dnes. User: "realizator ma viac
            veci na dnes tak nech kukne cas". Všetky role. */}
        {viewMode === "day" && (
          <DayAgendaView
            date={todayStr}
            notes={notesByDate.get(todayStr) ?? []}
            onOpenDayModal={() => setSelected(todayStr)}
          />
        )}

        {/* Weekday header — bolder */}
        {viewMode === "month" && (
        <div className="grid grid-cols-7 border-b-2 bg-muted/30 text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={cn(
                "px-2 py-2.5 text-center",
                i >= 5 && "text-rose-500/80",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        )}

        {/* Day cells — väčšie, čitateľnejšie */}
        {viewMode === "month" && (
        <div className="grid grid-cols-7 auto-rows-fr">
        {/* Note: closing div moved to end via viewMode wrapper */}
          {cells.map((c, i) => {
            const isToday = c.date === todayStr;
            const notesOnDay = notesByDate.get(c.date) ?? [];
            const callsOnDay = callbacksByDate.get(c.date) ?? [];
            const isWeekend = i % 7 >= 5;
            const hasContent = notesOnDay.length + callsOnDay.length > 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(c.date)}
                className={cn(
                  "relative min-h-[110px] border-r border-b last:border-r-0 px-2.5 py-2 text-left transition-all group",
                  !c.inMonth && "bg-muted/25 text-muted-foreground/50",
                  c.inMonth && "hover:bg-sky-50/70 dark:hover:bg-sky-950/30",
                  c.inMonth && isWeekend && "bg-rose-50/20",
                  isToday && "ring-2 ring-inset ring-sky-400 bg-sky-50/40",
                  hasContent && c.inMonth && "font-medium",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-8 h-8 rounded-full text-base font-extrabold shrink-0",
                      isToday && "bg-sky-500 text-white shadow-md",
                      !isToday && isWeekend && c.inMonth && "text-rose-600",
                    )}
                  >
                    {c.dayOfMonth}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {/* CALLBACKY sa v kalendári NEZOBRAZUJÚ — nepatria sem.
                      Callbacky sú osobná pripomienka obchodníka a chodia
                      cez notifikácie (zvonček / /notifikacie), nie do
                      spoločného kalendára. Tento kalendár je pre priradenia
                      obhliadok / realizácií medzi rolami. */}
                  {notesOnDay.slice(0, 3).map((n, idx) => {
                    // User: "nech fialove su obhliadky nech to zacina emoji
                    // lupy 🔍 meno obhliadkara a to nemusi byt ani vidno
                    // v kalendari lead meno to az v Day Modal detail.
                    // Zelene = realizacie s kladivom 🔨".
                    const isInsp = /obhliadka|🔍/i.test(n.body);
                    const isReal = /realiz|🔨/i.test(n.body);
                    const emoji = isInsp ? "🔍" : isReal ? "🔨" : "📞";
                    const label =
                      n.target_user_name ??
                      n.contact_name ??
                      n.lead_name ??
                      "";
                    return (
                      <div
                        key={`n-${idx}`}
                        className={cn(
                          "text-[11px] font-bold leading-tight line-clamp-1 pl-1.5 border-l-2 rounded-r px-1 py-0.5 inline-flex items-center gap-1",
                          isInsp && "border-violet-500 bg-violet-50 text-violet-900",
                          isReal && "border-emerald-500 bg-emerald-50 text-emerald-900",
                          !isInsp && !isReal &&
                            "border-sky-400 bg-sky-50/60 text-foreground/85",
                        )}
                      >
                        <span aria-hidden>{emoji}</span>
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                  {notesOnDay.length > 3 && (
                    <div className="text-[10px] text-muted-foreground font-bold">
                      +{notesOnDay.length - 3} ďalších
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Add Hovor/Meeting modal */}
      {addEventOpen && (
        <AddEventModal
          defaultDate={selected ?? todayStr}
          onClose={() => setAddEventOpen(false)}
          onAdded={(note) => setLocalNotes((prev) => [...prev, note])}
        />
      )}

      {/* Modal popup — selected day */}
      {selected && (
        <DayModal
          date={selected}
          notes={selectedNotes}
          callbacks={selectedCallbacks}
          onClose={() => setSelected(null)}
          onAdded={(note) => setLocalNotes((prev) => [...prev, note])}
          onDeleted={(noteId) =>
            setLocalNotes((prev) => prev.filter((n) => n.id !== noteId))
          }
          assignMode={assignMode ?? null}
          assignLead={assignLead ?? null}
          initialTime={searchParams.get("time") ?? undefined}
        />
      )}

      {/* Manual pick modal — otvorí sa keď obchodák klikne "+ Nová obhliadka
          / realizácia" bez konkrétneho leadu (query param manual=1) */}
      {manualOpen && (
        <ManualAssignModal
          kind={manualOpen}
          onClose={() => setManualOpen(null)}
        />
      )}
    </>
  );
}

function DayModal({
  date,
  notes,
  callbacks,
  onClose,
  onAdded,
  onDeleted,
  assignMode,
  assignLead,
  initialTime,
}: {
  date: string;
  notes: CalendarNote[];
  callbacks: CalendarCallback[];
  onClose: () => void;
  onAdded: (n: CalendarNote) => void;
  onDeleted: (id: string) => void;
  assignMode?: "inspection" | "realization" | null;
  assignLead?: AssignLead | null;
  /** Prefill času (HH:MM) — napr. z SuggestDayButton odporúčania. */
  initialTime?: string;
}) {
  const isAssign = !!assignMode && !!assignLead;
  const router = useRouter();

  // Assign-mode state — person picker + time + submit
  const [assignUsers, setAssignUsers] = React.useState<
    Array<{ id: string; name: string; email: string; home_city: string | null }>
  >([]);
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [pickedUserId, setPickedUserId] = React.useState<string | null>(null);
  // Prefill zo SuggestDayButton (initialTime prop z URL ?time=HH:MM).
  // Default prázdny — user musí kliknúť a vyplniť (aby si neomylom
  // nepotvrdil "09:00" bez uvedomenia). Fallback na "09:00" iba v
  // submitAssign() ak by predsa len submitol prázdny čas.
  const [pickedTime, setPickedTime] = React.useState(initialTime ?? "");
  const [pickedDateTo, setPickedDateTo] = React.useState("");
  const [singleDay, setSingleDay] = React.useState(true);
  const [assignBusy, setAssignBusy] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);
  // Konflikt dialog — ak submitAssign detekuje warn/block, otvorí sa modal
  // s vysvetlením + user možnosťami: potvrdiť aj tak / napísať tímu / zrušiť.
  const [conflictInfo, setConflictInfo] = React.useState<{
    verdict: "warn" | "block";
    reasons: string[];
    existingCount: number;
    totalM2: number;
    maxDistanceKm: number;
  } | null>(null);

  // Load users pri prvom otvorení assign-mode modal-u + auto-preselect
  React.useEffect(() => {
    if (!isAssign || assignMode === null) return;
    let cancelled = false;
    setAssignLoading(true);
    listUsersByRoleAction(
      assignMode === "inspection" ? "obhliadky" : "realizacie",
    ).then((res) => {
      if (cancelled) return;
      setAssignLoading(false);
      if (!res.ok) return;
      setAssignUsers(res.users);
      // Auto-preselect podľa home_city
      const wantedCity = assignLead?.city
        ? normalizeCity(assignLead.city)
        : null;
      if (wantedCity) {
        const match = res.users.find(
          (u) => u.home_city && normalizeCity(u.home_city) === wantedCity,
        );
        if (match) setPickedUserId(match.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAssign, assignMode, assignLead?.city]);

  async function submitAssign(bypassConflict = false) {
    if (!isAssign || !assignLead || !pickedUserId || !assignMode) {
      const missing: string[] = [];
      if (!isAssign) missing.push("assign mode");
      if (!assignLead) missing.push("lead");
      if (!pickedUserId) missing.push("obhliadkár/realizátor");
      if (!assignMode) missing.push("typ (obhliadka/realizácia)");
      setAssignError(`Chýba: ${missing.join(", ")}`);
      return;
    }
    if (!pickedTime) {
      setAssignError("Vyplň čas (HH : MM) pred potvrdením.");
      return;
    }

    // KONFLIKT CHECK — user: "ak mu tam da rovnakemu timu dalsiu zakazku
    // v ten isty den na druhej strane slovenska neda to zmysel". Server
    // heuristika (m² + vzdialenosť) vráti verdict ok/warn/block.
    if (!bypassConflict) {
      try {
        const r = await fetch("/api/calendar/check-conflict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_user_id: pickedUserId,
            date,
            city: assignLead.city ?? null,
            m2: assignLead.m2 ?? null,
          }),
        });
        const j = (await r.json().catch(() => null)) as null | {
          ok: boolean;
          verdict: "ok" | "warn" | "block";
          reasons: string[];
          existing_count: number;
          total_m2: number;
          max_distance_km: number;
        };
        if (j?.ok && j.verdict !== "ok") {
          setConflictInfo({
            verdict: j.verdict,
            reasons: j.reasons,
            existingCount: j.existing_count,
            totalM2: j.total_m2,
            maxDistanceKm: j.max_distance_km,
          });
          return; // Prerušíme submit — user musí potvrdiť v conflict dialógu
        }
      } catch (e) {
        // Ak check zlyhá, nechajme priradenie prejsť — nechceme blokovať flow
        console.warn("[submitAssign] conflict check failed:", e);
      }
    }

    setAssignBusy(true);
    setAssignError(null);
    try {
      const startDate = date;
      const startDateTime = new Date(`${startDate}T${pickedTime}`);
      const dateStr = startDateTime.toLocaleString("sk-SK", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const noteParts = [
        `📅 Termín: ${dateStr}`,
        assignMode === "realization" && !singleDay && pickedDateTo
          ? `📅 Do: ${new Date(pickedDateTo).toLocaleDateString("sk-SK")}`
          : null,
        input.trim() || null,
      ].filter(Boolean);
      const fullNote = noteParts.join("\n");

      // REST endpoint namiesto Server Action — Server Actions v Cloudflare
      // Pages edge runtime často zlyhavali s "undefined is not an object".
      // Posielame scheduled_at (dátum + čas) aby to sedelo v kalendári.
      const httpRes = await fetch("/api/lead/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: assignLead.id,
          target_user_id: pickedUserId,
          mode: assignMode,
          note: fullNote || undefined,
          scheduled_at: startDateTime.toISOString(),
          scheduled_date: startDate, // YYYY-MM-DD
        }),
      });
      const res = (await httpRes.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string }
        | null;
      console.log("[submitAssign] result:", res, "status:", httpRes.status);
      setAssignBusy(false);
      if (!res) {
        setAssignError(
          `HTTP ${httpRes.status} — server nevrátil JSON. Skontroluj Cloudflare Pages logs.`,
        );
        return;
      }
      if (!res.ok) {
        setAssignError(res.error);
        return;
      }
      // ── SUCCESS ──
      // User: "musi to byt znanornene stala sa tato akcia hore
      // upozornenie a vrati ma na caka na cp idealne".
      // Redirect s query paramami → destination page ukáže banner.
      onClose();
      const params = new URLSearchParams({
        justAssigned: assignLead.id,
        assignedName: assignLead.name,
        assignedMode: assignMode,
        assignedDate: startDate,
        assignedTime: pickedTime,
      });
      // Realizácia → obchodákovho "Čaká na CP" (aby videl banner
      // + mohol pokračovať batch workflow ďalších leadov)
      // Obhliadka → /obhliadky (Aktívne tab obhliadkára, aj obchodák uvidí)
      const dest =
        assignMode === "realization"
          ? `/obhliadnute?tab=caka&${params.toString()}`
          : `/obhliadky?${params.toString()}`;
      // Hard nav (window.location) — router.push/replace môže zablokovať v
      // edge runtime kvôli RSC prefetching a stránka zostane na /calendar.
      window.location.href = dest;
    } catch (err) {
      console.error("[submitAssign] EXCEPTION:", err);
      setAssignBusy(false);
      setAssignError(
        err instanceof Error ? `Exception: ${err.message}` : "Neznáma chyba",
      );
    }
  }
  // Esc → zatvor modal
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [input, setInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const d = new Date(date + "T00:00:00");
  const niceDate = d.toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  async function saveNote() {
    const text = input.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    const res = await addCalendarNoteAction(date, text);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAdded({
      id: res.id,
      date,
      body: text,
      created_at: new Date().toISOString(),
    });
    setInput("");
  }

  async function removeNote(id: string) {
    if (!confirm("Zmazať poznámku?")) return;
    const res = await deleteCalendarNoteAction(id);
    if (res.ok) onDeleted(id);
    else alert(`Chyba: ${res.error}`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b flex items-start justify-between gap-3 bg-muted/30">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Detail dňa
            </div>
            <div className="font-extrabold text-lg capitalize">{niceDate}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Zavrieť"
            title="Zavrieť (Esc)"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ASSIGN MODE — lead profil na vrchu Day modalu */}
        {isAssign && assignLead && (
          <section
            className={cn(
              "rounded-xl border-2 p-3.5",
              assignMode === "inspection"
                ? "border-violet-300 bg-violet-50/60"
                : "border-emerald-300 bg-emerald-50/60",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-11 h-11 rounded-full inline-flex items-center justify-center text-xl shrink-0 shadow",
                  assignMode === "inspection"
                    ? "bg-violet-500 text-white"
                    : "bg-emerald-500 text-white",
                )}
              >
                {assignMode === "inspection" ? "🔍" : "🔨"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">
                  Priraďuješ{" "}
                  {assignMode === "inspection" ? "obhliadku" : "realizáciu"}
                </div>
                <div className="font-extrabold text-base leading-tight">
                  {assignLead.name || (
                    <span className="italic text-muted-foreground">
                      bez mena
                    </span>
                  )}
                </div>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  {assignLead.phone && (
                    <a
                      href={`tel:${assignLead.phone}`}
                      className="font-mono font-semibold hover:underline tabular-nums truncate"
                    >
                      📞 {formatPhoneSK(assignLead.phone)}
                    </a>
                  )}
                  {assignLead.email && (
                    <a
                      href={`mailto:${assignLead.email}`}
                      className="font-semibold hover:underline truncate"
                    >
                      ✉️ {assignLead.email}
                    </a>
                  )}
                  {assignLead.city && (
                    <div>
                      📍 <strong>{assignLead.city}</strong>
                    </div>
                  )}
                  {assignLead.m2 && (
                    <div>
                      📐 <strong>{assignLead.m2} m²</strong>
                    </div>
                  )}
                  {assignLead.floor_type && (
                    <div className="sm:col-span-2">
                      🎨 <strong>{assignLead.floor_type}</strong>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  👇 Priradenie na tento deň — vyber osobu, čas + poznámka
                  a klikni Potvrdiť dole.
                </div>
              </div>
              <Link
                href={`/agent/leads/${assignLead.id}`}
                target="_blank"
                className="shrink-0 text-[11px] font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/60"
              >
                Lead ↗
              </Link>
            </div>
          </section>
        )}

        {/* ASSIGN MODE — Person picker + čas + poznámka + submit */}
        {isAssign && assignLead && (
          <section className="space-y-3">
            {/* Čas */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                ⏰ Čas
                {assignMode === "inspection" && (
                  <span className="ml-1 normal-case text-muted-foreground/70">
                    (obhliadka trvá cca 30 min)
                  </span>
                )}
                {assignMode === "realization" && (
                  <span className="ml-1 normal-case text-muted-foreground/70">
                    (voliteľné — realizácia trvá celý deň)
                  </span>
                )}
              </label>
              <Time24Picker
                value={pickedTime}
                onChange={setPickedTime}
                disabled={assignBusy}
              />
            </div>

            {/* Multi-day pre realizáciu */}
            {assignMode === "realization" && (
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="single-day"
                    checked={singleDay}
                    onChange={(e) => {
                      setSingleDay(e.target.checked);
                      if (e.target.checked) setPickedDateTo("");
                    }}
                    className="accent-emerald-600"
                    disabled={assignBusy}
                  />
                  <label
                    htmlFor="single-day"
                    className="text-sm font-semibold cursor-pointer select-none"
                  >
                    Iba jeden deň
                  </label>
                </div>
                {!singleDay && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                      Dátum do (viac-dňová realizácia)
                    </label>
                    <input
                      type="date"
                      value={pickedDateTo}
                      min={date}
                      onChange={(e) => setPickedDateTo(e.target.value)}
                      disabled={assignBusy}
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Osoba — picker */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                👤 Komu?{" "}
                {assignMode === "inspection" ? "Obhliadkár" : "Realizator"}
                {assignLead.city && pickedUserId && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-1 py-0.5 rounded">
                    🎯 auto podľa {assignLead.city}
                  </span>
                )}
              </label>
              {assignLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Načítavam osoby…
                </div>
              ) : assignUsers.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Žiadny aktívny{" "}
                  {assignMode === "inspection" ? "obhliadkár" : "realizator"}{" "}
                  v systéme. Admin ho pridá cez <code>/admin/agents</code>.
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {assignUsers.map((u) => {
                    const isPicked = pickedUserId === u.id;
                    const cityMatch =
                      u.home_city &&
                      assignLead.city &&
                      normalizeCity(u.home_city) ===
                        normalizeCity(assignLead.city);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setPickedUserId(u.id)}
                          disabled={assignBusy}
                          className={cn(
                            "w-full text-left rounded-lg border-2 p-2.5 transition-colors disabled:opacity-50 flex items-center justify-between gap-3",
                            isPicked
                              ? assignMode === "inspection"
                                ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-200"
                                : "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-200"
                              : "border-input bg-background hover:bg-muted/50",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm truncate inline-flex items-center gap-1.5">
                              {u.name}
                              {u.home_city && (
                                <span
                                  className={cn(
                                    "text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded border",
                                    cityMatch
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                      : "bg-muted text-muted-foreground border-input",
                                  )}
                                >
                                  📍 {u.home_city}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {u.email}
                            </div>
                          </div>
                          {isPicked && (
                            <div
                              className={cn(
                                "w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0 text-white",
                                assignMode === "inspection"
                                  ? "bg-violet-500"
                                  : "bg-emerald-500",
                              )}
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden />
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* POZNÁMKA k priradeniu — inline, vyššie ako Potvrdiť.
                Text sa pošle spolu s obhliadkou/realizáciou (súčasť
                handoverToInspectionAction/handoverToRealizationAction
                cez `input` state — rovnaká premenná ako day-note
                composer). */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                📝 Poznámka <span className="normal-case font-normal text-muted-foreground/70">(voliteľná — pošle sa spolu)</span>
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitAssign();
                  }
                }}
                disabled={assignBusy}
                rows={2}
                placeholder="napr. Zavolať vopred, prístup zo strany garáže..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
              />
            </div>

            {/* Error */}
            {assignError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-900">
                ⚠ {assignError}
              </div>
            )}

            {/* Validation hints — user vidí presne prečo je button off */}
            {(!pickedTime || !pickedUserId) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 space-y-0.5">
                {!pickedTime && <div>⏰ Vyplň čas (HH : MM)</div>}
                {!pickedUserId && (
                  <div>
                    👤 Vyber{" "}
                    {assignMode === "inspection"
                      ? "obhliadkára"
                      : "realizátora"}
                  </div>
                )}
              </div>
            )}

            {/* Submit — POSLEDNÝ krok.
                POZOR: NEDISABLEUJEME kvôli pickedTime — user by mohol
                stlačiť Potvrdiť skôr ako HH input stihol blur-nút
                (race condition mezi blur + click). Validáciu robíme
                v submitAssign() — ak čas chýba, ukáže sa error. */}
            <button
              type="button"
              onMouseDown={() => {
                // Force blur na akéhokoľvek focus-ovaného inputu →
                // spustí sa commit() → pickedTime sa updatne pred
                // tým než sa spracuje click event.
                if (
                  document.activeElement &&
                  document.activeElement instanceof HTMLElement
                ) {
                  document.activeElement.blur();
                }
              }}
              onClick={() => submitAssign()}
              disabled={assignBusy || !pickedUserId}
              className={cn(
                "w-full h-12 rounded-xl font-bold text-white transition-colors inline-flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
                assignMode === "inspection"
                  ? "bg-violet-600 hover:bg-violet-700"
                  : "bg-emerald-600 hover:bg-emerald-700",
              )}
            >
              {assignBusy ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                  Odovzdávam…
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" aria-hidden />
                  Potvrdiť —{" "}
                  {assignMode === "inspection"
                    ? "poslať obhliadku"
                    : "poslať realizáciu"}
                </>
              )}
            </button>
          </section>
        )}

        {/* KONFLIKT DIALOG — server heuristika detekovala prekročenie
            kapacity za deň (m² + vzdialenosť). Modal ukáže dôvody +
            umožní: potvrdiť aj tak / napísať tímu (DM) / zrušiť. */}
        {conflictInfo && pickedUserId && assignLead && (
          <div
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConflictInfo(null)}
          >
            <div
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  "px-5 py-4 text-white",
                  conflictInfo.verdict === "block"
                    ? "bg-gradient-to-br from-rose-500 to-rose-700"
                    : "bg-gradient-to-br from-amber-500 to-amber-700",
                )}
              >
                <div className="text-2xl mb-1">
                  {conflictInfo.verdict === "block" ? "⛔" : "⚠"}
                </div>
                <div className="text-lg font-black leading-tight">
                  {conflictInfo.verdict === "block"
                    ? "Nedá sa stihnúť"
                    : "Pozor — stihnú dve zákazky v ten deň?"}
                </div>
                <div className="text-sm opacity-90 mt-0.5">
                  {conflictInfo.existingCount} existujúc
                  {conflictInfo.existingCount === 1 ? "a" : "e"} zákazk
                  {conflictInfo.existingCount === 1 ? "a" : "y"} · celkom{" "}
                  {conflictInfo.totalM2.toFixed(0)} m²
                  {conflictInfo.maxDistanceKm > 0 &&
                    ` · vzdialenosť ${conflictInfo.maxDistanceKm.toFixed(0)} km`}
                </div>
              </div>
              <div className="px-5 py-4 space-y-3">
                {conflictInfo.reasons.map((r, i) => (
                  <div
                    key={i}
                    className="text-sm text-slate-800 leading-snug"
                  >
                    • {r}
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-3 bg-slate-50 flex flex-wrap gap-2">
                {conflictInfo.verdict === "warn" && (
                  <button
                    type="button"
                    onClick={async () => {
                      setConflictInfo(null);
                      await submitAssign(true);
                    }}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-black transition-colors"
                  >
                    ✓ Aj tak potvrdiť
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    // Otvor DM s realizatorom — pre-filled správa
                    setConflictInfo(null);
                    try {
                      const r = await fetch("/api/chat/dm", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ peer_id: pickedUserId }),
                      });
                      const jj = (await r.json()) as {
                        ok?: boolean;
                        room_id?: string;
                      };
                      if (jj.ok && jj.room_id) {
                        window.location.href = `/dm/${jj.room_id}`;
                      }
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 text-sm font-black transition-colors"
                >
                  💬 Napísať tímu
                </button>
                <button
                  type="button"
                  onClick={() => setConflictInfo(null)}
                  className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2.5 text-sm font-bold transition-colors"
                >
                  Zrušiť
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Callbacks */}
        {callbacks.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Pripomienky volania
            </h3>
            <ul className="space-y-1.5">
              {callbacks.map((c) => {
                const time = new Date(c.at).toLocaleTimeString("sk-SK", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <li key={c.lead_id}>
                    <Link
                      href={`/agent/leads/${c.lead_id}`}
                      className="block rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm hover:bg-red-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-red-900 dark:text-red-200">
                          {c.lead_name}
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                          <Phone className="w-3 h-3" aria-hidden />
                          {time}
                        </div>
                      </div>
                      {c.phone && (
                        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {formatPhoneSK(c.phone)} · {c.attempts}× nedvíhal
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Poznámky (day-notes) — v ASSIGN móde skryté, aby to nemátlo
            (užívateľ píše poznámku k obhliadke vyššie, nie k dňu). */}
        {!isAssign && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Poznámky ({notes.length})
            </h3>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Žiadne poznámky na tento deň.
              </p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) =>
                  n.lead_id && n.kind === "meeting" ? (
                    <LeadEventCard
                      key={n.id}
                      note={n}
                      onDelete={() => removeNote(n.id)}
                    />
                  ) : (
                    <EditableNoteRow
                      key={n.id}
                      note={n}
                      onDelete={() => removeNote(n.id)}
                      onSave={(newBody) => {
                        n.body = newBody;
                      }}
                    />
                  ),
                )}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* User: "poznamky ku dnu dajme prec nevidim v tom vyuzitie".
          Namiesto textarea iba jednoduchy "Hotovo" close button v day
          modaloch (mimo assign mode). Assign mode ma vlastnu inline
          poznamku pri handovere vyššie. */}
      {!isAssign && (
        <div className="border-t p-3 bg-muted/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5 text-sm font-bold shadow-sm"
          >
            <Check className="w-4 h-4" aria-hidden />
            Hotovo
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Slovenské skloňovanie pre poznámky a hovory.
 * 1 = nom. sg., 2-4 = nom. pl., 5+ = gen. pl.
 */
function pluralPoznamka(n: number): string {
  if (n === 1) return "1 poznámka";
  if (n >= 2 && n <= 4) return `${n} poznámky`;
  return `${n} poznámok`;
}

function pluralHovor(n: number): string {
  if (n === 1) return "1 hovor";
  if (n >= 2 && n <= 4) return `${n} hovory`;
  return `${n} hovorov`;
}

/**
 * Rich karta obhliadka/realizácia eventu v DayModal — namiesto plain
 * textovej poznámky zobrazí všetko čo obchodák/obhliadkár/realizator
 * potrebuje pri otvorení: KAM ideš, ČAS, KLIENT + TEL:, m², typ, priestor,
 * poznámka, tlačidlo Otvoriť detail.
 */
function LeadEventCard({
  note,
  onDelete,
}: {
  note: CalendarNote;
  onDelete: () => void;
}) {
  const data = (note.lead_data ?? {}) as Record<string, unknown>;
  const isInspection = /obhliadka|🔍/i.test(note.body);
  const isRealization = /realiz|🔨/i.test(note.body);
  // Ak je lead už status='inspected' (obhliadkár klikol Odoslať obhliadku)
  // ukážeme "OBHLIADNUTÉ ✓" badge + emerald tint aby obchodák hneď videl
  // že tento termín je HOTOVÝ a treba spraviť ďalší krok (poslať CP).
  const isDoneInspection = isInspection && note.lead_status === "inspected";
  const timeStr = note.starts_at
    ? new Date(note.starts_at).toLocaleTimeString("sk-SK", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Extract z data JSONB
  const m2 = coerceStr(data.plocha);
  const priestor = coerceStr(data.priestor);
  const typPodlahy = coerceStr(data.typ_podlahy);
  const lokalita = coerceStr(data.lokalita);
  const inspNote = coerceStr(data.inspection_note);
  const agentNote = coerceStr(data.agent_note);

  // Ak už obhliadka dokončená (status=inspected) → obchodákovi ho posúvame
  // priamo na /obhliadnute aby videl testy + fotky + m² a klikol "Poslať CP".
  const detailHref = isDoneInspection
    ? `/obhliadnute`
    : note.lead_id && isInspection
      ? `/obhliadky/${note.lead_id}`
      : note.lead_id && isRealization
        ? `/realizacie/${note.lead_id}`
        : note.lead_id
          ? `/agent/leads/${note.lead_id}`
          : "#";

  const accent = isDoneInspection
    ? {
        border: "border-emerald-400",
        bg: "bg-emerald-50",
        icon: "bg-emerald-600",
        text: "text-emerald-800",
        pill: "bg-emerald-100 text-emerald-800",
        emoji: "✓",
        label: "Obhliadnuté — pošli CP",
      }
    : isInspection
      ? {
          border: "border-violet-300",
          bg: "bg-violet-50/60",
          icon: "bg-violet-500",
          text: "text-violet-700",
          pill: "bg-violet-100 text-violet-800",
          emoji: "🔍",
          label: "Obhliadka",
        }
    : isRealization
      ? {
          border: "border-emerald-300",
          bg: "bg-emerald-50/60",
          icon: "bg-emerald-500",
          text: "text-emerald-700",
          pill: "bg-emerald-100 text-emerald-800",
          emoji: "🔨",
          label: "Realizácia",
        }
      : {
          border: "border-sky-300",
          bg: "bg-sky-50/60",
          icon: "bg-sky-500",
          text: "text-sky-700",
          pill: "bg-sky-100 text-sky-800",
          emoji: "📞",
          label: "Meeting",
        };

  return (
    <li className={cn("rounded-xl border-2 overflow-hidden shadow-sm", accent.border, accent.bg)}>
      {/* Header — emoji + label + čas + delete */}
      <div className="px-3.5 py-2.5 flex items-center gap-2 bg-white/60 border-b border-inherit">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-lg shrink-0", accent.icon)}>
          {accent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn("text-[10px] font-black uppercase tracking-wider", accent.text)}>
            {accent.label}
          </div>
          {timeStr && (
            <div className="text-base font-black tabular-nums inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 opacity-60" />
              {timeStr}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="w-7 h-7 rounded-md hover:bg-rose-100 text-rose-600 inline-flex items-center justify-center transition-colors"
          aria-label="Zmazať poznámku"
          title="Zmazať"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Klient meno + telefón */}
      <div className="px-3.5 py-3 space-y-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
            Klient
          </div>
          <div className="font-extrabold text-lg leading-tight">
            {note.lead_name ?? note.contact_name ?? "—"}
          </div>
        </div>

        {note.lead_phone && (
          <a
            href={`tel:${note.lead_phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 text-sm font-black shadow-sm transition-colors"
          >
            <Phone className="w-4 h-4" />
            {formatPhoneSK(note.lead_phone)}
          </a>
        )}

        {/* Info chipsy */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {lokalita && (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold", accent.pill)}>
              <MapPin className="w-3 h-3" />
              {lokalita}
            </span>
          )}
          {m2 && (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold", accent.pill)}>
              <Ruler className="w-3 h-3" />
              {m2} m²
            </span>
          )}
          {priestor && (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold", accent.pill)}>
              🏠 {priestor}
            </span>
          )}
          {typPodlahy && (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold", accent.pill)}>
              🎨 {typPodlahy}
            </span>
          )}
        </div>

        {/* Poznámka od obchodníka (inspection_note) */}
        {inspNote && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2 mt-2">
            <StickyNote className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-[12px] text-amber-900 leading-snug">
              <strong className="font-bold">Poznámka:</strong> {inspNote}
            </div>
          </div>
        )}
        {!inspNote && agentNote && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2 mt-2">
            <StickyNote className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-[12px] text-amber-900 leading-snug">
              <strong className="font-bold">Poznámka:</strong> {agentNote}
            </div>
          </div>
        )}
      </div>

      {/* CTA — Otvoriť detail */}
      {detailHref !== "#" && (
        <Link
          href={detailHref}
          className={cn(
            "flex items-center justify-between px-3.5 py-2.5 bg-white/70 hover:bg-white border-t border-inherit font-bold text-sm transition-colors",
            accent.text,
          )}
        >
          <span>{isDoneInspection ? "Poslať cenovú ponuku" : "Otvoriť detail"}</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </li>
  );
}

function coerceStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return isFinite(v) ? String(v) : null;
  return null;
}

/**
 * Editovateľný riadok poznámky v DayModal.
 * Default zobrazí read-only text. Klik na pencil ikonu → textarea + Save/Cancel.
 */
function EditableNoteRow({
  note,
  onDelete,
  onSave,
}: {
  note: CalendarNote;
  onDelete: () => void;
  onSave: (newBody: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note.body);
  const [busy, setBusy] = React.useState(false);

  async function commit() {
    const text = draft.trim();
    if (!text || text === note.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const res = await updateCalendarNoteAction(note.id, text);
    setBusy(false);
    if (res.ok) {
      onSave(text);
      setEditing(false);
    } else {
      alert(`Chyba: ${res.error}`);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-sky-300 bg-sky-50 dark:bg-sky-950/30 px-3 py-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(note.body);
              setEditing(false);
            }
          }}
          autoFocus
          rows={2}
          className="w-full px-2 py-1.5 rounded border bg-background text-sm resize-none"
        />
        <div className="flex items-center justify-end gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => {
              setDraft(note.body);
              setEditing(false);
            }}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded hover:bg-muted"
          >
            Zrušiť
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-50"
          >
            <Check className="w-3 h-3" aria-hidden />
            {busy ? "…" : "Uložiť"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border bg-muted/20 px-3 py-2 group">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm whitespace-pre-wrap break-words flex-1">
          {note.body}
        </p>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-sky-600 p-1"
            aria-label="Upraviť"
            title="Upraviť"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-1"
            aria-label="Zmazať"
            title="Zmazať"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Modal — pridanie Hovoru / Meetingu.
 *
 * Polia:
 *  - Typ: Hovor / Meeting (radio)
 *  - Dátum (default = vybraný deň alebo dnes)
 *  - Čas (voliteľné)
 *  - Meno / firma (povinné)
 *  - Poznámka (voliteľná)
 */
function AddEventModal({
  defaultDate,
  onClose,
  onAdded,
}: {
  defaultDate: string;
  onClose: () => void;
  onAdded: (note: CalendarNote) => void;
}) {
  const [kind, setKind] = React.useState<"call" | "meeting">("call");
  const [date, setDate] = React.useState(defaultDate);
  const [time, setTime] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!contact.trim()) {
      setError("Zadaj meno alebo firmu.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await addCalendarEventAction({
      date,
      time: time || null,
      kind,
      contact_name: contact,
      body,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Optimistic add — server vrátil len id, dopočítame ostatné
    let startsAt: string | null = null;
    if (time) {
      const [h, m] = time.split(":");
      startsAt = new Date(`${date}T${h}:${m}:00`).toISOString();
    }
    onAdded({
      id: res.id,
      date,
      body: body.trim() || `${kind === "call" ? "Hovor" : "Meeting"} — ${contact.trim()}`,
      kind,
      starts_at: startsAt,
      contact_name: contact.trim(),
      created_at: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b flex items-start justify-between gap-3 bg-muted/30">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Pridať udalosť
            </div>
            <div className="font-extrabold text-lg">
              {kind === "call" ? "📞 Hovor" : "🤝 Meeting"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Zavrieť"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Typ */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Typ
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("call")}
                className={cn(
                  "px-3 py-2.5 rounded-lg border font-bold text-sm transition-colors",
                  kind === "call"
                    ? "border-foreground bg-foreground text-background"
                    : "border-input bg-background hover:bg-muted/50",
                )}
              >
                📞 Hovor
              </button>
              <button
                type="button"
                onClick={() => setKind("meeting")}
                className={cn(
                  "px-3 py-2.5 rounded-lg border font-bold text-sm transition-colors",
                  kind === "meeting"
                    ? "border-foreground bg-foreground text-background"
                    : "border-input bg-background hover:bg-muted/50",
                )}
              >
                🤝 Meeting
              </button>
            </div>
          </div>

          {/* Dátum + čas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Dátum
              </div>
              <QuickDatePicker value={date} onChange={setDate} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Čas
              </div>
              <Time24Picker value={time} onChange={setTime} />
            </div>
          </div>

          {/* Meno / firma */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Meno / firma *
            </div>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="napr. Karol Sivák alebo Firma s.r.o."
              autoFocus
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </div>

          {/* Poznámka */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Poznámka
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="napr. 'Obhliadka garáže 80 m², ukázať vzorky'"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t bg-muted/20 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted"
          >
            Zrušiť
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !contact.trim()}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
          >
            {saving ? "Pridávam…" : "Pridať"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * QuickDatePicker — mini popover s dňami aktuálneho mesiaca.
 *   - Trigger button ukazuje Slovak-formatted dátum bez roku
 *     (napr. "Št 18. jún") — rok je vždy implicit.
 *   - Klik otvorí 7-stĺpcovú mriežku dní s nav arrows
 *   - "Dnes" quick button
 */
function QuickDatePicker({
  value,
  onChange,
}: {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(value.slice(0, 7));
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const d = new Date(value + "T00:00:00");
  const todayStr = toLocalIsoDate(new Date());
  const label = d.toLocaleDateString("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

  // viewMonth grid
  const [vy, vm] = viewMonth.split("-").map(Number);
  const firstDayWeekday = (new Date(vy, vm - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const totalCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const off = i - firstDayWeekday;
    const cd = new Date(vy, vm - 1, 1 + off);
    return {
      iso: toLocalIsoDate(cd),
      dom: cd.getDate(),
      inMonth: cd.getMonth() === vm - 1,
    };
  });

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function shift(delta: number) {
    const nd = new Date(vy, vm - 1 + delta, 1);
    setViewMonth(
      `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-left hover:bg-muted/40 capitalize"
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1.5 left-0 right-0 sm:right-auto sm:min-w-[260px] rounded-xl border bg-background shadow-2xl p-2">
          <div className="flex items-center justify-between px-1 py-1 mb-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="p-1 rounded hover:bg-muted"
              aria-label="Predch. mesiac"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
            </button>
            <span className="text-xs font-bold capitalize">
              {new Date(vy, vm - 1, 1).toLocaleDateString("sk-SK", {
                month: "long",
              })}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="p-1 rounded hover:bg-muted"
              aria-label="Dalsí mesiac"
            >
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 text-[10px] font-bold uppercase text-muted-foreground text-center mb-0.5">
            {["P", "U", "S", "Š", "P", "S", "N"].map((w, i) => (
              <div key={i} className={cn("py-0.5", i >= 5 && "text-red-500/80")}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => {
              const selected = c.iso === value;
              const isToday = c.iso === todayStr;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(c.iso)}
                  className={cn(
                    "h-8 text-xs font-semibold rounded-md transition-colors",
                    !c.inMonth && "text-muted-foreground/40",
                    c.inMonth && "hover:bg-muted/60",
                    selected && "bg-sky-500 text-white hover:bg-sky-600",
                    !selected && isToday && "ring-1 ring-sky-400",
                  )}
                >
                  {c.dom}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const today = toLocalIsoDate(new Date());
              setViewMonth(today.slice(0, 7));
              pick(today);
            }}
            className="mt-2 w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-foreground text-background hover:bg-foreground/85"
          >
            Dnes
          </button>
        </div>
      )}
    </div>
  );
}
