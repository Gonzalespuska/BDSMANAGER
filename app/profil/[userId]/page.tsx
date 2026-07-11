import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  ClipboardList,
  Hammer,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { loadNotifications } from "@/lib/notifications";
import { formatPhoneSK } from "@/lib/phone-format";
import { DmButton } from "@/components/dm-button";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /profil/[userId] — profil kolegu (obhliadkár, obchodák, realizátor).
 *
 * Použitie: klikneš na meno kolegu kdekoľvek v CRM (napr. "Obhliadkár:
 * Peter Novák" v /obhliadnute karte) → otvorí sa jeho profil.
 * Ukazuje:
 *   • Avatar + meno + rola
 *   • Telefón (klikateľný tel:) — ak je vyplnené v users.phone
 *   • Email (klikateľný mailto:)
 *   • Kedy sa registroval (koľko dní v tíme)
 *   • Aktuálna pracovná záťaž — koľko aktívnych obhliadok / leadov má
 *   • "💬 Napísať" — otvorí messenger DM konverzáciu (/dm/[roomId])
 *
 * Prístup: každý prihlásený user (admin aj bežní členovia tímu).
 */
export default async function ProfilPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const sb = createAdminClient();
  const { data: profile } = await sb
    .from("users")
    .select("id, name, email, role, phone, avatar_url, created_at, active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) notFound();

  const isMe = profile.id === me.id;
  const role = (profile.role as string) ?? "user";
  const roleLabel =
    (ROLE_LABELS as Record<string, string>)[role] ?? role.toUpperCase();

  // Pracovná záťaž — koľko aktívnych priradených úloh
  const [assignedLeads, pendingObhliadok, pendingRealizacii] =
    await Promise.all([
      sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", userId)
        .in("status", [
          "new",
          "phone_revealed",
          "no_answer",
          "scheduled",
          "interested",
          "inspected",
        ]),
      sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("inspection_by", userId)
        .eq("status", "needs_inspection"),
      sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("realization_by", userId)
        .in("status", ["in_realization"]),
    ]);

  const notifications = await loadNotifications(me.id).catch(() => []);
  const selfPaused = me.capacity === 0;

  const createdAt = profile.created_at
    ? new Date(profile.created_at as string)
    : null;
  const daysInTeam = createdAt
    ? Math.floor((Date.now() - createdAt.getTime()) / (24 * 3600 * 1000))
    : null;

  return (
    <AppShell user={me} selfPaused={selfPaused} notifications={notifications}>
      <div className="max-w-2xl mx-auto space-y-4">
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-sky-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Späť
        </Link>

        {/* Header — avatar + meno + rola */}
        <div className="rounded-2xl border-2 bg-white shadow-sm overflow-hidden">
          <div
            className={cn(
              "px-6 py-6 flex items-center gap-4 text-white",
              role === "admin"
                ? "bg-gradient-to-br from-amber-600 to-amber-800"
                : role === "obchod"
                  ? "bg-gradient-to-br from-sky-500 to-sky-700"
                  : role === "obhliadky"
                    ? "bg-gradient-to-br from-violet-500 to-violet-700"
                    : role === "realizacie"
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-700"
                      : "bg-gradient-to-br from-slate-500 to-slate-700",
            )}
          >
            <div className="w-20 h-20 rounded-full bg-white/25 border-4 border-white flex items-center justify-center text-2xl font-black overflow-hidden shrink-0">
              {profile.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={profile.avatar_url as string}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                initials(profile.name as string)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xl md:text-3xl font-black leading-tight truncate">
                {profile.name}
                {isMe && (
                  <span className="text-[11px] font-bold uppercase tracking-wider bg-white/25 border border-white/30 px-2 py-0.5 rounded ml-2 align-middle">
                    ty
                  </span>
                )}
              </div>
              <div className="text-sm font-bold uppercase tracking-widest opacity-90 mt-1 inline-flex items-center gap-1.5">
                {role === "admin" ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : role === "obhliadky" ? (
                  <ClipboardList className="w-4 h-4" />
                ) : role === "realizacie" ? (
                  <Hammer className="w-4 h-4" />
                ) : (
                  <Briefcase className="w-4 h-4" />
                )}
                {roleLabel}
              </div>
              {daysInTeam !== null && (
                <div className="text-xs opacity-80 mt-1">
                  V tíme{" "}
                  {daysInTeam === 0
                    ? "od dnes"
                    : daysInTeam === 1
                      ? "1 deň"
                      : daysInTeam < 5
                        ? `${daysInTeam} dni`
                        : daysInTeam < 30
                          ? `${daysInTeam} dní`
                          : daysInTeam < 365
                            ? `${Math.floor(daysInTeam / 30)} mesiacov`
                            : `${Math.floor(daysInTeam / 365)} rokov`}
                </div>
              )}
            </div>
          </div>

          {/* Kontakt + akcie */}
          <div className="px-6 py-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.phone ? (
                <a
                  href={`tel:${profile.phone}`}
                  className="flex items-center gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 px-4 py-3 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      Telefón
                    </div>
                    <div className="font-black text-emerald-900 tabular-nums">
                      {formatPhoneSK(profile.phone as string)}
                    </div>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-3 text-muted-foreground">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div className="text-xs italic">
                    Telefón nie je vyplnený
                    {isMe && " (dopíš v profile menu)"}
                  </div>
                </div>
              )}
              <a
                href={`mailto:${profile.email}`}
                className="flex items-center gap-3 rounded-xl border-2 border-sky-200 bg-sky-50 hover:bg-sky-100 hover:border-sky-400 px-4 py-3 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                    Email
                  </div>
                  <div className="font-bold text-sky-900 text-sm truncate">
                    {profile.email}
                  </div>
                </div>
              </a>
            </div>

            {/* CTA — Napísať (DM Messenger) */}
            {!isMe && (
              <div className="pt-3 border-t">
                <DmButton
                  peerId={profile.id as string}
                  peerName={profile.name as string}
                  className="!text-base !px-5 !py-3 w-full !justify-center"
                />
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Otvorí Messenger konverzáciu.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pracovná záťaž */}
        <div className="rounded-2xl border-2 bg-white shadow-sm p-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">
            Aktuálna záťaž
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <WorkloadCell
              label="Priradené leady"
              count={assignedLeads.count ?? 0}
              tone="sky"
            />
            <WorkloadCell
              label="Čakajúce obhliadky"
              count={pendingObhliadok.count ?? 0}
              tone="violet"
            />
            <WorkloadCell
              label="Realizácie v behu"
              count={pendingRealizacii.count ?? 0}
              tone="emerald"
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function WorkloadCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "sky" | "violet" | "emerald";
}) {
  const cls = {
    sky: "bg-sky-50 text-sky-800 border-sky-200",
    violet: "bg-violet-50 text-violet-800 border-violet-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 text-center",
        cls,
      )}
    >
      <div className="text-3xl font-black tabular-nums">{count}</div>
      <div className="text-[10px] font-black uppercase tracking-wider mt-1">
        {label}
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
