import { Phone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth";
import { AgentLiveWrapper } from "@/components/agent-live-wrapper";
import { LeadCard } from "@/components/leads/lead-card";
import { NewLeadButton } from "@/components/leads/new-lead-modal";
import type { Lead } from "@/lib/types/lead";
import { cn } from "@/lib/utils";

export const runtime = "edge";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

const TABS = [
  { id: "novy", label: "🔴 Nové" },
  { id: "nedovolany", label: "🟡 Nedvíhajú" },
  { id: "planovany", label: "📅 Naplánované" },
  { id: "otvorene", label: "🔥 Otvorené" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function AgentDashboard({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === params.tab)?.id ?? "novy";

  const user = await getCurrentAppUser();
  if (!user) return null;

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // ─── Build queries pre tab + counts ──────────────────────────────────
  const leadsListQuery = (() => {
    switch (tab) {
      case "nedovolany":
        return supabase
          .from("leads")
          .select("*")
          .eq("status", "no_answer")
          .or(`next_callback_at.is.null,next_callback_at.lte.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(200);

      case "planovany":
        return supabase
          .from("leads")
          .select("*")
          .gt("next_callback_at", nowIso)
          .order("next_callback_at", { ascending: true })
          .limit(200);

      case "otvorene":
        // "Otvorené" = aktívne deals — agent volal, máme záujem alebo poslanú ponuku
        return supabase
          .from("leads")
          .select("*")
          .in("status", ["interested", "quote_sent"])
          .order("last_activity_at", { ascending: false })
          .limit(200);

      case "novy":
      default:
        // "Nové" = leady ktoré agent ešte nevyriešil:
        //   - 'new' (čerstvé, číslo ešte nevidel)
        //   - 'phone_revealed' (videl číslo, ale ešte nezavolal alebo nezaznamenal výsledok)
        return supabase
          .from("leads")
          .select("*")
          .in("status", ["new", "phone_revealed"])
          .order("created_at", { ascending: false })
          .limit(200);
    }
  })();

  const [
    leadsRes,
    novyCountRes,
    nedovolanyCountRes,
    planovanyCountRes,
    otvoreneCountRes,
  ] = await Promise.all([
    leadsListQuery,
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "phone_revealed"]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "no_answer")
      .or(`next_callback_at.is.null,next_callback_at.lte.${nowIso}`),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gt("next_callback_at", nowIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", ["interested", "quote_sent"]),
  ]);

  const leads = (leadsRes.data ?? []) as Lead[];
  const counts: Record<TabId, number | undefined> = {
    novy: novyCountRes.count ?? undefined,
    nedovolany: nedovolanyCountRes.count ?? undefined,
    planovany: planovanyCountRes.count ?? undefined,
    otvorene: otvoreneCountRes.count ?? undefined,
  };

  const totalToCall = (counts.novy ?? 0) + (counts.nedovolany ?? 0);

  return (
    <AgentLiveWrapper>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
            <Phone className="w-6 h-6 text-sky-500" aria-hidden />
            Leady na volanie{" "}
            <span className="text-sky-500">({totalToCall})</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Čerstvé + nedovolané čakajú na hovor.
          </p>
        </div>
        <NewLeadButton />
      </header>

      <div className="flex flex-wrap gap-2">
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
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-lg font-bold mb-1">Žiadne leady v tejto kategórii</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {tab === "novy" && "Všetky nové leady sú spracované. Čakáme na nový dopyt."}
            {tab === "nedovolany" && "Žiadne čakajúce nedovíhajú hovory."}
            {tab === "planovany" && "Žiadny naplánovaný callback."}
            {tab === "otvorene" && "Žiadne otvorené dealy. Po hovore označ lead ako 'záujem' alebo 'ponuka' a objaví sa tu."}
          </p>
          <div className="mt-4 text-xs text-muted-foreground">
            Pre vygenerovanie testovacích leadov navštív{" "}
            <a
              href="/api/dev/seed-leads"
              className="text-sky-600 hover:underline font-medium"
            >
              /api/dev/seed-leads
            </a>
          </div>
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
