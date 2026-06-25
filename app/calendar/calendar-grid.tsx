"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Phone,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  addCalendarEventAction,
  addCalendarNoteAction,
  deleteCalendarNoteAction,
  updateCalendarNoteAction,
} from "./actions";

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
      {/* Calendar grid */}
      <div className="rounded-2xl border bg-background overflow-hidden h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 gap-2 flex-wrap">
          <div className="font-bold text-base">
            {MONTHS[monthIdx - 1]} {year}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAddEventOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-foreground text-background hover:bg-foreground/85"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Hovor / Meeting
            </button>
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

        {/* Day cells — flex-1 fills the parent height so cells grow */}
        <div className="grid grid-cols-7 flex-1 auto-rows-fr">
          {cells.map((c, i) => {
            const isToday = c.date === todayStr;
            const notesOnDay = notesByDate.get(c.date) ?? [];
            const callsOnDay = callbacksByDate.get(c.date) ?? [];
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(c.date)}
                className={cn(
                  "relative min-h-[60px] border-r border-b last:border-r-0 px-2 py-1.5 text-left transition-colors group",
                  !c.inMonth && "bg-muted/30 text-muted-foreground/50",
                  c.inMonth && "hover:bg-sky-50 dark:hover:bg-sky-950/30",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold",
                      isToday && "bg-sky-500 text-white",
                    )}
                  >
                    {c.dayOfMonth}
                  </span>
                  <div className="flex flex-col items-end gap-1">
                    {callsOnDay.length > 0 && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800"
                        title={`${callsOnDay.length} pripomienok volania`}
                      >
                        📞 {pluralHovor(callsOnDay.length)}
                      </span>
                    )}
                    {notesOnDay.length > 0 && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800"
                      >
                        {pluralPoznamka(notesOnDay.length)}
                      </span>
                    )}
                  </div>
                </div>
                {notesOnDay.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                    {notesOnDay[0].body}
                  </div>
                )}
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
}: {
  date: string;
  notes: CalendarNote[];
  callbacks: CalendarCallback[];
  onClose: () => void;
  onAdded: (n: CalendarNote) => void;
  onDeleted: (id: string) => void;
}) {
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
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Čas (voliteľný)
              </div>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              />
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
