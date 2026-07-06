import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  Bell,
  BellRing,
  Calendar as CalendarIcon,
  ClipboardList,
  ExternalLink,
  Info,
  ListChecks,
  Phone,
  Plus,
  Sparkles,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/types/lead";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /notifikacie — celá stránka s notifikáciami + úlohami + remindermi.
 *
 * Sekcie (v tomto poradí):
 *   1. 🔔 Nový reminder — pridaj si osobný self-reminder (čas + text)
 *   2. 📞 Callbacky (iba obchodák) — leady čo nezdvihli, čas na re-call prišiel
 *      → klik otvorí lead v novom tab-e a notifikáciu skryje
 *   3. 📋 Úlohy od admina / obchodáka — pridelené úlohy
 *   4. 🌱 Nové leady — menšia sekcia
 *
 * Archív dokončených úloh je zámerne PREČ — vidí ho iba admin cez detail
 * agenta (`/admin/agents/[id]`), nie sám user.
 */
export default async function NotifikaciePage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const isObchod = user.role === "obchod" || user.role === "admin";
  const isInspector = user.role === "obhliadky";
  const isRealization = user.role === "realizacie";
  const isFieldRole = isInspector || isRealization;

  const notifs = await loadNotifications(user.id);
  const overdue = notifs.filter((n) => n.type === "callback_overdue");
  const due = notifs.filter((n) => n.type === "callback_due");
  const newLeads = notifs.filter((n) => n.type === "new_lead");
  const callbackCount = overdue.length + due.length;

  // Osobný kalendár úloh — office_reminders pre tohto usera (aktívne + budúce)
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const sb = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: tasksRaw } = await sb
    .from("office_reminders")
    .select("id, note, remind_at, remind_date, lead_id, note_kind, created_at")
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("remind_at", { ascending: true, nullsFirst: false })
    .limit(100);
  const tasks = (tasksRaw ?? []).map((t) => {
    const when =
      (t.remind_at as string | null) ??
      ((t.remind_date as string | null) + "T09:00:00Z");
    const whenDate = new Date(when);
    return {
      id: t.id as string,
      note: t.note as string,
      when,
      whenDate,
      leadId: (t.lead_id as string | null) ?? null,
      kind: (t.note_kind as string | null) ?? "general",
      isPast: whenDate.getTime() < Date.now(),
      isToday:
        whenDate.toISOString().slice(0, 10) === nowIso.slice(0, 10),
    };
  });
  // Group by day (yyyy-mm-dd)
  const groupedByDay = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const key = t.whenDate.toISOString().slice(0, 10);
    if (!groupedByDay.has(key)) groupedByDay.set(key, []);
    groupedByDay.get(key)!.push(t);
  }
  const sortedDays = Array.from(groupedByDay.entries()).sort();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Bell className="w-6 h-6 text-sky-500" aria-hidden />
          Notifikácie
          {callbackCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-sm font-bold tabular-nums">
              {callbackCount}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reminders, callbacky, úlohy od admina a obchodáka na jednom mieste.
        </p>
      </header>

      {/* ────────────── 1. NOVÝ REMINDER ────────────── */}
      <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 overflow-hidden">
        <header className="px-4 py-3 border-b bg-amber-100/60 flex items-center gap-2 flex-wrap">
          <BellRing className="w-4 h-4 text-amber-700" aria-hidden />
          <h2 className="font-extrabold text-sm text-amber-900">
            Nový reminder
          </h2>
          <span className="text-[10px] uppercase tracking-widest font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
            🚧 UI kostra — DB zatiaľ neni
          </span>
        </header>
        <div className="p-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
              Poznámka
            </label>
            <input
              type="text"
              placeholder="napr. Vyniesť smeti z dodávky"
              disabled
              className="w-full h-10 rounded-md border border-amber-200 bg-white px-3 text-sm disabled:opacity-70"
            />
          </div>
          <div className="w-[130px]">
            <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
              Kedy
            </label>
            <input
              type="time"
              defaultValue="12:30"
              disabled
              className="w-full h-10 rounded-md border border-amber-200 bg-white px-3 text-sm disabled:opacity-70 tabular-nums"
            />
          </div>
          <button
            type="button"
            disabled
            className="h-10 inline-flex items-center gap-1.5 px-4 rounded-md text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
            title="🚧 čaká na DB migration `user_notes` — viď TODO.md"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Pridať
          </button>
        </div>
        <div className="px-4 py-3 border-t bg-amber-50/60 text-[11px] text-amber-800/90">
          <strong>Ako to bude fungovať:</strong> V zadanom čase (napr. 12:30) ti
          príde notifikácia na zvončeku aj sem. Ostáva zobrazovaná kým ju
          neklikneš „Hotovo". Podobne budeš vedieť aj priradiť úlohu kolegovi.
        </div>
      </section>

      {/* ────────────── 2a. NOVÉ PRIRADENIA (obhliadkár / realizátor) ────────────── */}
      {isFieldRole && (
        <section className="rounded-2xl border-2 bg-background overflow-hidden shadow-sm">
          <header
            className={cn(
              "px-4 py-3 border-b-2 flex items-center gap-2 flex-wrap",
              isInspector
                ? "bg-gradient-to-b from-violet-50/60 to-transparent"
                : "bg-gradient-to-b from-emerald-50/60 to-transparent",
            )}
          >
            {isInspector ? (
              <ClipboardList className="w-4 h-4 text-violet-600" aria-hidden />
            ) : (
              <ClipboardList className="w-4 h-4 text-emerald-600" aria-hidden />
            )}
            <h2 className="font-extrabold text-sm">
              {isInspector
                ? "Nové obhliadky priradené tebe"
                : "Nové realizácie priradené tvojmu tímu"}
            </h2>
            <span
              className={cn(
                "ml-auto text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded",
                isInspector
                  ? "bg-violet-100 text-violet-900"
                  : "bg-emerald-100 text-emerald-900",
              )}
            >
              🚧 čaká na SQL 10_role_handoff
            </span>
          </header>
          <div className="p-4 text-sm space-y-2">
            <p className="text-muted-foreground">
              Sem prídu {isInspector ? "obhliadky" : "realizácie"} priradené
              obchodákom cez kalendár. Napríklad:
            </p>
            <div
              className={cn(
                "rounded-lg border-2 px-3 py-2.5 flex items-center gap-3 opacity-70",
                isInspector
                  ? "border-violet-200 bg-violet-50/50"
                  : "border-emerald-200 bg-emerald-50/50",
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0 text-white",
                  isInspector ? "bg-violet-500" : "bg-emerald-500",
                )}
              >
                {isInspector ? "🔍" : "🔨"}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-sm">
                  Nová {isInspector ? "obhliadka" : "realizácia"} v Košiciach
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Boris Henc · 100 m² · streda 24.7. o 15:00 · poznámka od
                  Ela: „Prístup zo dvora"
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0">
                príklad
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ────────────── 2b. MÔJ KALENDÁR (obhliadkár / realizátor) ────────────── */}
      {isFieldRole && (
        <section className="rounded-2xl border-2 bg-background overflow-hidden shadow-sm">
          <header className="px-4 py-3 border-b-2 bg-gradient-to-b from-sky-50/40 to-transparent flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-sky-600" aria-hidden />
              <h2 className="font-extrabold text-sm">
                Môj kalendár —{" "}
                {isInspector ? "pridelené obhliadky" : "pridelené realizácie"}
              </h2>
            </div>
            <Link
              href="/calendar"
              className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-sky-50"
            >
              Otvoriť plný kalendár →
            </Link>
          </header>
          <div className="p-4 text-sm">
            <p className="text-muted-foreground mb-2">
              Hlavný kalendár slúži obchodákovi na priradenie práce.{" "}
              <strong>Ty tu vidíš iba svoju</strong> —{" "}
              {isInspector
                ? "obhliadky ktoré ti obchodák pridelil"
                : "realizácie pre teba alebo tvoj tím"}
              .
            </p>
            <div className="rounded-lg border bg-muted/20 p-4 text-center text-xs text-muted-foreground italic">
              🚧 Placeholder — real dáta po SQL migrácii 10_role_handoff.
              Zatiaľ klikni „Otvoriť plný kalendár" a uvidíš aj svoje
              priradenia (server-side filter podľa role je hotový).
            </div>
          </div>
        </section>
      )}

      {/* ────────────── 3. CALLBACKY (obchodák — NIE pre obhliadkára/realizátora) ────────────── */}
      {isObchod && (
        <section className="rounded-2xl border-2 bg-background overflow-hidden shadow-sm">
          <header className="px-4 py-3 border-b-2 bg-gradient-to-b from-rose-50/40 to-transparent flex items-center gap-2 flex-wrap">
            <Phone className="w-4 h-4 text-rose-600" aria-hidden />
            <h2 className="font-extrabold text-sm">
              Callbacky
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Leady čo nezdvihli — čakacia doba na re-call prešla
              </span>
            </h2>
            {callbackCount > 0 && (
              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold tabular-nums">
                {callbackCount}
              </span>
            )}
          </header>
          <div className="p-4">
            {callbackCount === 0 ? (
              <EmptyState
                emoji="🌴"
                title="Žiadne otvorené callbacky"
                text="Keď zákazník nezdvihne a čas na re-call prejde, objaví sa tu."
              />
            ) : (
              <ul className="space-y-1.5">
                {[...overdue, ...due].map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "rounded-lg border-2 px-3 py-2.5 flex items-center gap-3 transition-colors group",
                      n.type === "callback_overdue"
                        ? "border-rose-200 bg-rose-50/60 hover:bg-rose-100/60"
                        : "border-amber-200 bg-amber-50/60 hover:bg-amber-100/60",
                    )}
                  >
                    <AlertCircle
                      className={cn(
                        "w-4 h-4 shrink-0",
                        n.type === "callback_overdue"
                          ? "text-rose-600"
                          : "text-amber-600",
                      )}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm truncate">
                        {n.lead_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {n.message}
                        {n.lead_phone && (
                          <span className="ml-2 tabular-nums">
                            · {n.lead_phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {timeAgo(n.when_ts)}
                    </div>
                    {/* Klik otvorí lead v novom tab-e + implicitne dismissne
                        notifikáciu (server-side pri ďalšom load). */}
                    <Link
                      href={`/agent/leads/${n.lead_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-white shadow-sm",
                        n.type === "callback_overdue"
                          ? "bg-rose-600 hover:bg-rose-700"
                          : "bg-amber-600 hover:bg-amber-700",
                      )}
                    >
                      Otvoriť
                      <ExternalLink className="w-3 h-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ────────────── 3. OSOBNÝ KALENDÁR ÚLOH ────────────── */}
      <section className="rounded-2xl border-2 border-violet-200 bg-white overflow-hidden">
        <header className="px-4 py-3 border-b bg-violet-50/60 flex items-center gap-2 flex-wrap">
          <ListChecks className="w-4 h-4 text-violet-700" aria-hidden />
          <h2 className="font-extrabold text-sm text-violet-900">
            📅 Osobný kalendár úloh
          </h2>
          <span className="text-[10px] text-violet-800 italic ml-auto">
            {tasks.length} úloh · najbližšie hore
          </span>
        </header>
        {tasks.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground italic">
            Zatiaľ žiadne úlohy. Ako ti admin alebo obchodák niečo priradí,
            objaví sa tu.
          </div>
        ) : (
          <div className="divide-y">
            {sortedDays.map(([day, dayTasks]) => {
              const dayDate = new Date(day + "T00:00:00");
              const isToday = day === nowIso.slice(0, 10);
              const isPast =
                dayDate.getTime() <
                new Date(nowIso.slice(0, 10) + "T00:00:00").getTime();
              const isTomorrow =
                day ===
                new Date(Date.now() + 86400000).toISOString().slice(0, 10);
              const dayLabel = isToday
                ? "Dnes"
                : isTomorrow
                  ? "Zajtra"
                  : dayDate.toLocaleDateString("sk-SK", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    });
              return (
                <div key={day}>
                  <div
                    className={
                      "px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2 " +
                      (isToday
                        ? "bg-emerald-100 text-emerald-900"
                        : isPast
                          ? "bg-rose-100 text-rose-900"
                          : "bg-slate-100 text-slate-700")
                    }
                  >
                    {isPast && !isToday && "⏰ MEŠKÁ · "}
                    {dayLabel}
                    <span className="ml-auto text-[10px] font-bold opacity-60">
                      {dayTasks.length} úloh
                    </span>
                  </div>
                  <ul className="divide-y">
                    {dayTasks.map((t) => (
                      <li
                        key={t.id}
                        className="px-4 py-3 hover:bg-violet-50/40 flex items-start gap-3"
                      >
                        <div className="text-xs font-black tabular-nums text-slate-500 min-w-[42px] pt-0.5">
                          {t.whenDate.toLocaleTimeString("sk-SK", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-slate-900 leading-snug">
                            {t.note}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px]">
                            <span
                              className={
                                "px-1.5 py-0.5 rounded font-bold uppercase tracking-wider " +
                                (t.kind === "lead_note"
                                  ? "bg-amber-100 text-amber-800"
                                  : t.kind === "callback"
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-slate-100 text-slate-700")
                              }
                            >
                              {t.kind === "lead_note"
                                ? "📝 Poznámka k leadu"
                                : t.kind === "callback"
                                  ? "📞 Callback"
                                  : "📋 Úloha"}
                            </span>
                            {t.leadId && (
                              <a
                                href={`/agent/leads/${t.leadId}`}
                                className="text-sky-700 hover:underline font-bold"
                              >
                                → detail leadu
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ────────────── 4. NOVÉ LEADY (obchod, malá sekcia) ────────────── */}
      {isObchod && (
        <section className="rounded-xl border bg-background overflow-hidden">
          <header className="px-4 py-2.5 border-b bg-emerald-50/40 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" aria-hidden />
            <h2 className="font-bold text-sm">Nové leady</h2>
            <span className="text-[10px] uppercase tracking-widest font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded ml-auto">
              {newLeads.length}
            </span>
          </header>
          <div className="p-3">
            {newLeads.length === 0 ? (
              <div className="text-xs text-muted-foreground italic text-center py-3">
                Zatiaľ žiadne nové leady.
              </div>
            ) : (
              <ul className="space-y-1">
                {newLeads.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/agent/leads/${n.lead_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {n.lead_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {n.message}
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {newLeads.length > 5 && (
              <div className="mt-2 text-center">
                <Link
                  href="/agent"
                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  Zobraziť všetky nové leady ({newLeads.length}) →
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Info card pre budúcnosť */}
      <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-3 text-[11px] text-sky-900">
        <div className="inline-flex items-center gap-1.5 font-bold mb-1">
          <Info className="w-3.5 h-3.5" aria-hidden />
          Archív dokončených úloh je zámerne preč
        </div>
        <p className="text-sky-900/85">
          Zatiaľ ho vidí iba admin pri rozklinku agenta (
          <code>/admin/agents/[id]</code>) — tam je „Aktivita" feed s
          histórou akcií.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function EmptyState({
  emoji,
  title,
  text,
}: {
  emoji: string;
  title: string;
  text: string;
}) {
  return (
    <div className="p-8 text-center text-muted-foreground">
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs mt-1">{text}</div>
    </div>
  );
}
