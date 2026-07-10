"use client";

import * as React from "react";
import { Hash, MessageCircle, Plus, Search, Send, Trash2, X } from "lucide-react";

import { createBrowserClient } from "@supabase/ssr";

import { cn } from "@/lib/utils";
import type { ChatMessage, ChatRoom as ChatRoomType } from "@/lib/team-chat";
import { DEFAULT_ROOM_ID } from "@/lib/team-chat";
import { timeAgo } from "@/lib/types/lead";
import {
  sendChatMessageAction,
  searchChatAction,
  deleteChatMessageAction,
} from "./chat-actions";

interface Props {
  meId: string;
  meRole: "admin" | "obchod" | "obhliadky" | "realizacie" | "office" | "skolenie";
  initialRooms: ChatRoomType[];
  initialMessages: ChatMessage[];
}

export function ChatRoom({
  meId,
  meRole,
  initialRooms,
  initialMessages,
}: Props) {
  const [rooms, setRooms] = React.useState<ChatRoomType[]>(initialRooms);
  // Ak URL má ?room=<id>, otvor tú roomku (deep-link z DmButton).
  const initialRoomId = React.useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_ROOM_ID;
    const p = new URLSearchParams(window.location.search).get("room");
    if (p && initialRooms.some((r) => r.id === p)) return p;
    return DEFAULT_ROOM_ID;
  }, [initialRooms]);
  const [activeRoomId, setActiveRoomId] =
    React.useState<string>(initialRoomId);
  const [messages, setMessages] =
    React.useState<ChatMessage[]>(initialMessages);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Create room state
  const [creatingRoom, setCreatingRoom] = React.useState(false);
  const [newRoomTitle, setNewRoomTitle] = React.useState("");
  const [creatingBusy, setCreatingBusy] = React.useState(false);

  // Search
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<
    ChatMessage[] | null
  >(null);
  const [searching, setSearching] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);

  // Mobile sidebar toggle — na mobile je sidebar overlay, klik na roomku
  // ho zavrie a otvorí chat. Na desktope je vždy visible (sm+).
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  // Scroll to bottom on init + when activeRoom changes
  React.useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "instant" as ScrollBehavior,
    });
  }, [activeRoomId, messages.length]);

  // Realtime subscription — listen for messages AND room bumps
  React.useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const channel = sb
      .channel("team-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
        },
        async (payload) => {
          const m = payload.new as {
            id: string;
            user_id: string;
            room_id: string;
            body: string;
            created_at: string;
            edited_at: string | null;
          };

          // Bump rooms order — vytiahni rooms top (najnovšia first)
          setRooms((prev) => {
            const updated = prev.map((r) =>
              r.id === m.room_id
                ? {
                    ...r,
                    last_message_at: m.created_at,
                    message_count: r.message_count + 1,
                  }
                : r,
            );
            return [...updated].sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime(),
            );
          });

          // Append iba ak je správa pre aktívnu room
          if (m.room_id !== activeRoomId) return;

          const { data: u } = await sb
            .from("users")
            .select("name, email, role")
            .eq("id", m.user_id)
            .single();
          if (u) {
            setMessages((prev) => {
              if (prev.some((p) => p.id === m.id)) return prev;
              return [
                ...prev,
                {
                  id: m.id,
                  user_id: m.user_id,
                  room_id: m.room_id,
                  body: m.body,
                  created_at: m.created_at,
                  edited_at: m.edited_at,
                  user_name: u.name,
                  user_email: u.email,
                  user_role: u.role as "admin" | "obchod" | "obhliadky" | "realizacie",
                },
              ];
            });
            setTimeout(() => {
              const el = listRef.current;
              if (!el) return;
              const nearBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 200;
              if (nearBottom) {
                el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              }
            }, 50);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "team_messages",
        },
        (payload) => {
          const m = payload.new as { id: string; deleted_at: string | null };
          if (m.deleted_at) {
            setMessages((prev) => prev.filter((p) => p.id !== m.id));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_rooms",
        },
        async (payload) => {
          const r = payload.new as {
            id: string;
            title: string;
            created_by: string | null;
            created_at: string;
            last_message_at: string;
          };
          // Načítaj meno tvorcu
          let created_by_name: string | null = null;
          if (r.created_by) {
            const { data: u } = await sb
              .from("users")
              .select("name")
              .eq("id", r.created_by)
              .single();
            created_by_name = u?.name ?? null;
          }
          setRooms((prev) => {
            if (prev.some((p) => p.id === r.id)) return prev;
            return [
              {
                id: r.id,
                title: r.title,
                created_by: r.created_by,
                created_by_name,
                created_at: r.created_at,
                last_message_at: r.last_message_at,
                message_count: 0,
              },
              ...prev,
            ];
          });
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [activeRoomId]);

  async function selectRoom(roomId: string) {
    // Zavri mobile sidebar (na desktope nemá efekt)
    setMobileSidebarOpen(false);
    if (roomId === activeRoomId) return;
    setActiveRoomId(roomId);
    setLoadingMessages(true);
    setSearchResults(null);
    setSearchTerm("");
    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { data: rows } = await sb
        .from("team_messages")
        .select("id, user_id, room_id, body, created_at, edited_at")
        .eq("room_id", roomId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!rows) {
        setMessages([]);
        return;
      }
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: users } = userIds.length
        ? await sb
            .from("users")
            .select("id, name, email, role")
            .in("id", userIds)
        : { data: [] };
      const usersMap = new Map((users ?? []).map((u) => [u.id, u]));
      const msgs: ChatMessage[] = rows
        .map((r) => {
          const u = usersMap.get(r.user_id);
          if (!u) return null;
          return {
            id: r.id,
            user_id: r.user_id,
            room_id: r.room_id,
            body: r.body,
            created_at: r.created_at,
            edited_at: r.edited_at,
            user_name: u.name as string,
            user_email: u.email as string,
            user_role: u.role as "admin" | "obchod" | "obhliadky" | "realizacie",
          };
        })
        .filter((m): m is ChatMessage => m !== null)
        .reverse();
      setMessages(msgs);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function createRoom() {
    const title = newRoomTitle.trim();
    if (!title || creatingBusy) return;
    setCreatingBusy(true);
    try {
      const r = await fetch("/api/chat/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!r.ok || !json.ok || !json.id) {
        alert(`Chyba: ${json.error ?? `HTTP ${r.status}`}`);
        return;
      }
      setNewRoomTitle("");
      setCreatingRoom(false);
      // Realtime subscription pridá room — ale aj tak skoč naň
      setTimeout(() => selectRoom(json.id!), 100);
    } finally {
      setCreatingBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const res = await sendChatMessageAction(text, activeRoomId);
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInput("");
    // Realtime subscription append-ne
  }

  async function runSearch(termArg?: string) {
    const term = (termArg ?? searchTerm).trim();
    if (!term) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    // GLOBÁLNY search — cez všetky roomky (nie len aktívnu). Discord-style.
    const res = await searchChatAction(term);
    setSearching(false);
    if (res.ok) setSearchResults(res.results);
  }

  function clearSearch() {
    setSearchTerm("");
    setSearchResults(null);
  }

  async function jumpToResult(msg: ChatMessage) {
    // Ak je správa v inej roomke, najprv tam preskoč
    if (msg.room_id !== activeRoomId) {
      await selectRoom(msg.room_id);
      // Počkaj kým sa messages re-renderujú a potom scroll
      setTimeout(() => doJump(msg.id), 250);
    } else {
      doJump(msg.id);
    }
  }

  function doJump(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      // Možno správa nie je v 100 last loaded — alert
      console.warn("Správa nie je viditeľná (mimo posledných 100)");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    setSearchResults(null);
    setSearchTerm("");
    setTimeout(() => setHighlightId(null), 2500);
  }

  async function handleDelete(messageId: string) {
    if (!confirm("Zmazať túto správu?")) return;
    const res = await deleteChatMessageAction(messageId);
    if (!res.ok) alert(`Chyba: ${res.error}`);
  }

  return (
    <div className="relative flex h-full rounded-2xl border bg-background overflow-hidden">
      {/* Mobile overlay backdrop — klik zavrie sidebar */}
      {mobileSidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {/* ─── LEFT SIDEBAR: rooms list ───
          Desktop: fixed 256px vedla chatu. Mobile: overlay ktorý sa
          otvara cez hamburger button v room header-i, cez klik na roomku
          sa auto-zavrie a otvori chat. */}
      <aside
        className={cn(
          "border-r bg-zinc-50 dark:bg-zinc-900/40 flex flex-col",
          "sm:w-64 sm:shrink-0 sm:relative sm:translate-x-0",
          // Mobile: fixed panel z lava, transition
          "fixed left-0 top-0 bottom-0 w-72 z-40 transition-transform duration-200",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header s + button */}
        <div className="px-3 py-3 border-b">
          <button
            type="button"
            onClick={() => {
              setCreatingRoom((v) => !v);
              setNewRoomTitle("");
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Nová roomka
          </button>
          {creatingRoom && (
            <div className="mt-2 space-y-1.5">
              <input
                type="text"
                autoFocus
                value={newRoomTitle}
                onChange={(e) => setNewRoomTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createRoom();
                  if (e.key === "Escape") {
                    setCreatingRoom(false);
                    setNewRoomTitle("");
                  }
                }}
                maxLength={120}
                placeholder="napr. Poškodená hydroizolácia"
                className="w-full h-8 px-2 rounded border text-sm bg-background"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={!newRoomTitle.trim() || creatingBusy}
                  className="flex-1 h-7 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {creatingBusy ? "Vytváram…" : "Vytvor"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingRoom(false);
                    setNewRoomTitle("");
                  }}
                  className="h-7 px-2 rounded bg-muted text-xs font-bold"
                >
                  Zrušiť
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rooms list */}
        <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {rooms.length === 0 ? (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">
              Žiadne roomky.
            </li>
          ) : (
            (() => {
              // Rozdel na 2 sekcie: Osobné správy (DM) vs. Roomky
              const dms = rooms.filter((r) => r.is_dm);
              const regulars = rooms.filter((r) => !r.is_dm);
              const RoomButton = (r: (typeof rooms)[number]) => {
                const isActive = r.id === activeRoomId;
                const displayName = r.is_dm ? (r.peer_name ?? "Osobná správa") : r.title;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectRoom(r.id)}
                      className={cn(
                        "w-full text-left px-2.5 py-2 rounded-md transition-colors group flex items-start gap-2",
                        isActive
                          ? r.is_dm
                            ? "bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-100"
                            : "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-100"
                          : "hover:bg-muted/70 text-foreground/80",
                      )}
                    >
                      {r.is_dm ? (
                        <MessageCircle
                          className={cn(
                            "w-4 h-4 shrink-0 mt-0.5",
                            isActive ? "text-violet-600" : "text-muted-foreground group-hover:text-foreground",
                          )}
                          aria-hidden
                        />
                      ) : (
                        <Hash
                          className={cn(
                            "w-4 h-4 shrink-0 mt-0.5",
                            isActive ? "text-sky-600" : "text-muted-foreground group-hover:text-foreground",
                          )}
                          aria-hidden
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            "text-sm font-bold truncate leading-tight",
                            isActive && (r.is_dm ? "text-violet-900 dark:text-violet-100" : "text-sky-900 dark:text-sky-100"),
                          )}
                        >
                          {displayName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                          <span>{timeAgo(r.last_message_at)}</span>
                          {r.message_count > 0 && (
                            <>
                              <span>·</span>
                              <span>{r.message_count} msg</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              };
              return (
                <>
                  {regulars.map(RoomButton)}
                  {dms.length > 0 && (
                    <>
                      <li className="mt-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t pt-2">
                        Osobné správy
                      </li>
                      {dms.map(RoomButton)}
                    </>
                  )}
                </>
              );
            })()
          )}
        </ul>
      </aside>

      {/* ─── RIGHT SIDE: active room chat ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Room header — title + search */}
        <div className="border-b bg-zinc-100 dark:bg-zinc-900/60 px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
          {/* Hamburger — iba na mobile, otvára sidebar */}
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="sm:hidden shrink-0 -ml-1 p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Zobraziť roomky"
          >
            <span className="sr-only">Menu</span>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          {activeRoom?.is_dm ? (
            <MessageCircle className="w-4 h-4 text-violet-600 shrink-0" aria-hidden />
          ) : (
            <Hash className="w-4 h-4 text-sky-600 shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm truncate">
              {activeRoom?.is_dm
                ? (activeRoom.peer_name ?? "Osobná správa")
                : (activeRoom?.title ?? "Načítavam…")}
            </div>
            {activeRoom?.created_by_name && (
              <div className="text-[10px] text-muted-foreground">
                vytvoril {activeRoom.created_by_name}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-background border border-zinc-300 dark:border-zinc-700 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30 rounded-md px-2.5 py-1.5 w-[260px] max-w-full transition-colors">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
                if (e.key === "Escape") clearSearch();
              }}
              placeholder="Hľadať vo všetkých roomkách…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/70"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={clearSearch}
                className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Zruš vyhľadávanie"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            ) : (
              <Search
                className="w-4 h-4 text-muted-foreground shrink-0"
                aria-hidden
              />
            )}
          </div>
        </div>

        {/* Search results overlay */}
        {searchResults !== null && (
          <div className="border-b bg-muted/40 max-h-[420px] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-muted/95 backdrop-blur border-b px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm font-bold tracking-tight">
                {searching
                  ? "Hľadám…"
                  : searchResults.length === 0
                    ? `Žiadne výsledky pre „${searchTerm}"`
                    : `${searchResults.length} ${pluralResult(searchResults.length)}`}
              </span>
              <button
                type="button"
                onClick={clearSearch}
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Zavrieť
              </button>
            </div>
            {!searching && searchResults.length > 0 && (
              <ul className="p-2 space-y-2">
                {searchResults.map((m) => {
                  const room = rooms.find((r) => r.id === m.room_id);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => jumpToResult(m)}
                        className="w-full text-left px-3 py-2.5 rounded-lg bg-background border border-border hover:border-sky-400 hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white text-[11px] font-bold shrink-0">
                            {initials(m.user_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground">
                                {m.user_name}
                              </span>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {timeAgo(m.created_at)}
                              </span>
                              {room && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                                  <Hash className="w-2.5 h-2.5" aria-hidden />
                                  {room.title}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-foreground/85 line-clamp-3 leading-snug mt-0.5 break-words">
                              {highlightMatch(m.body, searchTerm)}
                            </div>
                            <div className="text-[10px] text-sky-600 font-bold uppercase tracking-wider mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {room && room.id !== activeRoomId
                                ? `Skoč do #${room.title} →`
                                : "Skoč na správu →"}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {loadingMessages ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              Načítavam správy…
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              <p>Žiadne správy v tejto roomke. Napíš prvý!</p>
            </div>
          ) : (
            messages.map((m, idx) => {
              const prev = messages[idx - 1];
              const sameAuthorAsPrev =
                prev &&
                prev.user_id === m.user_id &&
                new Date(m.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  5 * 60 * 1000;
              const isMe = m.user_id === meId;
              const canDelete = isMe || meRole === "admin";
              return (
                <div
                  key={m.id}
                  id={`msg-${m.id}`}
                  className={cn(
                    "group flex gap-2 px-2 py-1 rounded transition-colors",
                    highlightId === m.id && "bg-amber-100 dark:bg-amber-900/30",
                    !sameAuthorAsPrev && "mt-3",
                  )}
                >
                  {sameAuthorAsPrev ? (
                    <div className="w-9 shrink-0 flex justify-center pt-1">
                      <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
                        {new Intl.DateTimeFormat("sk", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(m.created_at))}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-white text-sm",
                        m.user_role === "admin"
                          ? "bg-sky-600"
                          : "bg-gradient-to-br from-emerald-500 to-emerald-700",
                      )}
                      aria-hidden
                    >
                      {initials(m.user_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {!sameAuthorAsPrev && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="font-bold text-sm">{m.user_name}</span>
                        {m.user_role === "admin" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 px-1 py-0.5 rounded">
                            admin
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {timeAgo(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {m.body}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 self-start text-muted-foreground hover:text-destructive p-1"
                      aria-label="Zmazať správu"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <div className="border-t p-3 bg-muted/20">
          {error && (
            <div className="mb-2 text-xs text-destructive">⚠ {error}</div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={`Napíš správu do #${activeRoom?.title ?? ""}… (Enter = poslať)`}
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none min-h-[40px] max-h-[160px]"
              style={{
                height: Math.min(40 + input.split("\n").length * 20, 160),
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || sending}
              className="h-10 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline text-sm font-semibold">
                {sending ? "Posielam…" : "Pošli"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function pluralResult(n: number): string {
  if (n === 1) return "výsledok";
  if (n >= 2 && n <= 4) return "výsledky";
  return "výsledkov";
}

function highlightMatch(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const lower = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = text.toLowerCase().indexOf(lower, i);
    if (idx === -1) {
      parts.push(<React.Fragment key={key++}>{text.slice(i)}</React.Fragment>);
      break;
    }
    if (idx > i) {
      parts.push(
        <React.Fragment key={key++}>{text.slice(i, idx)}</React.Fragment>,
      );
    }
    parts.push(
      <mark
        key={key++}
        className="bg-amber-300/60 dark:bg-amber-500/40 text-foreground rounded px-0.5 font-semibold"
      >
        {text.slice(idx, idx + term.length)}
      </mark>,
    );
    i = idx + term.length;
  }
  return parts;
}
