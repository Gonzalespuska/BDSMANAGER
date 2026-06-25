"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  addCalendarNoteAction,
  deleteCalendarNoteAction,
} from "./actions";

export type CalendarNote = {
  id: string;
  date: string; // YYYY-MM-DD
  body: string;
  created_at: string;
};

export type CalendarCallback = {
  lead_id: string;
  lead_name: string;
  phone: string | null;
  at: string; // ISO datetime
  attempts: number;
};

interface Props {
  initialMonth: string; // YYYY-MM
  notes: CalendarNote[];
  callbacks: CalendarCallback[];
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

export function CalendarGrid({ initialMonth, notes, callbacks }: Props) {
  const [monthStr, setMonthStr] = React.useState(initialMonth);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [localNotes, setLocalNotes] = React.useState<CalendarNote[]>(notes);

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
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      {/* Calendar grid */}
      <div className="rounded-2xl border bg-background overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="font-bold text-base">
            {MONTHS[monthIdx - 1]} {year}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={gotoToday}
              className="px-2.5 py-1 rounded-md text-xs font-semibold border bg-background hover:bg-muted/50"
            >
              Dnes
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-md hover:bg-muted/50"
              aria-label="Predchádzajúci mesiac"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-md hover:bg-muted/50"
              aria-label="Ďalší mesiac"
            >
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b bg-muted/10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={cn(
                "px-2 py-2 text-center",
                i >= 5 && "text-red-500/80",
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const isSelected = selected === c.date;
            const isToday = c.date === todayStr;
            const notesOnDay = notesByDate.get(c.date) ?? [];
            const callsOnDay = callbacksByDate.get(c.date) ?? [];
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(c.date)}
                className={cn(
                  "relative min-h-[88px] border-r border-b last:border-r-0 px-2 py-1.5 text-left transition-colors group",
                  !c.inMonth && "bg-muted/30 text-muted-foreground/50",
                  c.inMonth && "hover:bg-muted/40",
                  isSelected && "bg-sky-100 dark:bg-sky-950/40 hover:bg-sky-100",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold",
                      isToday && "bg-sky-500 text-white",
                    )}
                  >
                    {c.dayOfMonth}
                  </span>
                  {(notesOnDay.length > 0 || callsOnDay.length > 0) && (
                    <div className="flex items-center gap-1">
                      {callsOnDay.length > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800">
                          📞 {callsOnDay.length}
                        </span>
                      )}
                      {notesOnDay.length > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-800">
                          {notesOnDay.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* First note preview */}
                {notesOnDay.length > 0 && (
                  <div className="mt-1 text-[10px] text-muted-foreground line-clamp-1">
                    {notesOnDay[0].body}
                  </div>
                )}
                {callsOnDay.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-red-700 dark:text-red-300 line-clamp-1 font-semibold">
                    {callsOnDay[0].lead_name}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side panel — selected day notes */}
      {selected && (
        <DayPanel
          date={selected}
          notes={selectedNotes}
          callbacks={selectedCallbacks}
          onClose={() => setSelected(null)}
          onAdded={(note) => setLocalNotes((prev) => [...prev, note])}
          onDeleted={(noteId) =>
            setLocalNotes((prev) => prev.filter((n) => n.id !== noteId))
          }
        />
      )}
    </div>
  );
}

function DayPanel({
  date,
  notes,
  callbacks,
  onClose,
  onAdded,
  onDeleted,
}: {
  date: string;
  notes: CalendarNote[];
  callbacks: CalendarCallback[];
  onClose: () => void;
  onAdded: (n: CalendarNote) => void;
  onDeleted: (id: string) => void;
}) {
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
    <aside className="rounded-2xl border bg-background overflow-hidden flex flex-col max-h-[70vh]">
      <header className="px-4 py-3 border-b flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Detail dňa
          </div>
          <div className="font-bold capitalize">{niceDate}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-muted rounded"
          aria-label="Zavrieť"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.phone} · {c.attempts}× nedvíhal
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Poznámky */}
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
                <li
                  key={n.id}
                  className="rounded-lg border bg-muted/20 px-3 py-2 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {n.body}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeNote(n.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                      aria-label="Zmazať"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Add note composer */}
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
    </aside>
  );
}
