import { Calendar as CalendarIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import {
  CalendarGrid,
  type CalendarCallback,
  type CalendarNote,
} from "./calendar-grid";
import { CalendarStats } from "./calendar-stats";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    m?: string;
    assign?: string;
    lead?: string;
    city?: string;
    manual?: string;
    /** Filter kalendára na konkrétneho člena tímu (id z users). Používa sa
     * obchodákom na spresnenie "kto má voľno" — klikne meno v Prehľade
     * (Realizatori sekcia) a vidí LEN eventy toho člena. */
    filter_user?: string;
  }>;
}

/**
 * /calendar — kalendár (vľavo, kompaktný) + Apple-Notes-like panel (vpravo).
 */
export default async function CalendarPage({ searchParams }: Props) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const initialMonth =
    params.m && /^\d{4}-\d{2}$/.test(params.m)
      ? params.m
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Ak sme v assign mode s konkrétnym lead-om, načítaj profil zákazníka.
  // CalendarGrid ho použije na banner + enhanced Day modal (namiesto len
  // "Poznámky (0)" ukáže KTORÉHO leadu obhliadku/realizáciu priradzuješ).
  const assignMode: "inspection" | "realization" | null =
    params.assign === "inspection"
      ? "inspection"
      : params.assign === "realization"
        ? "realization"
        : null;

  let assignLead: null | {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    m2: string | null;
    floor_type: string | null;
  } = null;

  if (assignMode && params.lead) {
    try {
      const admin2 = createAdminClient();
      const { data: lead } = await admin2
        .from("leads")
        .select("id, name, email, phone, data")
        .eq("id", params.lead)
        .maybeSingle();
      if (lead) {
        const d = (lead.data as Record<string, unknown>) ?? {};
        assignLead = {
          id: lead.id as string,
          name: (lead.name as string) ?? "",
          email: (lead.email as string | null) ?? null,
          phone: (lead.phone as string | null) ?? null,
          city:
            (params.city as string | undefined) ??
            (typeof d.lokalita === "string" ? d.lokalita : null),
          m2: typeof d.plocha === "string" ? d.plocha : null,
          floor_type:
            typeof d.typ_podlahy === "string" ? d.typ_podlahy : null,
        };
      }
    } catch (e) {
      console.error("[calendar] assign lead fetch failed:", e);
    }
  }

  const [yearStr, monthStr] = initialMonth.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr);
  const fromDate = new Date(year, monthIdx - 2, 1);
  const toDate = new Date(year, monthIdx + 1, 0, 23, 59, 59);

  const admin = createAdminClient();

  // CALLBACKY sa v kalendári NEZOBRAZUJÚ — patria do notifikácií (zvonček).
  // Tento kalendár slúži pre priradenia obhliadok / realizácií medzi rolami:
  //   • obchodák tu priradí obhliadku obhliadkarovi (dátum + čas + lead + poznámka)
  //   • obchodák tu priradí realizáciu realizatorovi (rovnaký princíp)
  //   • obhliadkar tu vidí svoje pridelené obhliadky
  //   • realizator tu vidí svoje pridelené realizácie
  //   • admin vidí všetko (globálny pohľad)
  //
  // Momentálne používame calendar_notes tabuľku s kind={'call','meeting','note'}
  // ako placeholder pre skutočný "assignment" model. Až spustíme
  // supabase/10_role_handoff.sql (needs_inspection + inspection_by/at) sa
  // prepneme na skutočné handoff queries.

  // ─── Calendar notes — ZDIELANÉ podľa role ────────────────────────
  // Pravidlá (viď 18_calendar_shared_visibility.sql):
  //   • Obchodák + admin — vidí všetky assignments (meeting/call) v tíme
  //     + svoje osobné note-y
  //   • Obhliadkár + realizator — vidí iba čo mu bolo priradené (target_user_id)
  //     + svoje osobné note-y
  //   • Ostatné role — iba svoje
  //
  // Používame admin klienta (bypass RLS) + vlastný filter, lebo view-as
  // môže robiť s cookie a chceme mať kontrolu.
  // Voliteľný filter na konkrétneho člena tímu (obchodák si klikne na
  // realizatora/obhliadkára v Prehľade → vidí LEN jeho eventy).
  const filterUser =
    params.filter_user && /^[0-9a-f-]{36}$/i.test(params.filter_user)
      ? params.filter_user
      : null;

  const notesQuery = (() => {
    const base = admin
      .from("calendar_notes")
      .select(
        "id, date, body, kind, starts_at, contact_name, target_user_id, user_id, lead_id, created_at",
      )
      .gte("date", fromDate.toISOString().slice(0, 10))
      .lte("date", toDate.toISOString().slice(0, 10))
      .order("created_at", { ascending: true });

    // Ak je filter_user set, obchodák/admin filtrujú na konkrétneho člena.
    // Ukážeme eventy kde je on creator ALEBO target.
    if ((me.role === "admin" || me.role === "obchod") && filterUser) {
      return base.or(`user_id.eq.${filterUser},target_user_id.eq.${filterUser}`);
    }

    // Admin + Obchodák bez filtra: vidia VŠETKY kalendáre v tíme (obhliadky
    // + realizácie od každého obhliadkára/realizátora + vlastné note-y).
    // Dôvod: obchodák plánuje svoje CP na základe kedy má obhliadkár voľno,
    // realizátor kapacitu, atď. — musí vidieť celý team schedule.
    if (me.role === "admin" || me.role === "obchod") {
      return base;
    }
    // Obhliadky / realizacie / office / skolenie — iba čo bolo priradené
    // jemu + svoje osobné poznámky. Zámerne NEVIDÍ ostatných členov tímu
    // aby sa nezvyšovala kognitívna záťaž jeho stránky.
    return base.or(`user_id.eq.${me.id},target_user_id.eq.${me.id}`);
  })();

  // Ak je filter set, načítaj meno tej osoby pre banner
  let filterUserInfo: { id: string; name: string; role: string } | null = null;
  if (filterUser) {
    const { data: u } = await admin
      .from("users")
      .select("id, name, role")
      .eq("id", filterUser)
      .maybeSingle();
    if (u) {
      filterUserInfo = {
        id: u.id as string,
        name: (u.name as string) ?? "?",
        role: (u.role as string) ?? "user",
      };
    }
  }

  const [{ data: notesRows, error: notesErr }, { data: generalNotes }] =
    await Promise.all([
      notesQuery,
      admin
        .from("notes")
        .select("id, title, body, pinned, updated_at")
        .eq("user_id", me.id)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

  // Fallback pre DB bez migrácie 18 — ak nemá stĺpec target_user_id,
  // vráti sa error → zobrazíme iba osobné note-y.
  let effectiveNotes: Array<Record<string, unknown>> | null = notesRows;
  if (notesErr && /column .*target_user_id.* does not exist/i.test(notesErr.message)) {
    const fb = await admin
      .from("calendar_notes")
      .select("id, date, body, kind, starts_at, contact_name, created_at")
      .eq("user_id", me.id)
      .gte("date", fromDate.toISOString().slice(0, 10))
      .lte("date", toDate.toISOString().slice(0, 10))
      .order("created_at", { ascending: true });
    effectiveNotes = fb.data;
  }

  // Zbierame lead_ids aby sme mohli fetchnúť lead info (telefón, m², typ,
  // priestor, lokalita) — pre "meeting" notes s naviazaným leadom sa
  // Day Modal zobrazí ako rich karta klienta.
  const leadIdsInNotes = new Set<string>();
  for (const n of effectiveNotes ?? []) {
    const lid = n.lead_id as string | null;
    if (lid) leadIdsInNotes.add(lid);
  }
  const leadInfoMap = new Map<string, {
    name: string;
    phone: string | null;
    data: Record<string, unknown>;
    status: string;
  }>();
  if (leadIdsInNotes.size > 0) {
    const { data: leadRows } = await admin
      .from("leads")
      .select("id, name, phone, data, status")
      .in("id", Array.from(leadIdsInNotes));
    for (const row of leadRows ?? []) {
      leadInfoMap.set(row.id as string, {
        name: (row.name as string) ?? "",
        phone: (row.phone as string | null) ?? null,
        data: (row.data as Record<string, unknown> | null) ?? {},
        status: (row.status as string) ?? "",
      });
    }
  }

  const calendarNotes: CalendarNote[] = (effectiveNotes ?? []).map((n) => {
    const lid = (n.lead_id as string | null) ?? null;
    const lead = lid ? leadInfoMap.get(lid) : undefined;
    return {
      id: n.id as string,
      date: n.date as string,
      body: n.body as string,
      kind: ((n.kind as string) ?? "note") as "note" | "call" | "meeting",
      starts_at: (n.starts_at as string | null) ?? null,
      contact_name: (n.contact_name as string | null) ?? null,
      created_at: n.created_at as string,
      lead_id: lid,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
      lead_data: lead?.data ?? null,
      lead_status: lead?.status ?? null,
    };
  });

  // Callbacky sú v /notifikacie (zvonček), nie v kalendári — kalendár
  // slúži pre cross-role priradenia (obhliadka / realizácia).
  const callbacks: CalendarCallback[] = [];

  // Všeobecné poznámky odstránené — user povedal "vseobecne poznamky to dame
  // inde". Kalendár teraz zaberá plnú šírku.
  void generalNotes;

  // Kalendár + Prehľad — Prehľad obsahuje IBA obsadenosť tímu (obhliadky
  // + realizácie total), nie osobné lead-štatistiky. Real hodnoty prídu
  // po SQL migrácii 10_role_handoff.sql.

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* FILTER BANNER — obchodák/admin klikol v Prehľade na konkrétneho
          člena tímu → kalendár ukáže iba jeho eventy. Klikom na ✕ sa
          resetne. */}
      {filterUserInfo && (
        <div className="rounded-2xl border-2 border-sky-300 bg-gradient-to-br from-sky-50 to-white px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 font-black">
            {filterUserInfo.name
              .split(" ")
              .map((s) => s[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-700">
              Filter — iba kalendár {filterUserInfo.role === "obhliadky" ? "obhliadkára" : filterUserInfo.role === "realizacie" ? "realizátora" : "člena tímu"}
            </div>
            <div className="text-lg font-black leading-tight truncate">
              {filterUserInfo.name}
            </div>
          </div>
          <a
            href={`/calendar${params.m ? `?m=${params.m}` : ""}`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2 text-xs font-black transition-colors"
            title="Vypnúť filter — vrátiť sa na celý tím"
          >
            ✕ Zobraz všetkých
          </a>
        </div>
      )}

      <CalendarGrid
        initialMonth={initialMonth}
        notes={calendarNotes}
        callbacks={callbacks}
        role={me.role}
        assignMode={assignMode}
        assignLead={assignLead}
        manualPick={params.manual === "1" && !params.lead}
      />
      <CalendarStats role={me.role} activeFilterUserId={filterUserInfo?.id ?? null} />
    </div>
  );
}
