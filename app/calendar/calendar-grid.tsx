"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Hammer,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";

import {
  handoverToInspectionAction,
  handoverToRealizationAction,
  listUsersByRoleAction,
} from "@/app/agent/actions";
import { cn } from "@/lib/utils";
import { formatPhoneSK } from "@/lib/phone-format";
import {
  addCalendarEventAction,
  addCalendarNoteAction,
  deleteCalendarNoteAction,
  updateCalendarNoteAction,
} from "./actions";
import { ManualAssignModal } from "./manual-assign-modal";

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
  const parsed = React.useMemo(() => {
    const [hh, mm] = (value || "09:00").split(":");
    return {
      h: (hh || "09").padStart(2, "0"),
      m: (mm || "00").padStart(2, "0"),
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
    const hNum = Math.max(0, Math.min(23, parseInt(rawHVal || "0", 10) || 0));
    const mNum = Math.max(0, Math.min(59, parseInt(rawMVal || "0", 10) || 0));
    const hStr = String(hNum).padStart(2, "0");
    const mStr = String(mNum).padStart(2, "0");
    if (hStr !== rawH) setRawH(hStr);
    if (mStr !== rawM) setRawM(mStr);
    onChange(`${hStr}:${mStr}`);
  }

  const baseCls =
    "h-11 rounded-lg border border-input bg-background px-3 text-lg font-bold tabular-nums text-center " +
    "disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-violet-400 " +
    "focus:border-violet-400 transition-colors [appearance:textfield] " +
    "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={rawH}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setRawH(digits);
        }}
        onBlur={() => commit()}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          // Šípky hore/dole = ±1 hodina
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
        className={`${baseCls} flex-1`}
      />
      <span className="text-xl font-black text-muted-foreground select-none">
        :
      </span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={rawM}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setRawM(digits);
        }}
        onBlur={() => commit()}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          // Šípky = ±5 minút
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
        className={`${baseCls} flex-1`}
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

  React.useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const [year, monthIdx] = monthStr.split("-").map(Number);
  // monthIdx je 1-12, JS Date používa 0-11
  const firstOfMonth = new Date(year, monthIdx - 1, 1);
  const daysInMonth = new Date(year, monthIdx, 0).getDate();
  // ISO weekday: 1=Po ... 7=Ne. getDay() vracia 0=Ne ... 6=So.
  const firstDayWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Po
  const totalCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;

  const todayStr = new Date().toISOString().slice(0, 10);

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
    const iso = d.toISOString().slice(0, 10);
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
      {/* ASSIGN MODE BANNER — zobrazuje profil zákazníka pri priradzovaní */}
      {isAssigning && assignLead && (
        <div
          className={cn(
            "rounded-2xl border-2 p-4 mb-3 shadow-sm",
            assignMode === "inspection"
              ? "border-violet-300 bg-violet-50/60"
              : "border-emerald-300 bg-emerald-50/60",
          )}
        >
          <div className="flex items-start gap-3 flex-wrap">
            <div
              className={cn(
                "w-12 h-12 rounded-full inline-flex items-center justify-center text-2xl shrink-0 shadow",
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
                {assignMode === "inspection" ? "obhliadku" : "realizáciu"}{" "}
                zákazníkovi
              </div>
              <div className="text-lg font-extrabold tracking-tight">
                {assignLead.name || (
                  <span className="italic text-muted-foreground">
                    bez mena
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                {assignLead.phone && (
                  <a
                    href={`tel:${assignLead.phone}`}
                    className="font-mono font-semibold text-foreground hover:underline tabular-nums"
                  >
                    📞 {formatPhoneSK(assignLead.phone)}
                  </a>
                )}
                {assignLead.email && (
                  <a
                    href={`mailto:${assignLead.email}`}
                    className="font-semibold text-foreground hover:underline truncate max-w-[220px]"
                  >
                    ✉️ {assignLead.email}
                  </a>
                )}
                {assignLead.city && (
                  <span className="inline-flex items-center gap-0.5">
                    📍 <strong>{assignLead.city}</strong>
                  </span>
                )}
                {assignLead.m2 && (
                  <span className="inline-flex items-center gap-0.5">
                    📐 <strong>{assignLead.m2} m²</strong>
                  </span>
                )}
                {assignLead.floor_type && (
                  <span className="inline-flex items-center gap-0.5">
                    🎨 <strong>{assignLead.floor_type}</strong>
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground italic">
                👇 Klikni na voľný deň v kalendári — otvorí sa formulár na
                priradenie.
              </div>
            </div>
            <Link
              href={`/agent/leads/${assignLead.id}`}
              target="_blank"
              className="shrink-0 text-[11px] font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/60"
            >
              Otvoriť lead ↗
            </Link>
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
                <Link
                  href="/calendar?assign=inspection&manual=1"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm"
                >
                  <ClipboardList className="w-3.5 h-3.5" aria-hidden />
                  Nová obhliadka
                </Link>
                <Link
                  href="/calendar?assign=realization&manual=1"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                >
                  <Hammer className="w-3.5 h-3.5" aria-hidden />
                  Nová realizácia
                </Link>
                <div className="w-px h-6 bg-border mx-1" />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                setMonthStr(
                  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`,
                );
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted/60 hover:bg-muted transition-colors"
            >
              Dnes
            </button>
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

        {/* Weekday header — bolder */}
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

        {/* Day cells — väčšie, čitateľnejšie */}
        <div className="grid grid-cols-7 auto-rows-fr">
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
                    const isInspection = n.kind === "meeting";
                    const isCall = n.kind === "call";
                    return (
                      <div
                        key={`n-${idx}`}
                        className={cn(
                          "text-[11px] leading-tight line-clamp-1 pl-1.5 border-l-2 rounded-r px-1 py-0.5",
                          isInspection &&
                            "border-violet-500 bg-violet-50 text-violet-900",
                          isCall && "border-emerald-500 bg-emerald-50 text-emerald-900",
                          !isInspection &&
                            !isCall &&
                            "border-sky-400 bg-sky-50/60 text-foreground/85",
                        )}
                      >
                        {n.contact_name && (
                          <span className="font-bold">{n.contact_name}: </span>
                        )}
                        {n.body}
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
}: {
  date: string;
  notes: CalendarNote[];
  callbacks: CalendarCallback[];
  onClose: () => void;
  onAdded: (n: CalendarNote) => void;
  onDeleted: (id: string) => void;
  assignMode?: "inspection" | "realization" | null;
  assignLead?: AssignLead | null;
}) {
  const isAssign = !!assignMode && !!assignLead;
  const router = useRouter();

  // Assign-mode state — person picker + time + submit
  const [assignUsers, setAssignUsers] = React.useState<
    Array<{ id: string; name: string; email: string; home_city: string | null }>
  >([]);
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [pickedUserId, setPickedUserId] = React.useState<string | null>(null);
  const [pickedTime, setPickedTime] = React.useState("09:00");
  const [pickedDateTo, setPickedDateTo] = React.useState("");
  const [singleDay, setSingleDay] = React.useState(true);
  const [assignBusy, setAssignBusy] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

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

  async function submitAssign() {
    if (!isAssign || !assignLead || !pickedUserId || !assignMode) return;
    setAssignBusy(true);
    setAssignError(null);
    const startDate = date;
    const startDateTime = new Date(`${startDate}T${pickedTime || "09:00"}`);
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

    const res =
      assignMode === "inspection"
        ? await handoverToInspectionAction(
            assignLead.id,
            pickedUserId,
            fullNote || undefined,
          )
        : await handoverToRealizationAction(
            assignLead.id,
            pickedUserId,
            fullNote || undefined,
          );
    setAssignBusy(false);
    if (!res.ok) {
      setAssignError(
        res.error === "db_error"
          ? "DB error — pravdepodobne treba spustiť supabase/10_role_handoff.sql"
          : res.error,
      );
      return;
    }
    onClose();
    router.push(`/agent/leads/${assignLead.id}`);
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

            {/* Submit — POSLEDNÝ krok */}
            <button
              type="button"
              onClick={() => {
                // Zjednodušený UX: v ASSIGN móde je Potvrdiť POSLEDNÝ krok.
                // Note-textarea je vyššie (viď blok pred týmto buttonom).
                submitAssign();
              }}
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
              <ul className="space-y-2">
                {notes.map((n) => (
                  <EditableNoteRow
                    key={n.id}
                    note={n}
                    onDelete={() => removeNote(n.id)}
                    onSave={(newBody) => {
                      // optimistic — predpoklad že save prejde
                      n.body = newBody;
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Add note composer — v ASSIGN móde skryté (poznámka je inline
          vyššie, súčasť handoveru). */}
      {!isAssign && (
      <div className="border-t p-3 bg-muted/20">
        {error && (
          <div className="mb-2 text-xs text-destructive">⚠ {error}</div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveNote();
              }
            }}
            rows={2}
            placeholder="Napíš poznámku… (⌘+Enter pre uloženie)"
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none"
          />
          <button
            type="button"
            onClick={saveNote}
            disabled={!input.trim() || saving}
            className="h-10 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-40 transition-colors inline-flex items-center gap-1.5 text-sm font-bold"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {saving ? "…" : "Pridať"}
          </button>
        </div>
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
  const todayStr = new Date().toISOString().slice(0, 10);
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
      iso: cd.toISOString().slice(0, 10),
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
              const today = new Date().toISOString().slice(0, 10);
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
