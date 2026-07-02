import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, MapPin, Phone, Ruler } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead } from "@/lib/types/lead";

import { InspectionForm } from "./inspection-form";
import { MediaUpload } from "@/app/realizacie/[id]/media-upload";
import { MediaGallery } from "@/app/realizacie/[id]/media-gallery";

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

  // Media
  const { data: mediaRaw } = await sb
    .from("realization_media")
    .select("id, storage_path, file_type, original_filename, caption, uploaded_at, uploaded_by")
    .eq("lead_id", id)
    .order("uploaded_at", { ascending: false });
  const media = mediaRaw ?? [];

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
          value={l.phone ?? "—"}
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

      {/* Priradenie */}
      <div className="rounded-xl border bg-background p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Priradenie
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Obchodník</div>
            <div className="font-bold">{salesUser?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Obhliadkár</div>
            <div className="font-bold">{inspector?.name ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Foto upload */}
      {(user.role === "obhliadky" || user.role === "admin") && !alreadyCompleted && (
        <MediaUpload leadId={id} />
      )}

      {/* Galéria */}
      <MediaGallery leadId={id} media={media} canDelete={user.role === "admin" || user.role === "obhliadky"} />

      {/* Form — iba obhliadkar, iba ak ešte nedokončená */}
      {isInspector && !alreadyCompleted && (
        <InspectionForm
          leadId={id}
          existingResult={l.inspection_result}
        />
      )}

      {alreadyCompleted && l.inspection_result && (
        <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
          <h3 className="font-bold mb-2 inline-flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" aria-hidden />
            Výsledok obhliadky
          </h3>
          <pre className="text-xs bg-background border rounded-lg p-3 overflow-x-auto">
{JSON.stringify(l.inspection_result, null, 2)}
          </pre>
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
