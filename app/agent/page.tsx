import { Phone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth";
import { AgentLiveWrapper } from "@/components/agent-live-wrapper";
import { LeadCard } from "@/components/leads/lead-card";
import { NewLeadButton } from "@/components/leads/new-lead-modal";
import { LeadsSearch } from "@/components/leads/leads-search";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

export const runtime = "edge";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string }>;
}

const TABS = [
  { id: "novy", label: "🆕 Nové" },
  { id: "kontakt", label: "📞 Kontakt" },
  { id: "nedovolany", label: "🟡 Nezdvíhali" },
  { id: "otvorene", label: "✅ CP" },
  { id: "ukoncene", label: "🏆 Ukončené" },
  { id: "archivovane", label: "📦 Archivované" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function AgentDashboard({ searchParams }: PageProps) {
  // Force fresh data — vyhneme sa Next 14 fetch cache pre PostgREST endpointy
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();

  const params = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === params.tab)?.id ?? "novy";
  const q = (params.q ?? "").trim();
  const searchMode = q.length > 0;

  const user = await getCurrentAppUser();
  if (!user) return null;

  // Admin vidí VŠETKY leady, obchodník iba svoje pridelené.
  const isAdmin = user.role === "admin";

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // ─── Build queries pre tab + counts ──────────────────────────────────
  // Auto-assign je VYPNUTÝ — nové leady prídu s assigned_to=NULL a každý
  // agent ich vidí v "Nepriradené" tabe, kde si ich claimne.
  //
  // Search mode (q present): ignoruje tab filter, hľadá vo všetkých
  // leadov ktoré užívateľ vidí (vlastné + nepriradené), cez:
  //   - name, phone, email
  //   - source_campaign
  //   - data.lokalita, data.priestor, data.typ_podlahy, data.message,
  //     data.agent_note, data.plocha
  const leadsListQuery = searchMode
    ? (() => {
        const safe = q.replace(/[\\%_,]/g, (m) => "\\" + m);
        const like = `*${safe}*`;
        return supabase
          .from("leads")
          .select("*")
          .or(
            [
              `name.ilike.${like}`,
              `phone.ilike.${like}`,
              `email.ilike.${like}`,
              `source_campaign.ilike.${like}`,
              `data->>lokalita.ilike.${like}`,
              `data->>priestor.ilike.${like}`,
              `data->>typ_podlahy.ilike.${like}`,
              `data->>message.ilike.${like}`,
              `data->>agent_note.ilike.${like}`,
              `data->>plocha.ilike.${like}`,
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(200);
      })()
    : (() => {
    // Helper: pre obchodníka pridá assigned_to filter, pre admina nie.
    switch (tab) {
      case "kontakt": {
        let q = supabase.from("leads").select("*").eq("status", "phone_revealed");
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("last_activity_at", { ascending: false }).limit(200);
      }

      case "nedovolany": {
        let q = supabase.from("leads").select("*").eq("status", "no_answer");
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("created_at", { ascending: false }).limit(200);
      }

      case "otvorene": {
        let q = supabase.from("leads").select("*").in("status", ["interested", "quote_sent"]);
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("last_activity_at", { ascending: false }).limit(200);
      }

      case "ukoncene": {
        let q = supabase.from("leads").select("*").eq("status", "won");
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("last_activity_at", { ascending: false }).limit(200);
      }

      case "archivovane": {
        let q = supabase.from("leads").select("*").in("status", ["archived", "lost", "not_interested"]);
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("last_activity_at", { ascending: false }).limit(200);
      }

      case "novy":
      default: {
        let q = supabase.from("leads").select("*").eq("status", "new");
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("created_at", { ascending: false }).limit(200);
      }
    }
  })();

  const [
    leadsRes,
    novyCountRes,
    kontaktCountRes,
    nedovolanyCountRes,
    otvoreneCountRes,
    ukonceneCountRes,
    archivovaneCountRes,
  ] = await Promise.all([
    leadsListQuery,
    (() => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "phone_revealed");
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "no_answer");
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("status", ["interested", "quote_sent"]);
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "won");
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("status", ["archived", "lost", "not_interested"]);
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
  ]);

  const rawLeads = (leadsRes.data ?? []) as Lead[];

  // Enrich leads with assigned_user_name — 1 join query, in-memory map.
  const assignedIds = Array.from(
    new Set(
      rawLeads
        .map((l) => l.assigned_to)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const nameMap = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name")
      .in("id", assignedIds);
    for (const u of usersData ?? []) {
      if (u.id && typeof u.name === "string") nameMap.set(u.id, u.name);
    }
  }
  const leads: Lead[] = rawLeads.map((l) => ({
    ...l,
    assigned_user_name: l.assigned_to ? (nameMap.get(l.assigned_to) ?? null) : null,
  }));
  const counts: Record<TabId, number | undefined> = {
    novy: novyCountRes.count ?? undefined,
    kontakt: kontaktCountRes.count ?? undefined,
    nedovolany: nedovolanyCountRes.count ?? undefined,
    otvorene: otvoreneCountRes.count ?? undefined,
    ukoncene: ukonceneCountRes.count ?? undefined,
    archivovane: archivovaneCountRes.count ?? undefined,
  };

  const totalToCall = (counts.novy ?? 0) + (counts.nedovolany ?? 0);

  return (
    <AgentLiveWrapper>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <Phone className="w-6 h-6 text-sky-500" aria-hidden />
            {searchMode ? (
              <>
                Hľadanie: <span className="text-sky-500">&quot;{q}&quot;</span>{" "}
                <span className="text-muted-foreground font-bold">({leads.length})</span>
              </>
            ) : (
              <>
                Leady na volanie{" "}
                <span className="text-sky-500">({totalToCall})</span>
              </>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {searchMode
              ? "Hľadám naprieč všetkými leadmi (meno, telefón, email, lokalita, kampaň, poznámka)."
              : "Čerstvé + nedovolané čakajú na hovor."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <LeadsSearch />
          <NewLeadButton />
        </div>
      </header>

      <div
        className={cn(
          "flex flex-wrap gap-2",
          searchMode && "opacity-40 pointer-events-none",
        )}
        aria-disabled={searchMode}
      >
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          const count = counts[id];
          return (
            <a
              key={id}
              href={`/agent?tab=${id}`}
              className={cn(
                "px-4 py-2.5 rounded-xl font-bold text-sm transition-colors",
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-background border hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              {label}
              {count !== undefined && (
                <span
                  className={cn(
                    "ml-2 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-xs font-bold",
                    active
                      ? "bg-background/20 text-background"
                      : "bg-muted text-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </a>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <div className="rounded-2xl border bg-background p-12 text-center">
          <div className="text-4xl mb-3">{searchMode ? "🔍" : "🎉"}</div>
          <h3 className="text-lg font-bold mb-1">
            {searchMode
              ? `Žiadne výsledky pre "${q}"`
              : "Žiadne leady v tejto kategórii"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {searchMode &&
              "Skús inú časť mena, telefónne číslo, časť emailu alebo lokality."}
            {!searchMode && tab === "novy" && "Žiadne nové leady. Čakáme na ďalší dopyt."}
            {!searchMode && tab === "kontakt" && "Žiadny aktívny kontakt. Po volaní zdvihla → klikni 'Kontakt' a lead bude tu."}
            {!searchMode && tab === "nedovolany" && "Žiadne nezdvíhajú. Po 3. neúspechu sa pridá tlačidlo 'Archivovať' s SMS+Email follow-up."}
            {!searchMode && tab === "otvorene" && "Žiadna poslaná cenová ponuka. Po odoslaní CP z generátora sa lead presunie sem."}
            {!searchMode && tab === "ukoncene" && "Žiadne ukončené dealy. Po podpise / dodaní označ lead ako 'Ukončené'."}
            {!searchMode && tab === "archivovane" && "Žiadne archivované leady. Po neúspešnom kontakte / 3× nezdvihol sa lead presunie sem."}
          </p>
          {!searchMode && process.env.NODE_ENV !== "production" && (
            <div className="mt-4 text-xs text-muted-foreground">
              Pre vygenerovanie testovacích leadov navštív{" "}
              <a
                href="/api/dev/seed-leads"
                className="text-sky-600 hover:underline font-medium"
              >
                /api/dev/seed-leads
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </AgentLiveWrapper>
  );
}
