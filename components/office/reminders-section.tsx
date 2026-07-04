"use client";

import * as React from "react";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Check,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Reminder {
  id: string;
  note: string;
  remind_date: string;
  dismissed_at: string | null;
  created_at: string;
}

/**
 * RemindersSection — office pripomienky ("kalendár").
 *
 * Flow:
 *  1. Office manažérka klikne "Pridať pripomienku" → vyplní dátum + poznámku
 *  2. Do dňa `remind_date` sa nič nezobrazuje
 *  3. Od `remind_date` sa každý deň zobrazuje banner s poznámkou
 *  4. Kým neklikne "Hotovo" (dismissed_at set) — nemizne
 */
export function RemindersSection() {
  const [reminders, setReminders] = React.useState<Reminder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [busyItemId, setBusyItemId] = React.useState<string | null>(null);

  // Add form state
  const [newNote, setNewNote] = React.useState("");
  const [newDate, setNewDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = showAll
        ? "/api/office/reminder?all=1"
        : "/api/office/reminder";
      const r = await fetch(url, { cache: "no-store" });
      const json = (await r.json()) as {
        ok?: boolean;
        error?: string;
        reminders?: Reminder[];
      };
      if (!r.ok || !json.ok) {
        setError(json.error ?? `HTTP ${r.status}`);
        setReminders([]);
      } else {
        setReminders(json.reminders ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  React.useEffect(() => {
    load();
    // Poll každých 60 sec, aby nové pripomienky (z iných tabs) prišli
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !newNote.trim() || !newDate) return;
    setBusy(true);
    try {
      const r = await fetch("/api/office/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim(), remind_date: newDate }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        alert(`Chyba: ${json.error ?? `HTTP ${r.status}`}`);
        return;
      }
      setNewNote("");
      setNewDate(new Date().toISOString().slice(0, 10));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    setBusyItemId(id);
    try {
      const r = await fetch("/api/office/reminder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dismissed: true }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        alert(`Chyba: ${json.error ?? `HTTP ${r.status}`}`);
        return;
      }
      // Optimistic remove
      setReminders((cur) => cur.filter((x) => x.id !== id));
    } finally {
      setBusyItemId(null);
    }
  }

  async function deleteReminder(id: string) {
    if (!confirm("Zmazať pripomienku úplne?")) return;
    setBusyItemId(id);
    try {
      const r = await fetch(`/api/office/reminder?id=${id}`, {
        method: "DELETE",
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        alert(`Chyba: ${json.error ?? `HTTP ${r.status}`}`);
        return;
      }
      setReminders((cur) => cur.filter((x) => x.id !== id));
    } finally {
      setBusyItemId(null);
    }
  }

  // Klasifikuj podľa dátumu
  const today = new Date().toISOString().slice(0, 10);
  const overdue = reminders.filter((r) => r.remind_date < today);
  const dueToday = reminders.filter((r) => r.remind_date === today);
  const future = reminders.filter((r) => r.remind_date > today);
  const dueCount = overdue.length + dueToday.length;

  return (
    <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 overflow-hidden">
      <header className="px-4 py-3 border-b bg-amber-100/70">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-extrabold text-amber-900 inline-flex items-center gap-2 text-lg">
            <AlarmClock className="w-5 h-5" aria-hidden />
            Pripomienky
            {dueCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold shadow">
                <Bell className="w-3 h-3" aria-hidden />
                {dueCount} na dnes
              </span>
            )}
          </h2>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="accent-amber-600"
            />
            Zobraziť aj budúce
          </label>
        </div>
        <p className="text-[11px] text-amber-800/80 mt-1">
          Kalendár pripomienok. Zobrazujú sa každý deň od dátumu — kým
          neklikneš „Hotovo". Ideálne pre follow-upy, splatnosti, objednávky.
        </p>
      </header>

      {/* Add form */}
      <form
        onSubmit={addReminder}
        className="px-4 py-3 border-b bg-background/60 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Poznámka
          </label>
          <Input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="napr. Zavolať Petrovi kvôli faktúre"
            maxLength={500}
            required
          />
        </div>
        <div className="w-[160px]">
          <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Dátum
          </label>
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={busy || !newNote.trim() || !newDate}
          className="bg-amber-600 hover:bg-amber-700 text-white h-10"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
          )}
          Pridať
        </Button>
      </form>

      {/* List */}
      <div className="p-3 space-y-3">
        {loading && (
          <div className="text-center py-6 text-muted-foreground text-sm inline-flex items-center gap-2 justify-center w-full">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            Načítavam…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Chyba: {error}. {error.includes("relation") && (
              <span>
                Ak sa zobrazuje „relation does not exist" — treba spustiť
                <code className="mx-1 px-1 py-0.5 rounded bg-rose-100 text-[10px]">
                  supabase/11_office_reminders.sql
                </code>
                v SQL Editore.
              </span>
            )}
          </div>
        )}

        {!loading && !error && reminders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            🌤️ Žiadne aktívne pripomienky. Ak si nič nenastavila — máš čistý deň.
          </div>
        )}

        {overdue.length > 0 && (
          <ReminderGroup
            title="🔴 Zmeškané"
            tint="rose"
            reminders={overdue}
            busyItemId={busyItemId}
            onDismiss={dismiss}
            onDelete={deleteReminder}
          />
        )}
        {dueToday.length > 0 && (
          <ReminderGroup
            title="⏰ Dnes"
            tint="amber"
            reminders={dueToday}
            busyItemId={busyItemId}
            onDismiss={dismiss}
            onDelete={deleteReminder}
          />
        )}
        {showAll && future.length > 0 && (
          <ReminderGroup
            title="📅 Nadchádzajúce"
            tint="sky"
            reminders={future}
            busyItemId={busyItemId}
            onDismiss={dismiss}
            onDelete={deleteReminder}
          />
        )}
      </div>
    </section>
  );
}

function ReminderGroup({
  title,
  tint,
  reminders,
  busyItemId,
  onDismiss,
  onDelete,
}: {
  title: string;
  tint: "rose" | "amber" | "sky";
  reminders: Reminder[];
  busyItemId: string | null;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tintText = {
    rose: "text-rose-800",
    amber: "text-amber-900",
    sky: "text-sky-800",
  }[tint];
  return (
    <div>
      <h3
        className={cn(
          "text-[10px] uppercase tracking-wider font-extrabold mb-1.5",
          tintText,
        )}
      >
        {title} · {reminders.length}
      </h3>
      <ul className="space-y-1.5">
        {reminders.map((r) => (
          <ReminderRow
            key={r.id}
            reminder={r}
            tint={tint}
            busy={busyItemId === r.id}
            onDismiss={() => onDismiss(r.id)}
            onDelete={() => onDelete(r.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ReminderRow({
  reminder,
  tint,
  busy,
  onDismiss,
  onDelete,
}: {
  reminder: Reminder;
  tint: "rose" | "amber" | "sky";
  busy: boolean;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  const bg = {
    rose: "bg-rose-50 border-rose-200",
    amber: "bg-amber-50 border-amber-200",
    sky: "bg-sky-50 border-sky-200",
  }[tint];
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2 flex items-center gap-3",
        bg,
      )}
    >
      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-background/60 shrink-0">
        <CalendarDays className="w-4 h-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm break-words">{reminder.note}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
          {new Date(reminder.remind_date).toLocaleDateString("sk-SK", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      </div>
      <div className="inline-flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
          title="Označiť ako hotové (zmizne)"
        >
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          ) : (
            <Check className="w-3 h-3" aria-hidden />
          )}
          Hotovo
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-background/70 hover:bg-rose-100 text-muted-foreground hover:text-rose-700 disabled:opacity-50"
          title="Zmazať pripomienku úplne"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}
