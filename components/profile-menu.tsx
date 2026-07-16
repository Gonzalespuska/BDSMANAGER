"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Camera,
  ChevronDown,
  Loader2,
  LogOut,
  Pause,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import type { AppUser, AppUserRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { signOutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";

/**
 * Klikateľný profil pill v headeri.
 *
 * PILL ROLA = REÁLNA ROLA (realRole prop). Aj keď admin používa "View as",
 * profil pill stále ukazuje ADMIN — účet sa nezmenil, iba view.
 *
 * ADMIN NIKDY nevidí PAUZA badge ani status bublinku — admin nedostáva
 * leady, pauzovanie je preň bezvýznamné.
 *
 * Obchodník nevidí paused stav vôbec (spravuje admin).
 */
export function ProfileMenu({
  user,
  realRole,
  selfPaused,
  avatarUrl,
  showPodkladyLink,
}: {
  user: AppUser;
  /** Reálna rola bez view-as override — vždy sa zobrazuje v pill-e. */
  realRole: AppUserRole;
  selfPaused: boolean;
  /** URL na profilovú fotku (z users.avatar_url). */
  avatarUrl?: string | null;
  /** True ak agent už NIE JE nováčik (starší ako 90 dní) — Podklady sa
   *  presunuli z hlavného menu sem do dropdownu. */
  showPodkladyLink?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [currentAvatar, setCurrentAvatar] = React.useState(avatarUrl ?? null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Fotka je väčšia ako 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/user/avatar", { method: "POST", body: fd });
      const json = (await r.json()) as { ok?: boolean; avatar_url?: string; error?: string; hint?: string };
      if (!r.ok || !json.ok) {
        alert(`Chyba: ${json.error ?? "unknown"}${json.hint ? "\n" + json.hint : ""}`);
        return;
      }
      setCurrentAvatar(json.avatar_url ?? null);
      router.refresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAvatarRemove() {
    if (!confirm("Odstrániť profilovú fotku?")) return;
    setUploading(true);
    try {
      const r = await fetch("/api/user/avatar", { method: "DELETE" });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        alert(`Chyba: ${json.error ?? "unknown"}`);
        return;
      }
      setCurrentAvatar(null);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isRealAdmin = realRole === "admin";
  const paused = selfPaused;

  return (
    <div ref={wrapRef} className="relative">
      {/* Desktop pill (full email + role badge) — sm+ */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "hidden sm:inline-flex items-center gap-2.5 rounded-full border bg-muted/60 hover:bg-muted px-4 py-2 transition-colors",
          "text-sm font-medium cursor-pointer",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Profil ${user.name}`}
      >
        <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background relative overflow-hidden">
          {currentAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentAvatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="w-4 h-4" aria-hidden />
          )}
        </div>
        <span className="text-foreground">{user.email}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
            isRealAdmin
              ? "bg-rose-600 text-white shadow-sm"
              : "bg-sky-100 text-sky-700",
          )}
        >
          {isRealAdmin ? (
            <ShieldCheck className="w-3 h-3" aria-hidden />
          ) : (
            <UserIcon className="w-3 h-3" aria-hidden />
          )}
          {ROLE_LABELS[realRole] ?? realRole}
        </span>
        {/* PAUZA badge — admin ju NIKDY nevidí (nedostáva leady). Zvyšné
            role ju vidia iba ak boli reálne pauznuté cez admin panel. */}
        {paused && !isRealAdmin && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
            <Pause className="w-3 h-3" aria-hidden />
            pauza
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* Mobile — kruhový avatar 40×40 s malým role indikátorom.
          Bez desktop pill dropdown na mobile nefungoval (bol schovaný cez
          `hidden`) — používateľ nemal ako odhlásiť sa alebo sa dostať do
          profilu. Klik otvorí ten istý dropdown menu ako desktop. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="sm:hidden relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground text-background overflow-hidden shrink-0"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Profil ${user.name}`}
      >
        {currentAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentAvatar}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <UserIcon className="w-5 h-5" aria-hidden />
        )}
        {/* Role indikátor — malá bodka vpravo dole */}
        <span
          className={cn(
            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
            isRealAdmin ? "bg-rose-500" : "bg-sky-500",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border bg-background shadow-2xl p-1.5 z-50"
        >
          {/* Header s avatar */}
          <div className="px-3 py-3 border-b mb-1 flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-muted border-2 border-input">
                {currentAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentAvatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full inline-flex items-center justify-center text-lg font-bold text-muted-foreground">
                    {initials(user.name || user.email)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-sky-600 hover:bg-sky-700 text-white inline-flex items-center justify-center border-2 border-background shadow disabled:opacity-50"
                title="Zmeniť profilovú fotku"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Camera className="w-3.5 h-3.5" aria-hidden />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarPick}
                className="hidden"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
              {currentAvatar && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={uploading}
                  className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold mt-1 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" aria-hidden />
                  Odstrániť fotku
                </button>
              )}
            </div>
          </div>

          {/* Podklady link — pre veteránov (starší 90 dní od registrácie).
              Predpokladáme že si to už prečítali, ale nechceme im to skrývať
              úplne — presunuli sme to sem z hlavného menu. */}
          {showPodkladyLink && (
            <a
              href="/skolenie"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/30 text-sm font-semibold text-sky-700 dark:text-sky-400 inline-flex items-center gap-2.5 border-b border-slate-200/60 dark:border-slate-700/60 mb-1 pb-2.5"
              role="menuitem"
            >
              <BookOpen className="w-4 h-4" aria-hidden />
              <div className="flex-1">
                <div className="font-bold">Podklady</div>
                <div className="text-[10px] text-muted-foreground font-normal leading-tight mt-0.5">
                  Call scripty, návody, materiály
                </div>
              </div>
            </a>
          )}

          {/* Self-pause / obnoviť príjem — pre role ktoré prijímajú leady.
              User 2026-07-16 (2×): „neni tam ta pause option ze ked sa
              pauznem vsetko prechadza na inych obchodakov alebo
              realizartorov" + „pod ucet ked kliknem na mail tak nech sa
              mi zobrazi moznost pauznut sa bavili sme sa uz o tom".
              Používame user.role (effective, po view-as override) — keď
              admin robí view-as ako obchod, uvidí Pauza option a pauzne
              tú konkrétnu view-as identitu. */}
          {user.role !== "admin" && user.role !== "realizacie" && (
            <button
              type="button"
              onClick={async () => {
                const willPause = !paused;
                if (
                  willPause &&
                  !window.confirm(
                    "Pauznúť príjem nových leadov?\n\n" +
                      "• Prestaneš dostávať nové leady z automatického rozdelenia.\n" +
                      "• Tvoje netknuté leady sa presunú aktívnym kolegom.\n" +
                      "• Kedykoľvek si obnov príjem klikom Obnoviť príjem.",
                  )
                )
                  return;
                try {
                  const r = await fetch("/api/agent/pause", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paused: willPause }),
                  });
                  const j = (await r.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                  };
                  if (!r.ok || !j.ok) {
                    alert(`Chyba: ${j.error ?? "unknown"}`);
                    return;
                  }
                  window.location.reload();
                } catch (e) {
                  alert(
                    `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
                  );
                }
              }}
              className={
                "w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2.5 " +
                (paused
                  ? "hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                  : "hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-400")
              }
              role="menuitem"
            >
              <Pause className="w-4 h-4" aria-hidden />
              {paused ? "▶ Obnoviť príjem leadov" : "⏸ Pauznúť príjem leadov"}
            </button>
          )}

          {/* Sign out */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-semibold text-red-700 dark:text-red-400 inline-flex items-center gap-2.5"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              Odhlásiť
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function initials(s: string): string {
  if (!s) return "?";
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
