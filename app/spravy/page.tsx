import { redirect } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Search,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { loadNotifications } from "@/lib/notifications";
import { loadRooms } from "@/lib/team-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /spravy — Messenger-style DM inbox.
 *
 * Užívateľ (ktokoľvek) tu vidí zoznam všetkých svojich 1-na-1 konverzácií.
 * Klik na riadok → /dm/[roomId].
 *
 * Prečo samostatná route (nie /agent/team):
 *   Tím chat je v "in build" (užívateľ ho nevidí v navigácii). DM konverzácie
 *   ale FUNGUJÚ cez /dm/[roomId]. Potreboval sa inbox — inak keď kolega
 *   napíše, prijímajúci nemal ako otvoriť konverzáciu.
 */
export default async function SpravyPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const rooms = await loadRooms(me.id);
  // Iba DM roomy — všeobecné projektové roomky sú v /agent/team ("in build")
  const dmRooms = rooms.filter((r) => r.is_dm);

  // Fetch peer info (email + role) — loadRooms vracia iba peer_name
  const peerIds = Array.from(
    new Set(
      dmRooms
        .map((r) => r.peer_id)
        .filter(Boolean) as string[],
    ),
  );
  const peerMap = new Map<
    string,
    { email: string; role: string; avatar_url: string | null }
  >();
  if (peerIds.length > 0) {
    const sb = createAdminClient();
    const { data: peers } = await sb
      .from("users")
      .select("id, email, role, avatar_url")
      .in("id", peerIds);
    for (const p of peers ?? []) {
      peerMap.set(p.id as string, {
        email: (p.email as string) ?? "",
        role: (p.role as string) ?? "user",
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  // Last message body preview — fetch pre všetky DM naraz
  const lastMsgMap = new Map<string, { body: string; created_at: string }>();
  if (dmRooms.length > 0) {
    const sb = createAdminClient();
    for (const r of dmRooms) {
      const { data: msg } = await sb
        .from("team_messages")
        .select("body, created_at")
        .eq("room_id", r.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (msg) {
        lastMsgMap.set(r.id, {
          body: (msg.body as string) ?? "",
          created_at: (msg.created_at as string) ?? "",
        });
      }
    }
  }

  const notifications = await loadNotifications(me.id).catch(() => []);
  const selfPaused = me.capacity === 0;

  return (
    <AppShell user={me} selfPaused={selfPaused} notifications={notifications}>
      <div className="space-y-4 max-w-2xl mx-auto">
        <header>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-sky-500" aria-hidden />
            Správy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tvoje 1-na-1 konverzácie s kolegami. Klik → otvorí sa Messenger.
          </p>
        </header>

        {dmRooms.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed bg-background p-12 text-center">
            <Sparkles className="w-10 h-10 mx-auto text-sky-400 mb-3" />
            <h3 className="text-lg font-bold">Zatiaľ žiadne správy</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Klikni „💬 Napísať" pri mene kolegu (napr. v Obhliadkach, na
              lead karte, v tíme) a začnete si písať. Konverzácia sa
              objaví tu.
            </p>
          </div>
        ) : (
          <ul className="rounded-2xl border-2 bg-white overflow-hidden divide-y">
            {dmRooms.map((r) => {
              const peer = r.peer_id ? peerMap.get(r.peer_id) : null;
              const last = lastMsgMap.get(r.id);
              const peerName = r.peer_name ?? "Kolega";
              const initials = peerName
                .split(" ")
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const timeStr = last?.created_at
                ? formatWhen(last.created_at)
                : r.last_message_at
                  ? formatWhen(r.last_message_at)
                  : "";
              return (
                <li key={r.id}>
                  <Link
                    href={`/dm/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 text-white flex items-center justify-center font-black text-base overflow-hidden">
                      {peer?.avatar_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={peer.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold truncate">
                          {peerName}
                        </span>
                        {peer?.role && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                            {peer.role}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground truncate mt-0.5">
                        {last?.body ?? (
                          <em className="italic opacity-60">
                            (žiadne správy)
                          </em>
                        )}
                      </div>
                    </div>
                    {timeStr && (
                      <div className="text-[11px] font-semibold text-muted-foreground shrink-0">
                        {timeStr}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1.5">
            <UsersIcon className="w-3 h-3" />
            Chceš napísať kolegu s ktorým ešte nemáš konverzáciu?
          </div>
          <p className="text-xs text-muted-foreground">
            Otvor jeho profil (napr. v Obhliadkach — obchodák ktorý ju
            priradil má tam tlačidlo „💬 Napísať") a klikni Napísať.
            Konverzácia sa vytvorí a objaví sa tu.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const dayMs = 24 * 3600 * 1000;
  if (diff < 60 * 1000) return "teraz";
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} min`;
  if (diff < dayMs) return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * dayMs) return d.toLocaleDateString("sk-SK", { weekday: "short" });
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}
