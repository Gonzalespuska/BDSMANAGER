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
  { id: "nepriradene", label: "🆕 Nepriradené" },
  { id: "novy", label: "🔴 Moje nové" },
  { id: "nedovolany", label: "🟡 Nedvíhajú" },
  { id: "planovany", label: "📅 Naplánované" },
  { id: "otvorene", label: "🔥 Otvorené" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function AgentDashboard({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === params.tab)?.id ?? "novy";
  const q = (params.q ?? "").trim();
  const searchMode = q.length > 0;

  const user = await getCurrentAppUser();
  if (!user) return null;

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
    switch (tab) {
      case "nepriradene":
        return supabase
          .from("leads")
          .select("*")
          .is("assigned_to", null)
          .in("status", ["new","phone_revealed","no_answer","scheduled","interested","quote_sent","not_interested"])
          .order("created_at", { ascending: false })
          .limit(200);

      case "nedovolany":
        return supabase
          .from("leads")
          .select("*")
          .eq("status", "no_answer")
          .eq("assigned_to", user.id)
          .or(`next_callback_at.is.null,next_callback_at.lte.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(200);

      case "planovany":
        return supabase
          .from("leads")
          .select("*")
          .eq("assigned_to", user.id)
          .gt("next_callback_at", nowIso)
          .order("next_callback_at", { ascending: true })
          .limit(200);

      case "otvorene":
        return supabase
          .from("leads")
          .select("*")
          .eq("assigned_to", user.id)
          .in("status", ["interested", "quote_sent"])
          .order("last_activity_at", { ascending: false })
          .limit(200);

      case "novy":
      default:
        // "Moje nové" — leady už pridelené tomuto agentovi, ešte nespracované
        return supabase
          .from("leads")
          .select("*")
          .eq("assigned_to", user.id)
          .in("status", ["new", "phone_revealed"])
          .order("created_at", { ascending: false })
          .limit(200);
    }
  })();

  const [
    leadsRes,
    nepriradeneCountRes,
    novyCountRes,
    nedovolanyCountRes,
    planovanyCountRes,
    otvoreneCountRes,
  ] = await Promise.all([
    leadsListQuery,
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("assigned_to", null)
      .in("status", ["new","phone_revealed","no_answer","scheduled","interested","quote_sent","not_interested"]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .in("status", ["new", "phone_revealed"]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .eq("status", "no_answer")
      .or(`next_callback_at.is.null,next_callback_at.lte.${nowIso}`),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .gt("next_callback_at", nowIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .in("status", ["interested", "quote_sent"]),
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
    nepriradene: nepriradeneCountRes.count ?? undefined,
    novy: novyCountRes.count ?? undefined,
    nedovolany: nedovolanyCountRes.count ?? undefined,
    planovany: planovanyCountRes.count ?? undefined,
    otvorene: otvoreneCountRes.count ?? undefined,
  };

  const totalToCall =
    (counts.nepriradene ?? 0) + (counts.novy ?? 0) + (counts.nedovolany ?? 0);

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
            {!searchMode && tab === "novy" && "Všetky nové leady sú spracované. Čakáme na nový dopyt."}
            {!searchMode && tab === "nepriradene" && "Žiadne nepriradené leady. Všetky sú už prebraté."}
            {!searchMode && tab === "nedovolany" && "Žiadne čakajúce nedovíhajú hovory."}
            {!searchMode && tab === "planovany" && "Žiadny naplánovaný callback."}
            {!searchMode && tab === "otvorene" && "Žiadne otvorené dealy. Po hovore označ lead ako 'záujem' alebo 'ponuka' a objaví sa tu."}
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
