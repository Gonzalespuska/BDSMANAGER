import { Phone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth";
import { AgentLiveWrapper } from "@/components/agent-live-wrapper";
import { LeadCard } from "@/components/leads/lead-card";
import { NewLeadButton } from "@/components/leads/new-lead-modal";
import { LeadsSearch } from "@/components/leads/leads-search";
import { PullMoreButton } from "@/components/leads/pull-more-button";
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
  { id: "otvorene", label: "✅ Orientačná CP" },
  // "Obhliadka" = needs_inspection A termín je v BUDÚCNOSTI
  { id: "obhliadnute", label: "🔍 Obhliadka" },
  // "Obhliadnuté" = needs_inspection A termín PREŠIEL, alebo status=inspected
  // (dátum obhliadky uplynul → automaticky sem)
  { id: "obhliadnute_hotove", label: "✔️ Obhliadnuté" },
  { id: "archivovane", label: "📦 Archivované" },
  { id: "kos", label: "🗑 Kôš" },
  { id: "ukoncene", label: "✅ Hotové realizácie" },
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
  // VÝNIMKA: info@epoxidovo.sk je TEST admin účet — vidí IBA svoje test leady,
  // aby sa neplietli s reálnymi leadmi Leo/Elo. Reálni admini (napr. Tristan)
  // vidia všetko.
  const isTestAccount = user.email.toLowerCase() === "info@epoxidovo.sk";
  const isAdmin = user.role === "admin" && !isTestAccount;

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
        // Escape PostgREST special chars pre bezpečnosť
        const safe = q.replace(/[\\%_,]/g, (m) => "\\" + m);
        // Normalizovaný variant — lower + strip diacritics ("František" → "frantisek")
        // Umožňuje aby obchodník napísal "frantisek" a našiel "František Pavlík".
        const safeNorm = safe
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
        const like = `*${safe}*`;
        const likeNorm = `*${safeNorm}*`;

        // ─── Phone number normalization ─────────────────────────────
        // User napíše "0915199" alebo "0950 890" alebo "+421 915" — všetko
        // musí nájsť lead s DB hodnotou "+421 915 199 693".
        // Strategy: strip všetko okrem číslic; ak vstup je aspoň 3 číslice,
        // hľadaj cez `phone_digits` generovaný stĺpec (SQL migrácia 19).
        // Ak začína 0 → nahraď za 421 (SK format).
        const digitsOnly = q.replace(/[^0-9]/g, "");
        let phoneQueries: string[] = [];
        if (digitsOnly.length >= 3) {
          const variants = new Set<string>();
          variants.add(digitsOnly);
          if (digitsOnly.startsWith("0")) {
            variants.add("421" + digitsOnly.slice(1));
          } else if (digitsOnly.startsWith("421")) {
            variants.add("0" + digitsOnly.slice(3));
          }
          for (const v of variants) {
            phoneQueries.push(`phone_digits.ilike.*${v}*`);
          }
        }

        return supabase
          .from("leads")
          .select("*")
          .or(
            [
              // Phone search cez normalizovaný stĺpec (najviac účinné pre
              // telefonálne search-e — funguje bez ohľadu na formát).
              ...phoneQueries,
              // name_norm = generovaný lowercase+unaccent stĺpec
              // (viď supabase/13_search_diacritics.sql). Ak migrácia
              // nebola spustená, PostgREST vráti error na tomto filtri
              // ale ostatné klauzuly stále bežia (OR).
              `name_norm.ilike.${likeNorm}`,
              // Fallback pre ne-normalized DB (kým migrácia nebeží)
              `name.ilike.${like}`,
              `phone.ilike.${like}`,
              `email.ilike.${likeNorm}`,
              `source_campaign.ilike.${likeNorm}`,
              `data->>lokalita.ilike.${likeNorm}`,
              `data->>priestor.ilike.${likeNorm}`,
              `data->>typ_podlahy.ilike.${likeNorm}`,
              `data->>message.ilike.${likeNorm}`,
              `data->>agent_note.ilike.${likeNorm}`,
              `data->>plocha.ilike.${likeNorm}`,
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

      case "obhliadnute": {
        // "Na obhliadke" = obhliadka BUDÚCA (inspection_at > now alebo NULL).
        // Termín ešte nenastal — obhliadkár tam ešte len ide.
        const nowIso = new Date().toISOString();
        let q = supabase
          .from("leads")
          .select("*")
          .eq("status", "needs_inspection")
          .or(`inspection_at.gt.${nowIso},inspection_at.is.null`);
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("inspection_at", { ascending: true, nullsFirst: false }).limit(200);
      }

      case "obhliadnute_hotove": {
        // "Obhliadnuté" = obhliadka MINULÁ. Auto-transition:
        //   • needs_inspection s inspection_at <= now (dátum prešiel)
        //   • ALEBO status=inspected (explicitne označené obhliadkárom)
        const nowIso = new Date().toISOString();
        let q = supabase
          .from("leads")
          .select("*")
          .or(
            `and(status.eq.needs_inspection,inspection_at.lte.${nowIso}),status.eq.inspected`,
          );
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("last_activity_at", { ascending: false }).limit(200);
      }

      case "ukoncene": {
        // Hotové realizácie = LEN reálne dokončené (status='won' AND
        // realization_completed_at IS NOT NULL).
        // User 2026-07-11: "pozor won ma byt ukoncene proste ta podlaha
        // bola uz realizovana chapes na zaklade toho sa budu % davat aj
        // obchodakom takze na to pozor".
        //
        // Predtym sme sem hádzali aj in_realization s pased realization_at
        // — čo obchodákovi pripísalo % skôr než realizator reálne dokončil.
        // Fix: iba status='won'. Auto-transition (36h buffer) alebo
        // manuálne kliknutie "Hotovo" na /realizacie prehodí lead do won.
        let q = supabase
          .from("leads")
          .select("*")
          .eq("status", "won");
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        return q.order("realization_completed_at", { ascending: false }).limit(200);
      }

      case "archivovane": {
        // Archivované = follow-up neskôr. Vylúč trash (mrtvý).
        // Ak DB nemá status='trash' constraint, mrtvé leady sú v status='archived'
        // s data.trashed=true → tie treba tu explicitne vylúčiť.
        let q = supabase.from("leads").select("*").in("status", ["archived", "lost", "not_interested"]);
        if (!isAdmin) q = q.eq("assigned_to", user.id);
        q = q.or("data->>trashed.is.null,data->>trashed.eq.false");
        return q.order("last_activity_at", { ascending: false }).limit(200);
      }

      case "kos": {
        // Kôš — status='trash' ALEBO archived s data.trashed=true (fallback).
        // User 2026-07-14: „novy status ktory sa bude volat kos".
        let q = supabase
          .from("leads")
          .select("*")
          .or("status.eq.trash,data->>trashed.eq.true");
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
    obhliadnuteCountRes,
    obhliadnuteHotoveCountRes,
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
    // "Na obhliadke" count — needs_inspection s termínom v budúcnosti
    (() => {
      const nowIso = new Date().toISOString();
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_inspection")
        .or(`inspection_at.gt.${nowIso},inspection_at.is.null`);
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    // "Obhliadnuté" count — termín prešiel, alebo status=inspected
    (() => {
      const nowIso = new Date().toISOString();
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or(
          `and(status.eq.needs_inspection,inspection_at.lte.${nowIso}),status.eq.inspected`,
        );
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      return q;
    })(),
    // "Hotové realizácie" count — LEN status=won (dokončené realizácie
    // ktoré počítajú % obchodákovi).
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
  const relatedIds = Array.from(
    new Set(
      rawLeads
        .flatMap((l) => [
          l.assigned_to,
          l.inspection_by,
          l.realization_by,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const nameMap = new Map<string, string>();
  if (relatedIds.length > 0) {
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name")
      .in("id", relatedIds);
    for (const u of usersData ?? []) {
      if (u.id && typeof u.name === "string") nameMap.set(u.id, u.name);
    }
  }
  const leads: Lead[] = rawLeads.map((l) => ({
    ...l,
    assigned_user_name: l.assigned_to ? (nameMap.get(l.assigned_to) ?? null) : null,
    inspection_by_name: l.inspection_by ? (nameMap.get(l.inspection_by) ?? null) : null,
    realization_by_name: l.realization_by ? (nameMap.get(l.realization_by) ?? null) : null,
  }));
  const counts: Record<TabId, number | undefined> = {
    novy: novyCountRes.count ?? undefined,
    kontakt: kontaktCountRes.count ?? undefined,
    nedovolany: nedovolanyCountRes.count ?? undefined,
    otvorene: otvoreneCountRes.count ?? undefined,
    obhliadnute: obhliadnuteCountRes.count ?? undefined,
    obhliadnute_hotove: obhliadnuteHotoveCountRes.count ?? undefined,
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
          {/* Pull-more presunuté do empty-state (dole).
              User 2026-07-16: „malo by byt tam kde je ze ziadne leady v
              tejto kategorii, nech tam pod tym je to talcidlo pridat
              manualne leady + nech sa to nevola 5 leadov z poolu proste
              nech tam je ze pridat Leady iba". */}
          <NewLeadButton />
        </div>
      </header>

      {/* User 2026-07-12: „na leadoch tie statusy 2 v riadku pod sebou divne
          optimalizovat". Na mobile → horizontálny scroll s snap-x (iOS-style
          pills). Na desktope wrap ako predtým. */}
      <div
        className={cn(
          "flex gap-2 -mx-4 px-4 sm:mx-0 sm:px-0",
          "overflow-x-auto scrollbar-hide flex-nowrap sm:flex-wrap sm:overflow-visible",
          "snap-x snap-mandatory sm:snap-none",
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
                "shrink-0 sm:shrink px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl font-bold text-sm transition-colors snap-start",
                "inline-flex items-center gap-2",
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-background border hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <span className="whitespace-nowrap">{label}</span>
              {count !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-[11px] font-black tabular-nums",
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
            {!searchMode && tab === "obhliadnute" && "Žiadne leady na obhliadke. Priradenie z kalendára s termínom v BUDÚCNOSTI sa zobrazí tu. Po prejdení termínu sa automaticky presunie do Obhliadnuté."}
            {!searchMode && tab === "obhliadnute_hotove" && "Žiadne obhliadnuté leady. Sem sa automaticky presunú leady, ktorých obhliadka bola naplánovaná a jej termín uplynul."}
            {!searchMode && tab === "ukoncene" && "Žiadne hotové realizácie. Sem sa presunú zákazky až KEĎ realizator reálne dokončí prácu (auto po 36h od realization_at alebo manuálne kliknutím \"Hotovo\" na /realizacie/[id]). % obchodákovi sa počíta iba z týchto."}
            {!searchMode && tab === "archivovane" && "Žiadne archivované leady. Po neúspešnom kontakte / 3× nezdvihol sa lead presunie sem."}
          </p>
          {/* CTA — Pridať leady (pull z poolu). Iba v "Nové" tabe a iba
              pre obchod/admin (obhliadkár nemá pool leadov na prevzatie). */}
          {!searchMode &&
            tab === "novy" &&
            (user.role === "obchod" || user.role === "admin") && (
              <div className="mt-6 flex justify-center">
                <PullMoreButton count={5} size="lg" />
              </div>
            )}
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
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-4">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </AgentLiveWrapper>
  );
}
