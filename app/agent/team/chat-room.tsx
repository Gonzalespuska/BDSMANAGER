"use client";

import * as React from "react";
import { Search, Send, Trash2, X } from "lucide-react";

import { createBrowserClient } from "@supabase/ssr";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/team-chat";
import { timeAgo } from "@/lib/types/lead";
import {
  sendChatMessageAction,
  searchChatAction,
  deleteChatMessageAction,
} from "./chat-actions";

interface Props {
  meId: string;
  meRole: "admin" | "user";
  initialMessages: ChatMessage[];
}

export function ChatRoom({ meId, meRole, initialMessages }: Props) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Search
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<ChatMessage[] | null>(
    null,
  );
  const [searching, setSearching] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);

  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on init + when new msg appears
  React.useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "instant" as ScrollBehavior,
    });
  }, []);

  // Realtime subscription
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
          // Fetch user info for new message
          type Row = {
            id: string;
            user_id: string;
            body: string;
            created_at: string;
            edited_at: string | null;
          };
          const m = payload.new as Row;
          // Avoid duplicates if our own send already appended
          setMessages((prev) => {
            if (prev.some((p) => p.id === m.id)) return prev;
            // Quick user lookup via fetch (could be optimized w/ cache)
            return prev;
          });
          // Lazy-load user details (we don't have them in payload)
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
                  body: m.body,
                  created_at: m.created_at,
                  edited_at: m.edited_at,
                  user_name: u.name,
                  user_email: u.email,
                  user_role: u.role as "admin" | "user",
                },
              ];
            });
            // Scroll if user is near bottom (within 100px)
            setTimeout(() => {
              const el = listRef.current;
              if (!el) return;
              const nearBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 200;
              if (nearBottom) {
                el.scrollTo({
                  top: el.scrollHeight,
                  behavior: "smooth",
                });
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
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const res = await sendChatMessageAction(text);
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInput("");
    // Realtime subscription will append it.
  }

  async function runSearch(termArg?: string) {
    const term = (termArg ?? searchTerm).trim();
    if (!term) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const res = await searchChatAction(term);
    setSearching(false);
    if (res.ok) setSearchResults(res.results);
  }

  function clearSearch() {
    setSearchTerm("");
    setSearchResults(null);
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
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
    // Realtime UPDATE will remove it locally
  }

  return (
    <div className="flex flex-col h-[70vh] rounded-2xl border bg-background overflow-hidden">
      {/* Search bar */}
      <div className="border-b px-3 py-2 flex items-center gap-2 bg-muted/30">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
            if (e.key === "Escape") clearSearch();
          }}
          placeholder="Hľadaj v chatoch… (Enter)"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={clearSearch}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Zruš vyhľadávanie"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Search results overlay */}
      {searchResults !== null && (
        <div className="border-b bg-amber-50 dark:bg-amber-950/30 max-h-64 overflow-y-auto">
          {searching ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Hľadám…
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Žiadne výsledky pre &quot;{searchTerm}&quot;.
            </div>
          ) : (
            <ul>
              {searchResults.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(m.id)}
                    className="w-full text-left px-4 py-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-b last:border-b-0 border-amber-200/50"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">
                        {m.user_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(m.created_at)}
                      </span>
                    </div>
                    <div className="text-sm text-foreground/80 line-clamp-2">
                      {highlightMatch(m.body, searchTerm)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            <p>Žiadne správy. Napíš prvý!</p>
            <p className="text-xs mt-1">
              Tip: použiš tu otázky ku zákazníkom, materiálom, postupy…
            </p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const sameAuthorAsPrev =
              prev &&
              prev.user_id === m.user_id &&
              new Date(m.created_at).getTime() -
                new Date(prev.created_at).getTime() <
                5 * 60 * 1000; // 5 min cluster
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
            placeholder="Napíš správu… (Enter = poslať, Shift+Enter = nový riadok)"
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none min-h-[40px] max-h-[160px]"
            style={{ height: Math.min(40 + input.split("\n").length * 20, 160) }}
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

function highlightMatch(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const re = new RegExp(`(${escapeRegex(term)})`, "ig");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? (
      <mark
        key={i}
        className="bg-amber-300/60 dark:bg-amber-500/40 text-foreground rounded px-0.5"
      >
        {p}
      </mark>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
