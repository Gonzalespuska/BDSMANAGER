"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { ArrowLeft, Loader2, Mail, Phone, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPhoneSK } from "@/lib/phone-format";
import { sendChatMessageAction } from "@/app/agent/team/chat-actions";
import type { ChatMessage } from "@/lib/team-chat";

interface Peer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
}

/**
 * Messenger-style single conversation view.
 *
 * Layout:
 *   ┌────────────────────────────────────────────┐
 *   │  ← Späť   [Avatar] Mário Vitáz             │
 *   │            📞 +421 950 890 098  ✉ mail    │
 *   ├────────────────────────────────────────────┤
 *   │                              (dnes)        │
 *   │  [Ahoj, potrebujem info]        14:32     │  ← moje bubbles vpravo
 *   │                                             │
 *   │  Zdravím, aké info?  ✓ 14:35              │  ← peer vľavo
 *   │  ...                                        │
 *   ├────────────────────────────────────────────┤
 *   │  [Napíš správu...]                    →   │  ← input dole (sticky)
 *   └────────────────────────────────────────────┘
 */
export function DmView({
  roomId,
  meId,
  meName,
  peer,
  initialMessages,
  prefill,
}: {
  roomId: string;
  meId: string;
  meName: string;
  peer: Peer;
  initialMessages: ChatMessage[];
  /** Voliteľne pre-fill textarea (z DmButton prefill prop → ?prefill=...). */
  prefill?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  // Pre-fill: user "ked stlacim napise spravu ahoj pisem ti ohladom
  // obhliadky... a potom uz manualne napises nieco".
  const [input, setInput] = React.useState(prefill ?? "");

  // Vyčisti prefill query param aby refresh nezachoval starý draft.
  React.useEffect(() => {
    if (prefill && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("prefill")) {
        url.searchParams.delete("prefill");
        window.history.replaceState(
          {},
          "",
          url.pathname + (url.search ? url.search : ""),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sending, setSending] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-scroll dole na novu spravu
  React.useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Realtime subscription — nove spravy sa objavia bez F5
  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const sb = createBrowserClient(url, key);
    const channel = sb
      .channel(`dm:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const row = payload.new as { id: string; user_id: string; body: string; created_at: string; edited_at: string | null; room_id: string };
          if (row.user_id === meId) return; // moje som už mal optimistic
          // Fetch user info
          const { data: u } = await sb
            .from("users")
            .select("name, email, role")
            .eq("id", row.user_id)
            .maybeSingle();
          setMessages((prev) => [
            ...prev,
            {
              id: row.id,
              user_id: row.user_id,
              room_id: roomId,
              body: row.body,
              created_at: row.created_at,
              edited_at: row.edited_at,
              user_name: (u?.name as string) ?? peer.name,
              user_email: (u?.email as string) ?? peer.email,
              user_role: ((u?.role as string) ?? peer.role) as ChatMessage["user_role"],
            },
          ]);
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [roomId, meId, peer.name, peer.email, peer.role]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    // Optimistic — pridám do zoznamu okamžite
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      user_id: meId,
      room_id: roomId,
      body: text,
      created_at: new Date().toISOString(),
      edited_at: null,
      user_name: meName,
      user_email: "",
      user_role: "obchod",
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    try {
      const res = await sendChatMessageAction(text, roomId);
      if (!res.ok) {
        // Revert
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert(`Chyba: ${res.error}`);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px] rounded-2xl border-2 bg-white shadow-md overflow-hidden">
      {/* HEADER — peer info */}
      <header className="px-4 py-3 border-b bg-gradient-to-b from-sky-50 to-white flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="shrink-0 -ml-1 p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Späť"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 text-white flex items-center justify-center font-black text-lg overflow-hidden">
          {peer.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials(peer.name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base leading-tight truncate">
            {peer.name}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {peer.role}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {peer.phone && (
            <a
              href={`tel:${peer.phone}`}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-colors"
              aria-label={`Volať ${peer.name}`}
              title={formatPhoneSK(peer.phone)}
            >
              <Phone className="w-4 h-4" />
            </a>
          )}
          {peer.email && (
            <a
              href={`mailto:${peer.email}`}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sky-100 hover:bg-sky-200 text-sky-800 transition-colors"
              aria-label={`Email ${peer.email}`}
              title={peer.email}
            >
              <Mail className="w-4 h-4" />
            </a>
          )}
        </div>
      </header>

      {/* MESSAGES */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-gradient-to-b from-slate-50/50 to-white"
      >
        {messages.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Zatiaľ žiadne správy. Napíš prvú — pošleš @{peer.name.split(" ")[0]}.
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.user_id === meId;
          const prevSameSender = i > 0 && messages[i - 1].user_id === m.user_id;
          const timeStr = new Date(m.created_at).toLocaleTimeString("sk-SK", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              key={m.id}
              className={cn(
                "flex",
                mine ? "justify-end" : "justify-start",
                prevSameSender ? "mt-0.5" : "mt-2",
              )}
            >
              <div className={cn("max-w-[75%]", mine ? "text-right" : "text-left")}>
                <div
                  className={cn(
                    "inline-block px-3.5 py-2 rounded-2xl text-sm leading-snug break-words whitespace-pre-wrap shadow-sm",
                    mine
                      ? "bg-sky-500 text-white rounded-br-md"
                      : "bg-white border border-slate-200 text-slate-900 rounded-bl-md",
                  )}
                >
                  {renderMessageBody(m.body, mine, roomId)}
                </div>
                <div
                  className={cn(
                    "text-[10px] mt-0.5 px-1",
                    mine ? "text-slate-500" : "text-slate-500",
                  )}
                >
                  {timeStr}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* INPUT */}
      <div className="border-t bg-white px-3 py-2.5 flex items-end gap-2">
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
          placeholder={`Napíš ${peer.name.split(" ")[0]}ovi...`}
          rows={1}
          className="flex-1 min-h-[40px] max-h-32 resize-none rounded-2xl border-2 border-slate-200 focus:border-sky-500 focus:outline-none px-3.5 py-2 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || sending}
          className={cn(
            "shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all",
            input.trim() && !sending
              ? "bg-sky-500 hover:bg-sky-600 text-white shadow-md active:scale-95"
              : "bg-slate-100 text-slate-400 cursor-not-allowed",
          )}
          aria-label="Poslať"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Link do Tím chat (Team-wide diskusia) */}
      <div className="border-t bg-slate-50 px-3 py-2 text-center">
        <Link
          href="/agent/team"
          className="text-[11px] font-bold text-muted-foreground hover:text-sky-700 uppercase tracking-wider"
        >
          Späť do Tím chat (všeobecné roomky) →
        </Link>
      </div>
    </div>
  );
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

/**
 * Render message body — detect internal path tokens (napr. /realizacie/{uuid},
 * /obhliadky/{uuid}, /agent/leads/{uuid}) a premeň ich na klikateľné Linky.
 * User 2026-07-12: „nech je meno klienta v prvej správe kliknuteľné aby sa
 * druhá strana dostala na lead a mohla sa vrátiť späť."
 * Návrat späť do chatu je stored v ?from=<roomId> na cieli — na detail
 * stránke sa objaví "← Späť do chatu" tlačidlo.
 */
function renderMessageBody(body: string, mine: boolean, roomId: string) {
  // Regex — /realizacie/UUID, /obhliadky/UUID, /agent/leads/UUID.
  // Ak nič nenájdeme, vrátime plain text.
  const pattern =
    /(\/(?:realizacie|obhliadky|agent\/leads)\/[a-f0-9-]{6,})/gi;
  const parts = body.split(pattern);
  if (parts.length === 1) return body;
  const linkClass = mine
    ? "underline underline-offset-2 decoration-2 hover:text-sky-100 font-semibold"
    : "text-sky-700 underline underline-offset-2 decoration-2 hover:text-sky-900 font-semibold";
  return (
    <>
      {parts.map((p, i) => {
        if (pattern.test(p)) {
          pattern.lastIndex = 0;
          const href = `${p}?from=${encodeURIComponent(`/dm/${roomId}`)}`;
          return (
            <Link key={i} href={href} className={linkClass}>
              otvoriť detail →
            </Link>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}
