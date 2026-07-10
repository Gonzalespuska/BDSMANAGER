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
  const notesQuery = (() => {
    const base = admin
      .from("calendar_notes")
      .select(
        "id, date, body, kind, starts_at, contact_name, target_user_id, user_id, lead_id, created_at",
      )
      .gte("date", fromDate.toISOString().slice(0, 10))
      .lte("date", toDate.toISOString().slice(0, 10))
      .order("created_at", { ascending: true });

    // Admin + Obchodák: vidia VŠETKY kalendáre v tíme (obhliadky + realizácie
    // od každého obhliadkára/realizátora + vlastné note-y).
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

  const calendarNotes: CalendarNote[] = (effectiveNotes ?? []).map((n) => ({
    id: n.id as string,
    date: n.date as string,
    body: n.body as string,
    kind: ((n.kind as string) ?? "note") as "note" | "call" | "meeting",
    starts_at: (n.starts_at as string | null) ?? null,
    contact_name: (n.contact_name as string | null) ?? null,
    created_at: n.created_at as string,
  }));

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
      <CalendarGrid
        initialMonth={initialMonth}
        notes={calendarNotes}
        callbacks={callbacks}
        role={me.role}
        assignMode={assignMode}
        assignLead={assignLead}
        manualPick={params.manual === "1" && !params.lead}
      />
      <CalendarStats role={me.role} />
    </div>
  );
}
