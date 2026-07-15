import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Hammer,
  MapPin,
  Phone,
  Ruler,
  Calendar,
  CheckCircle2,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneSK } from "@/lib/phone-format";
import type { Lead } from "@/lib/types/lead";

import { MarkDoneButton } from "./mark-done-button";
import { DmButton } from "@/components/dm-button";
import {
  getZodpovednostMinEur,
  isEligibleForResponsibility,
} from "@/lib/data/app-settings";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function RealizaciaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Univerzálny back-link — akceptujeme len INTERNÉ paths ("/…" ale nie "//").
  // User 2026-07-12: „chcem aby ma to vratilo tam kade som siel — vsade
  // cez stranku".
  const fromRaw = sp.from ?? null;
  const backHref =
    fromRaw && fromRaw.startsWith("/") && !fromRaw.startsWith("//") && fromRaw.length < 500
      ? fromRaw
      : null;
  const backLabel = backHref?.startsWith("/dm/")
    ? "💬 Späť do chatu"
    : backHref?.startsWith("/admin/agents/")
      ? "Späť na profil obchodáka"
      : backHref?.startsWith("/admin")
        ? "Späť do Adminu"
        : backHref
          ? "Späť"
          : null;
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  if (user.role !== "realizacie" && user.role !== "admin" && user.role !== "obchod") {
    redirect("/agent");
  }

  const sb = createAdminClient();
  const { data: lead } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();
  const l = lead as Lead & {
    realization_by?: string | null;
    realization_at?: string | null;
    realization_completed_at?: string | null;
    assigned_to?: string | null;
  };

  // Ownership: realizator ktorému bola priradená, obchodník ktorý zákazku vlastní, alebo admin
  const canAccess =
    user.role === "admin" ||
    l.realization_by === user.id ||
    l.assigned_to === user.id;
  if (!canAccess) redirect("/realizacie");

  // Média fetch presunutý do Kontent modulu (IN BUILD).

  // Assigned user info
  const userIds = [l.assigned_to, l.realization_by].filter(Boolean) as string[];
  const { data: users } = userIds.length
    ? await sb.from("users").select("id, name, email, phone").in("id", userIds)
    : { data: [] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  const salesUser = l.assigned_to ? userMap.get(l.assigned_to) : null;
  const realizator = l.realization_by ? userMap.get(l.realization_by) : null;

  const data = (l.data ?? {}) as Record<string, string | undefined>;
  const isCompleted = l.status === "won" && !!l.realization_completed_at;

  // Zodpovednosť papier len ak hodnota zákazky prekročí admin threshold.
  const zodpovednostMinEur = await getZodpovednostMinEur();
  const showZodpovednost = isEligibleForResponsibility(
    l.value_estimate,
    zodpovednostMinEur,
  );
  const isRealizator = user.role === "realizacie" && l.realization_by === user.id;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Link
            href="/realizacie"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-emerald-700 px-2 py-1 rounded-md hover:bg-emerald-50/60 transition-colors w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            Späť na Realizácie
          </Link>
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors w-fit"
            >
              {backLabel}
            </Link>
          )}
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {l.name}
            </h1>
            {/* User 2026-07-12: „termin realizacie nech je vedla mena velkym
                je to asi najdolezitejsia vec" — presunuté z malého sales-info
                riadku sem, veľkým fontom. Aktívna realizácia hlavička dole prec. */}
            {l.realization_at && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-xl border-2 border-sky-300 bg-sky-50 px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-sky-700">
                  Termín realizácie
                </span>
                <span className="text-lg md:text-xl font-black tabular-nums text-sky-900">
                  {(() => {
                    // CF Workers edge nemá full ICU s timeZone option — musíme
                    // manuálne posunúť UTC → SK (+2h leto). BUG FIX 2026-07-11.
                    const at = new Date(l.realization_at);
                    const sk = new Date(at.getTime() + 2 * 3600 * 1000);
                    const dd = String(sk.getUTCDate()).padStart(2, "0");
                    const mm = String(sk.getUTCMonth() + 1).padStart(2, "0");
                    const yyyy = sk.getUTCFullYear();
                    const hh = String(sk.getUTCHours()).padStart(2, "0");
                    const mi = String(sk.getUTCMinutes()).padStart(2, "0");
                    return `${dd}.${mm}.${yyyy} · ${hh}:${mi}`;
                  })()}
                </span>
              </div>
            )}
            {isCompleted && (
              <p className="text-sm text-emerald-700 font-bold mt-2">
                ✅ Realizácia dokončená
              </p>
            )}
          </div>
          {l.value_estimate != null && (
            <div className="rounded-xl bg-emerald-50 border-2 border-emerald-200 px-4 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">
                Hodnota zákazky
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-emerald-700">
                {l.value_estimate.toLocaleString("sk-SK")} €
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Info karty */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <InfoCard icon={<MapPin className="w-4 h-4" />} label="Lokalita" value={data.lokalita ?? "—"} />
        <InfoCard icon={<Ruler className="w-4 h-4" />} label="Plocha" value={data.plocha ? `${data.plocha} m²` : "—"} />
        <InfoCard icon={<Hammer className="w-4 h-4" />} label="Typ podlahy" value={data.typ_podlahy ?? "—"} />
        <InfoCard icon={<Phone className="w-4 h-4" />} label="Telefón" value={l.phone ? formatPhoneSK(l.phone) : "—"} link={l.phone ? `tel:${l.phone}` : undefined} />
        <InfoCard icon={<Calendar className="w-4 h-4" />} label="Priestor" value={data.priestor ?? "—"} />
        {/* User 2026-07-12: „Termín (želaný) blbost, termín je hore pod menom" */}
      </div>

      {/* Message od zákazníka */}
      {data.message && (
        <div className="rounded-xl border bg-background p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Poznámka zákazníka
          </div>
          <p className="text-sm whitespace-pre-wrap">{data.message}</p>
        </div>
      )}

      {/* Handover poznámka od obchodáka (pri poslaní na realizáciu). */}
      {typeof data.handover_note === "string" && data.handover_note && (
        <div className="rounded-xl border-2 border-sky-300 bg-sky-50/50 p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-800 mb-1 inline-flex items-center gap-2">
            📝 Poznámka od obchodáka (pri poslaní na realizáciu)
          </div>
          <p className="text-sm text-sky-900 whitespace-pre-wrap font-semibold">
            {data.handover_note}
          </p>
        </div>
      )}

      {/* Priradenie — kontakt na obchodáka (majiteľa zákazky). Realizátora
          nezobrazujeme (vidí sám seba). Ak sa realizátor potrebuje niečo
          spýtať obchodáka, klik 💬 Napísať otvorí DM chat rovnako ako
          na /obhliadky/[id]. */}
      {salesUser && salesUser.id !== user.id && (
        <div className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700 mb-2">
            Obchodník ktorý ti pridelil zákazku
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-black text-base">{salesUser.name}</div>
            {salesUser.phone && (
              <a
                href={`tel:${salesUser.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-3 py-1.5 text-xs font-bold transition-colors"
              >
                <Phone className="w-3.5 h-3.5" aria-hidden />
                {formatPhoneSK(salesUser.phone as string)}
              </a>
            )}
            <DmButton
              peerId={salesUser.id}
              peerName={salesUser.name}
              prefill={`Ahoj ${salesUser.name.split(" ")[0]}, píšem ti ohľadom realizácie u klienta „${l.name}" → /realizacie/${id} `}
            />
          </div>
          {salesUser.email && (
            <div className="text-xs text-muted-foreground mt-1.5">
              📧 {salesUser.email}
            </div>
          )}
          {/* Termín realizácie presunutý do hlavičky (vedľa mena, big font). */}
        </div>
      )}

      {/* User 2026-07-12: „ked som v detaile tak tie buttons musia vyzerat
          rovnako aj robit to iste" — buttonový rad zhodný s listom
          (/realizacie), navigácia na /plan?view=X, Kontent v IN BUILD stave.
          ExecutionWizard interaktívny flow presunutý do plan viewov. */}
      {!isCompleted && (
        <div
          className={`grid grid-cols-1 sm:grid-cols-${showZodpovednost ? "4" : "3"} gap-2`}
        >
          <Link
            href={`/realizacie/${id}/plan?view=sklad`}
            draggable={false}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm no-drag"
          >
            <span>📦</span>
            Inventúra
          </Link>
          <Link
            href={`/realizacie/${id}/plan?view=postup`}
            draggable={false}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm no-drag"
          >
            <span>🔨</span>
            Postup
          </Link>
          {showZodpovednost && (
            <Link
              href={`/realizacie/${id}/plan?view=zodpovednost`}
              draggable={false}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-3 text-sm md:text-base font-black transition-colors shadow-sm no-drag"
            >
              <span>✍️</span>
              Zodpovednosť
            </Link>
          )}
          <div
            title="Kontent modul je vo výstavbe — dokončíme po mobil optimalizácii"
            aria-disabled="true"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 text-slate-500 px-3 py-3 text-sm md:text-base font-black shadow-sm no-drag cursor-not-allowed"
          >
            <span className="opacity-60">📱</span>
            <span className="opacity-60">Kontent</span>
            <span className="ml-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
              🚧 In build
            </span>
          </div>
        </div>
      )}

      {/* Media upload + galéria — presunuté do Kontent modulu (IN BUILD).
          User 2026-07-12: „nahrat foto/video z realizacie prec, aj Zatial
          ziadne fotky ani videa prec — patri to do Kontent". */}

      {/* Mark as done — iba realizator */}
      {isRealizator && !isCompleted && (
        <MarkDoneButton leadId={id} />
      )}

      {isCompleted && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" aria-hidden />
          <div className="font-bold text-emerald-900">Realizácia dokončená</div>
          <div className="text-xs text-emerald-800 mt-0.5">
            {(() => {
              const d = new Date(l.realization_completed_at as string);
              const skMs = d.getTime() + 2 * 3600 * 1000;
              const sk = new Date(skMs);
              const dd = String(sk.getUTCDate()).padStart(2, "0");
              const mm = String(sk.getUTCMonth() + 1).padStart(2, "0");
              const yyyy = sk.getUTCFullYear();
              const hh = String(sk.getUTCHours()).padStart(2, "0");
              const mi = String(sk.getUTCMinutes()).padStart(2, "0");
              return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  link,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  link?: string;
}) {
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="font-bold text-sm mt-0.5">{value}</div>
    </>
  );
  return link ? (
    <a href={link} className="rounded-xl border bg-background p-3 hover:bg-muted/60 transition-colors block">
      {inner}
    </a>
  ) : (
    <div className="rounded-xl border bg-background p-3">{inner}</div>
  );
}
