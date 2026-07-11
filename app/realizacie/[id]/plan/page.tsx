import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { PlanPrintView } from "./plan-print-view";
import { PrintButton } from "./print-button";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function RealizationPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (!["admin", "realizacie", "obchod"].includes(user.role)) {
    redirect("/agent");
  }
  const { id } = await params;
  const sp = await searchParams;
  const activeView =
    sp.view === "sklad"
      ? "sklad"
      : sp.view === "zodpovednost"
        ? "zodpovednost"
        : "postup";

  const sb = createAdminClient();
  const { data: lead } = await sb
    .from("leads")
    .select(
      "id, name, phone, data, source_campaign, created_at, assigned_to, inspection_by, realization_by, realization_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  // Names — obchodák (assigned_to), obhliadkár (inspection_by), realizator
  async function nameOf(userId: string | null | undefined) {
    if (!userId) return null;
    const { data } = await sb
      .from("users")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle();
    return (data?.name as string | null) || (data?.email as string | null) || null;
  }
  const [obchodakName, obhliadkarName, teamName] = await Promise.all([
    nameOf(lead.assigned_to as string | null),
    nameOf(lead.inspection_by as string | null),
    nameOf(lead.realization_by as string | null),
  ]);

  const realizationDateIso =
    (lead.realization_at as string | null) ??
    (lead.created_at as string | null);

  const data = (lead.data ?? {}) as Record<string, unknown>;
  const floorType =
    (data.typ_podlahy as string | null) ??
    (data.floor_type as string | null) ??
    null;
  const priestor = (data.priestor as string | null) ?? null;
  const plocha = (data.plocha as string | null) ?? null;
  const lokalita = (data.lokalita as string | null) ?? null;
  const isGarage = /gar[aá]ž/i.test(priestor ?? "");
  const isJednofarebna = /jednofar/i.test(floorType ?? "");
  const isChipsova = /chips/i.test(floorType ?? "");
  const isMetalicka = /metal/i.test(floorType ?? "");
  const isMramorova = /mramor/i.test(floorType ?? "");

  // Team members pre Zodpovednosť protokol.
  // Priorita:
  //   1. lead.data.realization_team.members — nastavené obchodákom pri
  //      priraďovaní (keď / ak wire-neme team picker)
  //   2. fallback: single realizator z realization_by → 1-osobový tím
  let teamMembers: Array<{ id: string; name: string }> = [];
  const rt = data.realization_team as
    | { team_id?: string; team_name?: string; members?: Array<{ id: string; name: string }> }
    | undefined;
  if (rt?.members && Array.isArray(rt.members) && rt.members.length > 0) {
    teamMembers = rt.members;
  } else if (lead.realization_by) {
    const { data: r } = await sb
      .from("users")
      .select("id, name, email")
      .eq("id", lead.realization_by as string)
      .maybeSingle();
    if (r) {
      teamMembers = [
        {
          id: r.id as string,
          name: (r.name as string | null) ?? (r.email as string),
        },
      ];
    }
  }

  // Fetch procedure_steps z realization_systems ak lead má priradený systém.
  // User: "realizator ma dopredu dany ten system … autoamticky mu to na
  // dany system upravi aj postup pretoze postup je iny pre ine systemy".
  let procedureSteps: Array<{ step: number; title: string; note: string }> = [];
  const rs = data.realization_system as
    | { system?: string; type?: string; binder?: string | null }
    | undefined;
  const systemCode = rs?.system ?? null;
  if (systemCode) {
    try {
      const { data: sysRow } = await sb
        .from("realization_systems")
        .select("procedure_steps")
        .eq("code", systemCode)
        .maybeSingle();
      const raw = (sysRow?.procedure_steps ?? []) as unknown;
      if (Array.isArray(raw)) {
        procedureSteps = raw as Array<{
          step: number;
          title: string;
          note: string;
        }>;
      }
    } catch {
      /* DB migrácia možno nebola spustená — ostaneme s prázdnym → hardcoded fallback v komponente. */
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <header className="print:hidden">
        <Link
          href={`/realizacie/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na realizáciu
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {activeView === "sklad"
              ? "📦 Inventúra — "
              : activeView === "zodpovednost"
                ? "✍️ Zodpovednosť — "
                : "🔨 Postup — "}
            {(lead.name as string) ?? "?"}
          </h1>
          <PrintButton />
        </div>
      </header>

      {/* Iba jeden plán — podľa ?view= parametra
          - view=postup → postupový plán s podpismi
          - view=sklad  → zoznam materiálu zo skladu */}
      <PlanPrintView
        leadId={id}
        inventoryTakenAt={
          typeof data.realization_inventory_taken_at === "string"
            ? (data.realization_inventory_taken_at as string)
            : null
        }
        leadName={(lead.name as string) ?? "?"}
        leadPhone={(lead.phone as string) ?? null}
        floorType={floorType}
        priestor={priestor}
        plocha={plocha}
        lokalita={lokalita}
        teamName={teamName}
        obchodakName={obchodakName}
        obhliadkarName={obhliadkarName}
        realizationDate={realizationDateIso}
        activeView={activeView}
        isGarage={isGarage}
        realizationInventory={
          Array.isArray(data.realization_inventory)
            ? (data.realization_inventory as Array<{
                sku: string;
                label: string;
                qty: number;
                unit: string;
                unit_size_kg?: number;
                note?: string;
              }>)
            : []
        }
        realizationSystemLabel={
          rs?.system ? `${rs.system}` : null
        }
        isJednofarebna={isJednofarebna}
        isChipsova={isChipsova}
        isMetalicka={isMetalicka}
        isMramorova={isMramorova}
        systemId={(data.system_id as string | null) ?? null}
        procedureSteps={procedureSteps}
        systemCode={systemCode}
        teamMembers={teamMembers}
        zakazkaCislo={(lead.id as string).slice(0, 8).toUpperCase()}
        isChipsFloor={isChipsova}
      />
    </div>
  );
}
