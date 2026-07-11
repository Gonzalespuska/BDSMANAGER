import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, MapPin, Phone, Ruler } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneSK } from "@/lib/phone-format";
import type { Lead } from "@/lib/types/lead";

import { DmButton } from "@/components/dm-button";
import { InspectionWizard } from "./inspection-wizard";
import { InspectionReview } from "./inspection-review";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /obhliadky/[id] — detail obhliadky pre obhliadkára.
 *
 * Obhliadkar prišiel na miesto, zameral, urobil fotky. Tu vyplní:
 *   • Skutočné rozmery (m² podlahy)
 *   • Stav podkladu (poznámky)
 *   • Foto z miesta (upload cez rovnaký media systém ako realizácia)
 *   • Odporúčanie: pokračovať s ponukou / neuskutočniteľné / atď.
 *
 * Po submit sa inspection_result uloží do JSONB, status ide na `interested`
 * a obchodník dostane notifikáciu že môže poslať cenovú ponuku.
 */
export default async function ObhliadkaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (!["obhliadky", "obchod", "admin"].includes(user.role)) redirect("/agent");

  const sb = createAdminClient();
  const { data: lead } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const l = lead as Lead & {
    inspection_by: string | null;
    inspection_at: string | null;
    inspection_result: Record<string, unknown> | null;
    assigned_to: string | null;
  };

  // Access — obhliadkar priradený, obchod-owner, alebo admin
  const canAccess =
    user.role === "admin" ||
    l.inspection_by === user.id ||
    l.assigned_to === user.id;
  if (!canAccess) redirect("/obhliadky");

  // Foto-checklist media — inspection_media table s checklist_key.
  // Bucket 'inspection-media' je PUBLIC (od 2026-07-11) — používame
  // getPublicUrl namiesto signed URLs (spoľahlivejšie renderovanie v img).
  const { data: checklistMediaRaw } = await sb
    .from("inspection_media")
    .select("id, storage_path, checklist_key")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  const checklistMedia = (checklistMediaRaw ?? []).map((m) => ({
    id: m.id as string,
    url: sb.storage
      .from("inspection-media")
      .getPublicUrl(m.storage_path as string).data.publicUrl,
    checklist_key: (m.checklist_key as string | null) ?? null,
  }));

  // Users
  const userIds = [l.assigned_to, l.inspection_by].filter(Boolean) as string[];
  const { data: users } = userIds.length
    ? await sb.from("users").select("id, name, email").in("id", userIds)
    : { data: [] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  const salesUser = l.assigned_to ? userMap.get(l.assigned_to) : null;
  const inspector = l.inspection_by ? userMap.get(l.inspection_by) : null;

  const data = (l.data ?? {}) as Record<string, string | undefined>;
  const isInspector = user.role === "obhliadky" && l.inspection_by === user.id;
  const alreadyCompleted = l.status !== "needs_inspection" && l.status !== "scheduled";

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/obhliadky"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-violet-700 mb-3 px-2 py-1 rounded-md hover:bg-violet-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Obhliadky
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-violet-500" aria-hidden />
              {l.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {alreadyCompleted
                ? "Obhliadka bola dokončená a odovzdaná obchodníkovi."
                : "Choď na miesto, zamer, vyfoť. Potom vyplň formulár nižšie."}
            </p>
          </div>
        </div>
      </header>

      {/* Info karty */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <InfoCard icon={<MapPin className="w-4 h-4" />} label="Lokalita" value={data.lokalita ?? "—"} />
        <InfoCard icon={<Ruler className="w-4 h-4" />} label="Odhad plochy" value={data.plocha ? `${data.plocha} m²` : "—"} />
        <InfoCard
          icon={<Phone className="w-4 h-4" />}
          label="Telefón zákazníka"
          value={l.phone ? formatPhoneSK(l.phone) : "—"}
          link={l.phone ? `tel:${l.phone}` : undefined}
        />
      </div>

      {/* Poznámka zákazníka */}
      {data.message && (
        <div className="rounded-xl border bg-background p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Poznámka zákazníka
          </div>
          <p className="text-sm whitespace-pre-wrap">{data.message}</p>
        </div>
      )}

      {/* Priradenie — obhliadkára ukazovať nemá zmysel (vidí sám seba),
          iba obchodníka koho môže kontaktovať cez DM. Admin, ktorý pozerá
          cudziu obhliadku, si tú info nájde v /obhliadky liste. */}
      {salesUser && salesUser.id !== user.id && (
        <div className="rounded-xl border bg-background p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
            Obchodník ktorý ju priradil
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-bold text-base">{salesUser.name}</div>
            <DmButton
              peerId={salesUser.id}
              peerName={salesUser.name}
              prefill={`Ahoj ${salesUser.name.split(" ")[0]}, píšem ti ohľadom obhliadky u klienta „${l.name}"${data.lokalita ? ` (${data.lokalita})` : ""}. `}
            />
          </div>
        </div>
      )}

      {/* WIZARD — Testy · Zameranie · Nafotenie (nový app-style flow) */}
      {(isInspector || user.role === "admin") && !alreadyCompleted && (
        <InspectionWizard
          leadId={id}
          existingResult={l.inspection_result}
          existingPhotos={checklistMedia
            .filter((m) => m.checklist_key)
            .map((m) => ({
              id: m.id,
              url: m.url,
              tag: (m.checklist_key as "floor_top" | "defects" | "other") ?? "other",
            }))}
        />
      )}

      {/* "Voľné fotky (mimo checklistu)" sekcia odstránená — mätie
          obhliadkára (myslí si že sú to fotky obhliadky, ale ide o legacy
          realizacia media upload). Fotky obhliadky ide iba cez Foto-guide
          wizard (checklist_media). */}

      {alreadyCompleted && l.inspection_result && (
        <InspectionReview
          result={l.inspection_result as Record<string, unknown>}
          photos={checklistMedia}
        />
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
