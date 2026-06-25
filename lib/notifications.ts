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
  type: "callback_due" | "callback_overdue" | "new_lead";
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  when_ts: string;
  message: string;
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
      message: isOverdue
        ? `Skúsiť volať znova (${l.call_attempts}× nezdvihol)`
        : `Pripomienka volania za chvíľu`,
    });
  }

  // 2. Nové leady (status=new) ktoré agent ešte nevidel — limit posledných 5
  const { data: newLeads } = await admin
    .from("leads")
    .select("id, name, phone, created_at")
    .eq("assigned_to", userId)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(5);

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

  // Zoradíme podľa času (najprv najurgentnejšie = overdue → recent new → due)
  notifs.sort((a, b) => {
    const priority = (n: Notification) =>
      n.type === "callback_overdue" ? 0 : n.type === "new_lead" ? 1 : 2;
    if (priority(a) !== priority(b)) return priority(a) - priority(b);
    return new Date(a.when_ts).getTime() - new Date(b.when_ts).getTime();
  });

  return notifs.slice(0, 20);
}
