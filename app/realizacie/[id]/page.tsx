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

import { MediaUpload } from "./media-upload";
import { MediaGallery } from "./media-gallery";
import { MarkDoneButton } from "./mark-done-button";
import { ExecutionWizard } from "./execution-wizard";
import { DmButton } from "@/components/dm-button";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function RealizaciaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // Média
  const { data: mediaRaw } = await sb
    .from("realization_media")
    .select("id, storage_path, file_type, original_filename, caption, uploaded_at, uploaded_by")
    .eq("lead_id", id)
    .order("uploaded_at", { ascending: false });
  const media = mediaRaw ?? [];

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
  const isRealizator = user.role === "realizacie" && l.realization_by === user.id;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/realizacie"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-emerald-700 mb-3 px-2 py-1 rounded-md hover:bg-emerald-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Realizácie
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
              <Hammer className="w-6 h-6 text-emerald-500" aria-hidden />
              {l.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isCompleted ? "✅ Realizácia dokončená" : "🔨 Aktívna realizácia"}
            </p>
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
        <InfoCard icon={<CheckCircle2 className="w-4 h-4" />} label="Termín (želaný)" value={data.termin ?? "—"} />
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
              prefill={`Ahoj ${salesUser.name.split(" ")[0]}, píšem ti ohľadom realizácie u klienta „${l.name}". `}
            />
          </div>
          {salesUser.email && (
            <div className="text-xs text-muted-foreground mt-1.5">
              📧 {salesUser.email}
            </div>
          )}
          {l.realization_at && (
            <div className="text-[11px] text-sky-800 mt-2 font-semibold">
              🔨 Termín realizácie:{" "}
              {new Date(l.realization_at).toLocaleString("sk-SK", {
                timeZone: "Europe/Bratislava",
              })}
            </div>
          )}
        </div>
      )}

      {/* Realizačný wizard — Zodpovednosť · Inventúra · Odovzdanie
          (interaktívny inline flow so podpismi + auto-výpočet materiálu).
          Statické PDF plány sú dostupné na /realizacie/[id]/plan?view=... */}
      {(user.role === "realizacie" || user.role === "admin") && !isCompleted && (
        <ExecutionWizard
          leadId={id}
          m2={parseFloat(data.plocha ?? "0") || 0}
          typPodlahy={data.typ_podlahy ?? null}
          priestor={data.priestor ?? null}
          team={await (async () => {
            const { data: teamRows } = await sb
              .from("users")
              .select("id, name")
              .eq("role", "realizacie")
              .eq("active", true)
              .order("name");
            return (teamRows ?? []).map((u) => ({
              id: u.id as string,
              name: u.name as string,
            }));
          })()}
          meId={user.id}
          meName={user.name}
          existing={
            ((l.data as Record<string, unknown> | null | undefined)
              ?.realization_execution as never) ?? {}
          }
        />
      )}

      {/* Kontent button — realizator ako field reporter pre marketing */}
      <Link
        href={`/realizacie/${id}/kontent`}
        className="block rounded-xl border-2 border-fuchsia-300 bg-gradient-to-br from-fuchsia-50 to-pink-50 hover:from-fuchsia-100 hover:to-pink-100 p-4 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-fuchsia-500 text-white flex items-center justify-center text-2xl shadow-md">
            📱
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-lg text-fuchsia-900">
              Kontent — foto/video pre marketing
            </div>
            <div className="text-xs text-fuchsia-800">
              Fotky a videa pred / počas / po práci pre stories a reels.
              Marketing to zostrihá.
            </div>
          </div>
          <div className="text-fuchsia-600 font-black">→</div>
        </div>
      </Link>

      {/* Statické tlačiteľné PDF plány — druhotné, sekundárny prístup */}
      <details className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
        <summary className="px-4 py-2.5 cursor-pointer text-xs font-bold text-slate-600 hover:bg-slate-50 uppercase tracking-wider">
          📋 Tlačiteľné plány (postup / sklad / zodpovednosť — statické PDF)
        </summary>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <Link
            href={`/realizacie/${id}/plan?view=postup`}
            className="rounded-lg border hover:bg-emerald-50 hover:border-emerald-300 px-3 py-2 font-semibold"
          >
            🔨 Postup (PDF)
          </Link>
          <Link
            href={`/realizacie/${id}/plan?view=sklad`}
            className="rounded-lg border hover:bg-orange-50 hover:border-orange-300 px-3 py-2 font-semibold"
          >
            📦 Zoznam (PDF)
          </Link>
          <Link
            href={`/realizacie/${id}/plan?view=zodpovednost`}
            className="rounded-lg border hover:bg-amber-50 hover:border-amber-300 px-3 py-2 font-semibold"
          >
            ✍️ Zodpovednosť (PDF)
          </Link>
        </div>
      </details>

      {/* Media upload — iba pre realizator / admin */}
      {(user.role === "realizacie" || user.role === "admin") && !isCompleted && (
        <MediaUpload leadId={id} />
      )}

      {/* Galéria */}
      <MediaGallery leadId={id} media={media} canDelete={user.role === "admin" || user.role === "realizacie"} />

      {/* Mark as done — iba realizator */}
      {isRealizator && !isCompleted && (
        <MarkDoneButton leadId={id} />
      )}

      {isCompleted && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" aria-hidden />
          <div className="font-bold text-emerald-900">Realizácia dokončená</div>
          <div className="text-xs text-emerald-800 mt-0.5">
            {new Date(l.realization_completed_at as string).toLocaleString("sk-SK")}
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
