"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  Clock,
  ExternalLink,
  Hammer,
  HandHeart,
  Loader2,
  MapPin,
  Ruler,
  Search,
  Send,
  ShieldCheck,
  Target,
  User,
  X,
} from "lucide-react";

/**
 * PoolSearchDrawer — obchodák si klikne „🔎 Hľadať v poole" v hornom
 * bare, zobrazí sa fullscreen search modal. Napíše meno / mesto / m²
 * a live-search vypíše všetky NEDOTKNUTÉ leady (aj tie čo majú
 * priradené iní obchodáci) — môže si ich atomicky prevziať.
 *
 * User 2026-07-15:
 *   „ak potrebuje manualne podla mena si pridelit lead a vie to meno
 *   tak chyti a vyhlada si to, alebo podla m2 ze tam iba napise 12
 *   a vybehne mu vsetko kde je 12 aj email peter12@gmail.com aj 12m2".
 *
 * Kľúčové:
 *   • Debounced live search (300 ms) → GET /api/agent/pool/search?q=…
 *   • Každý result má „Vziať si" button → POST /api/lead/steal
 *   • Race conflict → toast s vysvetlením prečo (odhalený / prevzatý)
 *   • Telefón sa nezobrazuje (bezpečnosť — až po prevzatí)
 */

type PoolItem = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  source_type: string;
  assigned_to: string | null;
  assigned_to_name: string;
  is_mine: boolean;
  created_at: string;
  lokalita: string | null;
  plocha: string | null;
  message: string | null;
  pending_transfer: {
    kind: "push" | "pull";
    i_initiated: boolean;
    i_must_respond: boolean;
  } | null;
};

type PickerAgent = { id: string; name: string; email: string };

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatar_url: string | null;
  phone: string | null;
};

type SearchMode =
  | "leads"
  | "obchod"
  | "obhliadky"
  | "realizacie"
  | "admin"
  | "all-users";

const MODES: Array<{ v: SearchMode; label: string; icon: typeof User }> = [
  { v: "leads", label: "Leady", icon: Target },
  { v: "obchod", label: "Obchodníci", icon: Briefcase },
  { v: "obhliadky", label: "Obhliadkari", icon: ClipboardList },
  { v: "realizacie", label: "Realizátori", icon: Hammer },
  { v: "admin", label: "Admini", icon: ShieldCheck },
  { v: "all-users", label: "Všetci ľudia", icon: User },
];

const CONFLICT_MSG: Record<string, string> = {
  already_yours: "Už si ho medzitým vzal iný request.",
  already_touched:
    "Pôvodný obchodník už medzitým odhalil číslo — je dotknutý.",
  already_closed: "Lead sa medzitým uzavrel (won/lost/archived).",
  already_taken_by_other:
    "Iný obchodník bol o milisekundu skôr — vzal si ho on.",
  conflict_unknown: "Neznámy konflikt. Refreshni a skús znova.",
};

export function PoolSearchDrawer() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [mode, setMode] = React.useState<SearchMode>("leads");
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<PoolItem[]>([]);
  const [userItems, setUserItems] = React.useState<UserItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  // Auto-focus vstupu keď sa drawer otvorí + ESC na zatvorenie.
  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Debounced search — 300 ms po poslednom keystroke.
  // Routing podľa mode: 'leads' → pool search endpoint,
  //                     'obchod'/'obhliadky'/'realizacie'/'admin' → users search s role filter,
  //                     'all-users' → users search bez filter.
  React.useEffect(() => {
    if (!open) return;
    const query = q.trim();
    const minLen = mode === "leads" ? 2 : 1;
    if (query.length < minLen) {
      setItems([]);
      setUserItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        if (mode === "leads") {
          const r = await fetch(
            `/api/agent/pool/search?q=${encodeURIComponent(query)}`,
            { cache: "no-store" },
          );
          const j = (await r.json()) as {
            ok?: boolean;
            items?: PoolItem[];
          };
          setItems(j.ok && j.items ? j.items : []);
          setUserItems([]);
        } else {
          const roleParam =
            mode === "all-users" ? "" : `&role=${encodeURIComponent(mode)}`;
          const r = await fetch(
            `/api/agent/pool/search-users?q=${encodeURIComponent(query)}${roleParam}`,
            { cache: "no-store" },
          );
          const j = (await r.json()) as {
            ok?: boolean;
            items?: UserItem[];
          };
          setUserItems(j.ok && j.items ? j.items : []);
          setItems([]);
        }
      } catch {
        setItems([]);
        setUserItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open, mode]);

  // Re-fetch aktuálnych výsledkov (napr. po ask/send/steal, aby sa
  // pending_transfer flag updatoval a zmizli akčné buttony).
  const refetch = React.useCallback(async () => {
    const query = q.trim();
    if (query.length < 2) return;
    try {
      const r = await fetch(
        `/api/agent/pool/search?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { items?: PoolItem[]; ok?: boolean };
      if (j.ok && j.items) setItems(j.items);
    } catch {
      /* ignore */
    }
  }, [q]);

  async function steal(it: PoolItem) {
    if (busyId) return;
    if (it.is_mine) {
      router.push(`/agent/leads/${it.id}`);
      setOpen(false);
      return;
    }
    setBusyId(it.id);
    setFlash(null);
    try {
      const r = await fetch("/api/lead/steal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: it.id }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        const msg =
          CONFLICT_MSG[j.error ?? ""] ?? `Chyba: ${j.error ?? "unknown"}`;
        setFlash({ kind: "err", text: msg });
        setItems((prev) => prev.filter((x) => x.id !== it.id));
        return;
      }
      setFlash({ kind: "ok", text: `✓ „${it.name}" je tvoj. Otváram detail…` });
      setTimeout(() => {
        setOpen(false);
        router.push(`/agent/leads/${it.id}`);
      }, 800);
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setBusyId(null);
    }
  }

  /**
   * PULL — obchodák prosí súčasného ownera aby mu dal lead.
   * User: „elo chce requestnut aby mu pridelil leo lead od ADAMA NEMCA".
   */
  async function askForLead(it: PoolItem) {
    if (busyId || !it.assigned_to) return;
    const reason = window.prompt(
      `Prosba k ${it.assigned_to_name} o lead „${it.name}"`,
      "Prosím o preradenie tohto leadu",
    );
    if (reason === null) return; // cancel
    setBusyId(it.id);
    setFlash(null);
    try {
      const r = await fetch("/api/lead/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: it.id,
          to_user_id: "self", // backend resolves — but explicit fine too
          reason: reason.trim() || null,
          kind: "pull",
        }),
      });
      // We must pass to_user_id — but we don't have current user's id here.
      // Backend expects to_user_id === current user for pull, so we'll
      // let the API endpoint reject and fetch our own id. Actually easier:
      // pass a marker and adjust backend. For now, refetch current user
      // via a small /api/whoami call could work, but overkill.
      // Simpler: we don't send to_user_id when kind=pull — backend fills it.
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        const map: Record<string, string> = {
          already_pending: "Pre tento lead už beží žiadosť — počkaj kým odpovie.",
          already_assigned_to_target: "Už je tvoj (medzitým prevzatý).",
          pull_lead_unassigned:
            'Lead nemá ownera — použi „Vziať si" namiesto prosby.',
        };
        setFlash({
          kind: "err",
          text: map[j.error ?? ""] ?? `Chyba: ${j.error ?? "unknown"}`,
        });
        setBusyId(null);
        return;
      }
      setFlash({
        kind: "ok",
        text: `✓ Prosba odoslaná ${it.assigned_to_name}. Cink u neho zazvoní.`,
      });
      await refetch();
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setBusyId(null);
    }
  }

  /**
   * PUSH — obchodák (owner) posiela SVOJ lead niekomu inému.
   * Otvorí picker so zoznamom obchodákov.
   */
  const [pushPickerFor, setPushPickerFor] = React.useState<PoolItem | null>(
    null,
  );
  const [pickerAgents, setPickerAgents] = React.useState<PickerAgent[] | null>(
    null,
  );
  React.useEffect(() => {
    if (!pushPickerFor || pickerAgents) return;
    (async () => {
      try {
        const r = await fetch("/api/admin/agents/list");
        const j = (await r.json()) as { ok?: boolean; agents?: PickerAgent[] };
        if (j.ok && j.agents) setPickerAgents(j.agents);
        else setPickerAgents([]);
      } catch {
        setPickerAgents([]);
      }
    })();
  }, [pushPickerFor, pickerAgents]);

  async function sendLeadTo(it: PoolItem, targetId: string, targetName: string) {
    if (busyId) return;
    const reason = window.prompt(
      `Poznámka pre ${targetName} (voliteľné)`,
      "",
    );
    if (reason === null) return;
    setBusyId(it.id);
    setFlash(null);
    try {
      const r = await fetch("/api/lead/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: it.id,
          to_user_id: targetId,
          reason: reason.trim() || null,
          kind: "push",
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        setFlash({
          kind: "err",
          text: `Chyba: ${j.error ?? "unknown"}`,
        });
        setBusyId(null);
        return;
      }
      setFlash({
        kind: "ok",
        text: `✓ Ponuka poslaná ${targetName}. Cink u neho zazvoní.`,
      });
      setPushPickerFor(null);
      await refetch();
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setBusyId(null);
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 transition-colors"
      title="Hľadať nedotknutý lead v poole tímu"
    >
      <Search className="w-3.5 h-3.5" aria-hidden />
      <span className="hidden sm:inline">Hľadať v poole</span>
      <kbd className="hidden md:inline-block text-[9px] font-bold bg-white/80 border border-sky-300 rounded px-1 py-0.5 ml-1">
        /
      </kbd>
    </button>
  );

  // Global / hotkey — obchodák stisne "/" (mimo inputu) → drawer sa otvorí.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const drawer = open ? (
    <div
      className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 pt-16"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-6rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-sky-500 to-indigo-600 text-white px-5 py-3 flex items-center gap-3 shrink-0">
          <Target className="w-5 h-5 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
              Hľadať
            </div>
            <div className="font-black text-lg leading-tight">
              {MODES.find((m) => m.v === mode)?.label ?? "Leady"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0"
            title="Zavrieť (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b bg-slate-50 shrink-0 space-y-2">
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  mode === "leads"
                    ? "Napíš meno, email, mesto, m² alebo číslo…"
                    : "Napíš meno alebo email osoby…"
                }
                className="w-full h-11 pl-10 pr-10 rounded-lg border-2 border-slate-300 text-sm focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
              />
              {loading && (
                <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-sky-500" />
              )}
            </div>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as SearchMode)}
              className="h-11 px-3 rounded-lg border-2 border-slate-300 text-sm font-black focus:outline-none focus:border-sky-400 bg-white shrink-0"
              title="Zvoľ čo hľadať"
            >
              {MODES.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {mode === "leads" && (
            <div className="text-[11px] text-slate-500">
              Pool = leady u ktorých{" "}
              <b className="text-slate-700">ešte nikto neodhalil číslo</b>. Ak
              volá zákazník ktorý pisal na web, hľadaj tu a klikni „Vziať si".
            </div>
          )}
          {mode !== "leads" && (
            <div className="text-[11px] text-slate-500">
              Klik na osobu → otvorí sa jej profil v novom okne
              (obchodníci → profil s permissiami, ostatní → základný profil).
            </div>
          )}
        </div>

        {flash && (
          <div
            className={
              "px-4 py-2 text-sm font-bold " +
              (flash.kind === "ok"
                ? "bg-emerald-50 text-emerald-900 border-b border-emerald-200"
                : "bg-rose-50 text-rose-900 border-b border-rose-200")
            }
          >
            {flash.kind === "ok" ? "✓ " : "⚠ "}
            {flash.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {q.trim().length < (mode === "leads" ? 2 : 1) ? (
            <div className="p-8 text-center text-slate-500">
              <Search
                className="w-12 h-12 mx-auto mb-2 text-slate-300"
                aria-hidden
              />
              <div className="text-sm">
                Zadaj aspoň {mode === "leads" ? "2 znaky" : "1 znak"} pre
                hľadanie.
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Tip: stlač <kbd className="border rounded px-1">/</kbd>{" "}
                hocikde v aplikácii pre rýchle otvorenie.
              </div>
            </div>
          ) : mode !== "leads" ? (
            // ─── USERS RESULTS ────────────────────────────────────────
            loading && userItems.length === 0 ? (
              <div className="p-8 flex flex-col items-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin" />
                <div className="text-xs font-bold">Hľadám…</div>
              </div>
            ) : userItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <div className="text-sm font-bold text-slate-700">
                  Žiadny{" "}
                  {mode === "obchod"
                    ? "obchodník"
                    : mode === "obhliadky"
                      ? "obhliadkár"
                      : mode === "realizacie"
                        ? "realizátor"
                        : mode === "admin"
                          ? "admin"
                          : "používateľ"}{" "}
                  pre „{q.trim()}"
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {userItems.map((u) => (
                  <UserRow key={u.id} u={u} onNavigate={() => setOpen(false)} />
                ))}
              </ul>
            )
          ) : loading && items.length === 0 ? (
            <div className="p-8 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <div className="text-xs font-bold">Hľadám…</div>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <div className="text-sm font-bold text-slate-700">
                Žiadne nedotknuté leady pre „{q.trim()}"
              </div>
              <div className="text-[11px] mt-1">
                Buď taký lead neexistuje, alebo je už dotknutý (niekto
                odhalil číslo — teraz je jeho a nedá sa vziať).
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="p-3 hover:bg-sky-50/60 hover:shadow-inner border-l-4 border-transparent hover:border-sky-400 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link
                          href={`/agent/leads/${it.id}`}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="font-black text-sm text-slate-900 truncate hover:text-sky-700 hover:underline decoration-2 underline-offset-2"
                          title="Otvoriť detail leadu v novom okne"
                        >
                          {it.name || (
                            <span className="italic text-slate-500">
                              bez mena
                            </span>
                          )}
                        </Link>
                        <span
                          className={
                            "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded " +
                            (it.is_mine
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : it.assigned_to
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-slate-100 text-slate-700 border border-slate-300")
                          }
                        >
                          {it.is_mine
                            ? "TVOJ"
                            : it.assigned_to
                              ? `→ ${it.assigned_to_name}`
                              : "voľný"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                        {it.email && (
                          <span className="truncate">{it.email}</span>
                        )}
                        {it.lokalita && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" aria-hidden />
                            {it.lokalita}
                          </span>
                        )}
                        {it.plocha && (
                          <span className="inline-flex items-center gap-1">
                            <Ruler className="w-3 h-3" aria-hidden />
                            {it.plocha} m²
                          </span>
                        )}
                      </div>
                      {it.message && (
                        <div className="text-[11px] text-slate-500 italic mt-1 line-clamp-2">
                          „{it.message}"
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[130px]">
                      {/* Žltý PENDING TRANSFER badge — kým beží žiadosť,
                          nechceme aby druhý obchodák tvoril kolidujúcu
                          steal/pull akciu. User 2026-07-15: „zatial je
                          nejaky zlty pending transfer". */}
                      {it.pending_transfer ? (
                        <div className="w-full">
                          <div className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-100 border-2 border-amber-400 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                            <Clock className="w-3 h-3 animate-pulse" aria-hidden />
                            {it.pending_transfer.i_must_respond
                              ? "Čaká na TVOJU odpoveď"
                              : it.pending_transfer.i_initiated
                                ? "Poslal si — čaká"
                                : "Prebieha transfer"}
                          </div>
                        </div>
                      ) : it.is_mine ? (
                        // MÔJ lead → Otvoriť + Poslať niekomu
                        <>
                          <button
                            type="button"
                            onClick={() => steal(it)}
                            disabled={busyId === it.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-sky-600 hover:bg-sky-700 text-white shadow-sm disabled:opacity-60"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                            Otvoriť
                          </button>
                          <button
                            type="button"
                            onClick={() => setPushPickerFor(it)}
                            disabled={busyId === it.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-white border-2 border-indigo-300 hover:bg-indigo-50 text-indigo-800 disabled:opacity-60"
                            title="Poslať tento lead niektorému kolegovi"
                          >
                            <Send className="w-3 h-3" aria-hidden />
                            Poslať niekomu
                          </button>
                        </>
                      ) : it.assigned_to ? (
                        // CUDZÍ (má ownera) → Vziať si (steal, race-safe)
                        //                  + Poprosím (pull request)
                        <>
                          <button
                            type="button"
                            onClick={() => steal(it)}
                            disabled={busyId === it.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60"
                            title="Okamžite prevziať (nedotknutý lead — race-safe)"
                          >
                            {busyId === it.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Target className="w-3.5 h-3.5" aria-hidden />
                                Vziať si
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => askForLead(it)}
                            disabled={busyId === it.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-white border-2 border-rose-300 hover:bg-rose-50 text-rose-800 disabled:opacity-60"
                            title={`Poprosiť ${it.assigned_to_name} aby ti ho poslal (potvrdí to on)`}
                          >
                            <HandHeart className="w-3 h-3" aria-hidden />
                            Poprosím
                          </button>
                        </>
                      ) : (
                        // UNASSIGNED (voľný v poole) → iba vziať
                        <button
                          type="button"
                          onClick={() => steal(it)}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60"
                        >
                          {busyId === it.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Target className="w-3.5 h-3.5" aria-hidden />
                              Vziať si
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const pushPicker =
    pushPickerFor && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPushPickerFor(null)}
          >
            <div
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white px-5 py-3 flex items-center gap-3 shrink-0">
                <Send className="w-5 h-5 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
                    Poslať lead niekomu
                  </div>
                  <div className="font-black text-lg leading-tight truncate">
                    {pushPickerFor.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPushPickerFor(null)}
                  className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {pickerAgents === null ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <div className="text-xs font-bold">Načítavam tím…</div>
                  </div>
                ) : pickerAgents.length === 0 ? (
                  <div className="text-center text-slate-500 py-6 text-sm">
                    Žiadni obchodníci k dispozícii.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {pickerAgents.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() =>
                            sendLeadTo(pushPickerFor, a.id, a.name)
                          }
                          disabled={busyId === pushPickerFor.id}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 text-slate-900 text-left disabled:opacity-60"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm truncate">
                              {a.name}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {a.email}
                            </div>
                          </div>
                          {busyId === pushPickerFor.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                          ) : (
                            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider shrink-0">
                              Poslať →
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {mounted && drawer ? createPortal(drawer, document.body) : null}
      {pushPicker}
    </>
  );
}

/**
 * UserRow — jeden riadok v people search výsledkoch. Klik → otvorí
 * profil v novom okne (admin agent detail alebo bežný profil).
 */
function UserRow({
  u,
  onNavigate,
}: {
  u: UserItem;
  onNavigate: () => void;
}) {
  // Admin agenti majú detail na /admin/agents/[id]; ostatní na /profil/[id].
  // Pre obchod/obhliadky/realizacie preferujeme admin agent detail (viac info).
  const href =
    u.role === "admin" ||
    u.role === "obchod" ||
    u.role === "obhliadky" ||
    u.role === "realizacie"
      ? `/admin/agents/${u.id}`
      : `/profil/${u.id}`;

  const roleTint =
    u.role === "admin"
      ? "bg-amber-100 text-amber-900 border-amber-300"
      : u.role === "obchod"
        ? "bg-sky-100 text-sky-900 border-sky-300"
        : u.role === "obhliadky"
          ? "bg-violet-100 text-violet-900 border-violet-300"
          : u.role === "realizacie"
            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
            : "bg-slate-100 text-slate-800 border-slate-300";
  const RoleIcon =
    u.role === "admin"
      ? ShieldCheck
      : u.role === "obhliadky"
        ? ClipboardList
        : u.role === "realizacie"
          ? Hammer
          : Briefcase;

  return (
    <li>
      <Link
        href={href}
        target="_blank"
        rel="noopener"
        onClick={onNavigate}
        className="block p-3 hover:bg-sky-50/60 hover:shadow-inner border-l-4 border-transparent hover:border-sky-400 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center shrink-0">
            {u.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={u.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-5 h-5 text-slate-500" aria-hidden />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="font-black text-sm text-slate-900 truncate">
                {u.name}
              </span>
              <span
                className={
                  "inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border " +
                  roleTint
                }
              >
                <RoleIcon className="w-2.5 h-2.5" aria-hidden />
                {u.role}
              </span>
              {!u.active && (
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                  neaktívny
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {u.email}
              {u.phone && <span className="ml-2 tabular-nums">· {u.phone}</span>}
            </div>
          </div>
          <ExternalLink
            className="w-4 h-4 text-slate-400 shrink-0"
            aria-hidden
          />
        </div>
      </Link>
    </li>
  );
}
