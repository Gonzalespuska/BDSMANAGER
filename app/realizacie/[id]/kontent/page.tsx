import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getShotsForFloorType,
  type FloorTypeFilter,
} from "@/lib/data/content-shotlist";

import { ContentShotlist } from "./content-shotlist-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /realizacie/[id]/kontent — content generator pre realizatora.
 *
 * User (2026-07-11): "chcem si z realizatorov spravit aj generator kontentu".
 */
export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (!["admin", "realizacie", "obchod"].includes(user.role)) {
    redirect("/agent");
  }
  const { id } = await params;

  const sb = createAdminClient();
  const { data: lead } = await sb
    .from("leads")
    .select("id, name, data, realization_by")
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const data = (lead.data ?? {}) as Record<string, unknown>;
  const rawType = (data.typ_podlahy as string | null) ?? null;
  let floorType: FloorTypeFilter | null = null;
  if (rawType) {
    const n = rawType.toLowerCase();
    if (n.includes("chips")) floorType = "chipsova";
    else if (n.includes("mramor")) floorType = "mramorova";
    else if (n.includes("metal")) floorType = "metalicka";
    else if (n.includes("jedno")) floorType = "jednofarebna";
  }

  const shots = getShotsForFloorType(floorType);

  // Existujúce uploads pre tento lead
  const { data: captures } = await sb
    .from("content_captures")
    .select("id, shot_id, phase, kind, storage_path, uploaded_at, uploaded_by")
    .eq("lead_id", id)
    .order("uploaded_at", { ascending: false });

  // Public URLs pre náhľady (bucket content-media by mal byť public)
  const capturesWithUrl = (captures ?? []).map((c) => {
    const { data: pub } = sb.storage
      .from("content-media")
      .getPublicUrl(c.storage_path as string);
    return { ...c, url: pub?.publicUrl ?? null };
  });

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/realizacie/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-2 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Späť na realizáciu
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            📱 Kontent — {(lead.name as string) ?? "?"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vaše fotky a videá dostane marketing tím na Instagram Stories,
            reels a denné príspevky. Nemusí byť super kvalitné —{" "}
            <strong>hlavne raw material</strong>. Marketing to zostrihá.
          </p>
        </div>
      </header>

      <ContentShotlist
        leadId={id}
        shots={shots}
        floorType={floorType}
        initialCaptures={
          capturesWithUrl as Array<{
            id: string;
            shot_id: string;
            phase: string;
            kind: string;
            storage_path: string;
            uploaded_at: string;
            uploaded_by: string;
            url: string | null;
          }>
        }
      />
    </div>
  );
}
