import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server helpers pre notifications bell.
 *
 * Notifikácie zatiaľ deriváme priamo z leads tabuľky — žiadna separátna
 * notifications tabuľka nie je potrebná pre callback-pripomienky.
 * (Neskôr ak pribudnú typy ako "lead won by colleague", "SMS reply",
 * pridáme separátnu notifications tabuľku.)
 *
 * Typy:
 *   - callback_due: lead s next_callback_at <= NOW + 4h
 *   - callback_overdue: lead s next_callback_at < NOW (uplynul reminder)
 *   - new_lead_today: novo pridelený lead bez phone_revealed (status=new)
 *     ktorému ešte agent nezavolal
 */

export type Notification = {
  id: string;
  type:
    | "callback_due"
    | "callback_overdue"
    | "new_lead"
    | "admin_task"
    | "inspection_ready"
    | "reassigned_lead";
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  when_ts: string;
  message: string;
  /** Aktuálny status leadu — user vidí do ktorého tabu má ísť. */
  status?: string;
};

export async function loadNotifications(
  userId: string,
): Promise<Notification[]> {
  if (!userId || userId === "dev-user") return [];
  const admin = createAdminClient();

  const now = new Date();
  const inFourHours = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  // 1. Pending callbacks pre tohto agenta (do 4h alebo už po čase)
  const { data: callbacks } = await admin
    .from("leads")
    .select("id, name, phone, next_callback_at, call_attempts, status")
    .eq("assigned_to", userId)
    .eq("status", "no_answer")
    .not("next_callback_at", "is", null)
    .lte("next_callback_at", inFourHours.toISOString())
    .order("next_callback_at", { ascending: true })
    .limit(30);

  const notifs: Notification[] = [];
  for (const l of callbacks ?? []) {
    if (!l.next_callback_at) continue;
    const callbackAt = new Date(l.next_callback_at);
    const isOverdue = callbackAt <= now;
    notifs.push({
      id: `callback-${l.id}`,
      type: isOverdue ? "callback_overdue" : "callback_due",
      lead_id: l.id,
      lead_name: l.name,
      lead_phone: l.phone,
      when_ts: l.next_callback_at,
      message: "Pripomienka volania",
    });
  }

  // 2. Nové leady — len tie ktorých sa agent ešte vôbec NEDOTKOL:
  //    status=new AND phone_revealed_at IS NULL.
  //    Hneď ako klikne "Odhaliť číslo" alebo zmení status, notifikácia
  //    sa zo zoznamu odstráni.
  const { data: newLeads } = await admin
    .from("leads")
    .select("id, name, phone, created_at")
    .eq("assigned_to", userId)
    .eq("status", "new")
    .is("phone_revealed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const l of newLeads ?? []) {
    notifs.push({
      id: `new-${l.id}`,
      type: "new_lead",
      lead_id: l.id,
      lead_name: l.name,
      lead_phone: l.phone,
      when_ts: l.created_at,
      message: "Nový lead pridelený",
    });
  }

  // 2b. INSPECTION READY — obhliadkár klikol „Odoslať obhliadku" na leade
  //     ktorého mám assigned_to. Musím sa naň pozrieť a poslať CP (alebo
  //     označiť lost). Zmizne len keď zmením status z 'inspected'.
  const { data: inspected } = await admin
    .from("leads")
    .select("id, name, phone, last_activity_at")
    .eq("assigned_to", userId)
    .eq("status", "inspected")
    .order("last_activity_at", { ascending: false })
    .limit(20);
  for (const l of inspected ?? []) {
    notifs.push({
      id: `inspect-${l.id}`,
      type: "inspection_ready",
      lead_id: l.id,
      lead_name: l.name,
      lead_phone: l.phone,
      when_ts: (l.last_activity_at as string) ?? new Date().toISOString(),
      message: "Obhliadka hotová — pošli cenovú ponuku",
    });
  }

  // 2c. REASSIGNED LEAD — lead bol nedávno preradený na tohto agenta
  //     (stolen_at v posledných 24h). User 2026-07-16: „ked si obchodaci
  //     medzi sebou prehodia lead... nech mu pride v tom statuse v ktorom
  //     je... ale standardne pride notifikacia".
  //
  //     Statusy new + phone_revealed už chytáme v „new_lead" resp. iných
  //     špecifických kategóriách — reassigned pokrýva zvyšné stavy
  //     (kontakt/nezdvíhali/scheduled/CP/atď.) aby receiver nezmeškal
  //     nový lead v inom status ako new.
  const reassignCutoff = new Date(
    Date.now() - 24 * 3600_000,
  ).toISOString();
  const { data: reassigned } = await admin
    .from("leads")
    .select("id, name, phone, status, stolen_at, stolen_from")
    .eq("assigned_to", userId)
    .not("stolen_at", "is", null)
    .gte("stolen_at", reassignCutoff)
    // Ak je stále status=new bez phone_revealed, chytí to „new_lead"
    // kategória vyššie — nechceme duplicitu. Filtrujeme na statusy kde
    // reassign nastal už v aktívnom flow.
    .not("status", "in", "(new,won,lost,archived)")
    .order("stolen_at", { ascending: false })
    .limit(20);
  for (const l of reassigned ?? []) {
    notifs.push({
      id: `reassign-${l.id}`,
      type: "reassigned_lead",
      lead_id: l.id,
      lead_name: l.name,
      lead_phone: l.phone,
      status: l.status as string,
      when_ts: l.stolen_at as string,
      message: "Preradené na teba",
    });
  }

  // 3. Reminder-y z office_reminders — priradené tomuto userovi, NIE dismissed.
  //    Kritérium:
  //    - Ak je remind_at (presný čas), pripomienka je viditeľná od remind_at.
  //    - Ak je len remind_date (deň), viditeľná od 00:00 daného dňa.
  const nowIsoStr = new Date().toISOString();
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: tasks } = await admin
    .from("office_reminders")
    .select("id, note, remind_date, remind_at, lead_id, note_kind, created_at")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .or(`remind_at.lte.${nowIsoStr},and(remind_at.is.null,remind_date.lte.${todayIso})`)
    .order("remind_at", { ascending: true, nullsFirst: false })
    .limit(30);
  for (const t of tasks ?? []) {
    const isLeadNote = t.note_kind === "lead_note" && t.lead_id;
    notifs.push({
      id: `task-${t.id}`,
      type: "admin_task",
      lead_id: (t.lead_id as string | null) ?? "",
      lead_name: (t.note as string).slice(0, 80),
      lead_phone: null,
      when_ts: (t.remind_at as string | null) ?? (t.remind_date + "T09:00:00Z"),
      message: isLeadNote ? "Pripomienka k leadu" : "Úloha od admina",
    });
  }

  // Zoradíme podľa času (najprv admin úlohy → overdue → recent new → due)
  notifs.sort((a, b) => {
    const priority = (n: Notification) =>
      n.type === "admin_task"
        ? 0
        : n.type === "callback_overdue"
          ? 1
          : n.type === "inspection_ready"
            ? 2
            : n.type === "new_lead"
              ? 3
              : 4;
    if (priority(a) !== priority(b)) return priority(a) - priority(b);
    return new Date(a.when_ts).getTime() - new Date(b.when_ts).getTime();
  });

  return notifs.slice(0, 20);
}
