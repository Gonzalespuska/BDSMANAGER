"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  Users as UsersIcon,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/roles";
import { toast } from "@/components/ui/toast";

export type Colleague = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
};

export type DmRoom = {
  id: string;
  peer_id: string;
  peer_name: string;
  peer_role: string;
  peer_avatar_url: string | null;
  last_body: string | null;
  last_ts: string | null;
};

export type GroupRoom = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  member_count: number;
  last_body: string | null;
  last_ts: string | null;
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const dayMs = 24 * 3600 * 1000;
  if (diff < 60 * 1000) return "teraz";
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} min`;
  if (diff < dayMs)
    return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * dayMs)
    return d.toLocaleDateString("sk-SK", { weekday: "short" });
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}

export function SpravyClient({
  colleagues,
  dmRooms,
  groupRooms,
}: {
  colleagues: Colleague[];
  dmRooms: DmRoom[];
  groupRooms: GroupRoom[];
}) {
  const [query, setQuery] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");
  const [startingDm, setStartingDm] = React.useState<string | null>(null);

  const q = stripDiacritics(query.trim());

  // Filter conversations by search
  const filteredDms = React.useMemo(() => {
    if (!q) return dmRooms;
    return dmRooms.filter((r) => {
      const n = stripDiacritics(r.peer_name);
      const b = r.last_body ? stripDiacritics(r.last_body) : "";
      return n.includes(q) || b.includes(q);
    });
  }, [dmRooms, q]);

  const filteredGroups = React.useMemo(() => {
    if (!q) return groupRooms;
    return groupRooms.filter((g) =>
      stripDiacritics(g.title).includes(q) ||
      stripDiacritics(g.description).includes(q),
    );
  }, [groupRooms, q]);

  // Filter picker
  const pq = stripDiacritics(pickerQuery.trim());
  const filteredColleagues = React.useMemo(() => {
    if (!pq) return colleagues;
    return colleagues.filter((c) => {
      const n = stripDiacritics(c.name);
      const e = stripDiacritics(c.email);
      const r = stripDiacritics(c.role);
      return n.includes(pq) || e.includes(pq) || r.includes(pq);
    });
  }, [colleagues, pq]);

  async function startDm(peer: Colleague) {
    if (startingDm) return;
    setStartingDm(peer.id);
    try {
      const res = await fetch("/api/chat/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_id: peer.id }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        room_id?: string;
        is_new?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.room_id) {
        toast.error(`Chyba: ${json.error ?? `HTTP ${res.status}`}`);
        setStartingDm(null);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.href = `/dm/${json.room_id}`;
      }
    } catch (e) {
      toast.error(`Chyba siete: ${e instanceof Error ? e.message : "unknown"}`);
      setStartingDm(null);
    }
  }

  // ESC zatvorí picker
  React.useEffect(() => {
    if (!pickerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  return (
    <div className="space-y-3">
      {/* SEARCH + PLUS */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hľadaj v konverzáciách…"
            className="w-full pl-10 pr-3 py-2.5 rounded-full border-2 border-slate-200 bg-white text-sm font-medium focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 text-sm font-black shadow-md shadow-sky-500/30 transition-colors"
          title="Napísať kolegovi"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nová</span>
        </button>
      </div>

      {/* GROUPS SECTION */}
      {filteredGroups.length > 0 && (
        <section>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 px-1 inline-flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            Skupiny
          </div>
          <ul className="rounded-2xl border-2 bg-white overflow-hidden divide-y">
            {filteredGroups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/agent/team?room=${g.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center text-xl shadow-sm">
                    {g.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold truncate">{g.title}</span>
                      <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                        {g.member_count} členov
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">
                      {g.last_body ?? (
                        <em className="italic opacity-60">
                          {g.description}
                        </em>
                      )}
                    </div>
                  </div>
                  {g.last_ts && (
                    <div className="text-[11px] font-semibold text-muted-foreground shrink-0">
                      {formatWhen(g.last_ts)}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* DMS SECTION */}
      <section>
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 px-1 inline-flex items-center gap-1.5">
          <MessageCircle className="w-3 h-3" />
          Konverzácie
        </div>
        {filteredDms.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed bg-white p-10 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-sky-400 mb-2" />
            <h3 className="text-sm font-bold">
              {query
                ? "Žiadny výsledok"
                : "Zatiaľ žiadne konverzácie"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              {query
                ? "Skús iné meno alebo text správy."
                : "Klik na + hore napíš prvému kolegovi."}
            </p>
          </div>
        ) : (
          <ul className="rounded-2xl border-2 bg-white overflow-hidden divide-y">
            {filteredDms.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dm/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 text-white flex items-center justify-center font-black text-base overflow-hidden">
                    {r.peer_avatar_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.peer_avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials(r.peer_name)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold truncate">
                        {r.peer_name}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                        {(ROLE_LABELS as Record<string, string>)[r.peer_role] ??
                          r.peer_role}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">
                      {r.last_body ?? (
                        <em className="italic opacity-60">
                          (bez správ)
                        </em>
                      )}
                    </div>
                  </div>
                  {r.last_ts && (
                    <div className="text-[11px] font-semibold text-muted-foreground shrink-0">
                      {formatWhen(r.last_ts)}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PICKER MODAL — "Nová konverzácia" */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-lg leading-tight">
                  Nová konverzácia
                </div>
                <div className="text-xs text-muted-foreground">
                  Vyber kolegu — vytvorí sa DM konverzácia.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="shrink-0 w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
                aria-label="Zavrieť"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Search */}
            <div className="px-5 py-3 border-b">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  aria-hidden
                />
                <input
                  type="text"
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Meno, email alebo rola…"
                  className="w-full pl-10 pr-3 py-2.5 rounded-full border-2 border-slate-200 bg-white text-sm font-medium focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
            {/* List */}
            <ul className="max-h-96 overflow-y-auto divide-y">
              {filteredColleagues.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nikto sa nezhoduje s „{pickerQuery}".
                </li>
              ) : (
                filteredColleagues.map((c) => {
                  const busy = startingDm === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => startDm(c)}
                        disabled={!!startingDm}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3 hover:bg-sky-50/60 transition-colors text-left disabled:opacity-50",
                          busy && "bg-sky-100",
                        )}
                      >
                        <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 text-white flex items-center justify-center font-black text-sm overflow-hidden">
                          {c.avatar_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={c.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            initials(c.name)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black truncate">
                              {c.name}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                              {(ROLE_LABELS as Record<string, string>)[c.role] ??
                                c.role}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.email}
                          </div>
                        </div>
                        {busy ? (
                          <span className="text-xs font-semibold text-sky-700">
                            Otváram…
                          </span>
                        ) : (
                          <MessageCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
