"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Pencil, StickyNote, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

async function saveNoteFast(
  leadId: string,
  note: string,
  reminderAt?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/lead/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        note,
        reminder_at: reminderAt ?? null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

/** datetime-local string (yyyy-mm-ddThh:mm) z Date. */
function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Dnes 0:00 (pre min hodnotu date picker-a). */
function todayDateOnly(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Pridá offset (v dňoch) k dnešnému dátumu, vráti yyyy-mm-dd. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface DayOption {
  key: string;
  label: string;
  days: number | "custom";
}
const DAY_OPTIONS: DayOption[] = [
  { key: "today", label: "Dnes", days: 0 },
  { key: "tomorrow", label: "Zajtra", days: 1 },
  { key: "day2", label: "O 2 dni", days: 2 },
  { key: "day3", label: "O 3 dni", days: 3 },
  { key: "week", label: "Za týždeň", days: 7 },
  { key: "custom", label: "Vlastný dátum…", days: "custom" },
];

interface TimeOption {
  key: string;
  label: string;
  hour: number | "custom";
  minute?: number;
}
const TIME_OPTIONS: TimeOption[] = [
  { key: "morning", label: "Ráno (8:00)", hour: 8, minute: 0 },
  { key: "midmorning", label: "Doobeda (10:00)", hour: 10, minute: 0 },
  { key: "noon", label: "Napoludnie (12:00)", hour: 12, minute: 0 },
  { key: "afternoon", label: "Popoludní (15:00)", hour: 15, minute: 0 },
  { key: "evening", label: "Podvečer (18:00)", hour: 18, minute: 0 },
  { key: "custom", label: "Vlastný čas…", hour: "custom" },
];

/**
 * Inline poznámka na lead karte.
 *
 * Zobrazenie:
 *   - Bez poznámky: tlačidlo "+ Pridať poznámku"
 *   - S poznámkou: žltý sticky-note box + pencil ikona na úpravu
 *   - V edit móde: textarea + Save / Cancel
 *
 * Ukladá sa do `lead.data.agent_note` cez server action.
 */
export function LeadNotesInline({
  leadId,
  initialNote,
}: {
  leadId: string;
  initialNote: string;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState(initialNote);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(initialNote);
  // Reminder state — dropdown deň + dropdown čas
  const [reminderEnabled, setReminderEnabled] = React.useState(false);
  const [dayKey, setDayKey] = React.useState<string>("day3"); // default O 3 dni
  const [customDay, setCustomDay] = React.useState<string>(dayOffset(3));
  const [timeKey, setTimeKey] = React.useState<string>("morning"); // default Ráno 8:00
  const [customTime, setCustomTime] = React.useState<string>("09:00");
  const [busy, setBusy] = React.useState(false);

  // Vypočítaj finálny reminder ISO string
  const reminderIso = React.useMemo(() => {
    if (!reminderEnabled) return null;
    const day = DAY_OPTIONS.find((o) => o.key === dayKey);
    const time = TIME_OPTIONS.find((o) => o.key === timeKey);
    if (!day || !time) return null;
    const dateStr = day.days === "custom" ? customDay : dayOffset(day.days);
    const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
    let hour = 8;
    let minute = 0;
    if (time.hour === "custom") {
      const [h, mi] = customTime.split(":").map((x) => parseInt(x, 10));
      hour = h;
      minute = mi;
    } else {
      hour = time.hour;
      minute = time.minute ?? 0;
    }
    const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
    return dt.toISOString();
  }, [reminderEnabled, dayKey, customDay, timeKey, customTime]);

  async function handleSave() {
    setBusy(true);
    const result = await saveNoteFast(leadId, draft, reminderIso);
    if (result.ok) {
      setNote(draft.trim());
      setEditing(false);
      setReminderEnabled(false);
      router.refresh();
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  async function handleDelete() {
    if (!confirm("Naozaj vymazať poznámku?")) return;
    setBusy(true);
    const result = await saveNoteFast(leadId, "");
    if (result.ok) {
      setNote("");
      setDraft("");
      setReminderEnabled(false);
      setEditing(false);
      router.refresh();
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  function handleCancel() {
    setDraft(note);
    setReminderEnabled(false);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-1.5">
          <StickyNote className="w-3 h-3" aria-hidden />
          Poznámka
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={2}
          placeholder="napr. 'zavolat ujovi Petrovi na 12:00'"
          className="w-full px-2 py-1.5 rounded-md border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />

        {/* Reminder — pripomienka do notifikácií */}
        <div className="mt-2 rounded-lg border-2 border-amber-200 bg-white p-3 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              className="w-5 h-5 accent-amber-500"
            />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
              <Bell className="w-4 h-4" aria-hidden />
              Pripomienka
            </span>
          </label>

          {reminderEnabled && (
            <div className="space-y-3 pt-1">
              {/* KEDY — deň */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-800 min-w-[60px]">
                  Kedy
                </label>
                <select
                  value={dayKey}
                  onChange={(e) => setDayKey(e.target.value)}
                  className="text-sm font-bold rounded-lg border-2 border-amber-300 bg-white px-3 py-2 focus:outline-none focus:border-amber-500 min-w-[140px]"
                >
                  {DAY_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {dayKey === "custom" && (
                  <>
                    <input
                      type="date"
                      value={customDay}
                      onChange={(e) => setCustomDay(e.target.value)}
                      min={todayDateOnly()}
                      style={{ accentColor: "#f59e0b" }}
                      className={cn(
                        "text-sm font-bold rounded-lg border-2 px-3 py-2 focus:outline-none focus:border-amber-500 tabular-nums transition-colors",
                        customDay === todayDateOnly()
                          ? "bg-amber-100 border-amber-500 text-amber-900"
                          : "bg-white border-amber-300 text-amber-800",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomDay(todayDateOnly())}
                      className={cn(
                        "text-xs font-bold rounded-md px-2.5 py-1.5 border-2 transition-colors uppercase tracking-wider",
                        customDay === todayDateOnly()
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100",
                      )}
                      title="Nastaviť dnešný dátum"
                    >
                      → Dnes
                    </button>
                  </>
                )}
              </div>

              {/* O KOĽKEJ */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-800 min-w-[60px]">
                  O koľkej
                </label>
                <select
                  value={timeKey}
                  onChange={(e) => setTimeKey(e.target.value)}
                  className="text-sm font-bold rounded-lg border-2 border-amber-300 bg-white px-3 py-2 focus:outline-none focus:border-amber-500 min-w-[180px]"
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {timeKey === "custom" && (
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    step="60"
                    lang="sk-SK"
                    style={{ accentColor: "#f59e0b" }}
                    className="text-lg font-black rounded-lg border-2 border-amber-500 bg-amber-50 text-amber-900 px-3 py-2 focus:outline-none tabular-nums w-32"
                  />
                )}
              </div>

              {/* Súhrn */}
              {reminderIso && (
                <div className="rounded-lg bg-amber-50 border-2 border-amber-200 px-3 py-2 text-sm text-amber-900 font-semibold">
                  🔔 Notifikáciu pošleme{" "}
                  <strong>
                    {new Date(reminderIso).toLocaleString("sk-SK", {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors",
              busy && "opacity-50",
            )}
          >
            <Check className="w-3.5 h-3.5" aria-hidden />
            {busy ? "Ukladám…" : "Uložiť"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            Zrušiť
          </button>
          {note && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-white hover:bg-red-50 border border-red-300 text-red-700 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Vymazať
            </button>
          )}
          <span className="text-[10px] text-amber-700 ml-auto">
            ⌘ + Enter pre uloženie
          </span>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-50 px-2.5 py-1.5 rounded-md transition-colors border border-dashed border-amber-300"
      >
        <StickyNote className="w-3.5 h-3.5" aria-hidden />
        + Pridať poznámku
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 group relative">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-1">
            <StickyNote className="w-3 h-3" aria-hidden />
            Poznámka
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap leading-snug">
            {note}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-200 text-amber-700"
          aria-label="Upraviť poznámku"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
