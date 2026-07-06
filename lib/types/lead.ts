/**
 * Typy pre lead — minimum z DB row schémy.
 * Drží sa SQL definície v supabase/schema.sql.
 */

export type LeadStatus =
  | "new"
  | "phone_revealed"
  | "no_answer"
  | "scheduled"
  | "interested"
  | "not_interested"
  | "quote_sent"
  | "needs_inspection"
  /**
   * Obhliadnutý — obhliadka prebehla (dátum + čas priradenia prešiel).
   * Auto-transition z quote_sent → inspected sa vykoná cron workerom
   * po prejdení `inspection_at` času. Lead ostane v tomto stave až kým
   * obchodák neposunie na `in_realization` alebo `won` / `lost`.
   */
  | "inspected"
  | "in_realization"
  | "won"
  | "lost"
  | "archived";

export type LeadPriority = "low" | "medium" | "high";

export type SlaStatus = "pending" | "met" | "breached" | "n/a";

export type LeadSourceType =
  | "web_webhook"
  | "facebook"
  | "instagram"
  | "google"
  | "whatsapp"
  | "email"
  | "tiktok"
  | "linkedin"
  | "bazos"
  | "topreality"
  | "manual"
  | "other";

export interface Lead {
  id: string;
  source_id: string | null;
  source_type: LeadSourceType | string;
  source_campaign: string | null;
  name: string;
  phone: string | null;
  phone_revealed_at: string | null;
  phone_revealed_by: string | null;
  email: string | null;
  data: Record<string, unknown>;
  status: LeadStatus;
  priority: LeadPriority;
  value_estimate: number | null;
  assigned_to: string | null;
  /** Hydrated name of the agent who owns this lead — enriched on server. */
  assigned_user_name?: string | null;
  call_attempts: number;
  next_callback_at: string | null;
  first_contact_at: string | null;
  last_activity_at: string;
  created_at: string;
  sla_deadline: string | null;
  sla_status: SlaStatus;
  /** Termín obhliadky (kedy má obhliadkár ísť). */
  inspection_at?: string | null;
  /** Priradený obhliadkár. */
  inspection_by?: string | null;
  /** Meno obhliadkára — enriched na serveri. */
  inspection_by_name?: string | null;
  /** Termín realizácie. */
  realization_at?: string | null;
  /** Priradený realizátor. */
  realization_by?: string | null;
  realization_by_name?: string | null;
}

/** Display label pre source_type — používa LeadCard + Lead list */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  web_webhook: "🌐 Web",
  facebook: "📘 Facebook",
  instagram: "📸 Instagram",
  google: "🔍 Google",
  whatsapp: "💬 WhatsApp",
  email: "📧 Email",
  tiktok: "🎵 TikTok",
  linkedin: "💼 LinkedIn",
  bazos: "🏷️ Bazoš",
  topreality: "🏠 Topreality",
  manual: "✍️ Manuálne",
  other: "📥 Iné",
};

/**
 * Display meta pre status pill.
 *
 * IMPORTANT: label-y musia MATCHOVAŤ tab-y v `/agent` (TABS array v
 * app/agent/page.tsx) — inak user vidí v hornej liste iné názvy ako
 * v badge na leade, a nedá to logicky zladiť.
 *
 * Tabs → status mapping:
 *   🆕 Nové       → new
 *   📞 Kontakt    → phone_revealed
 *   🟡 Nezdvíhali → no_answer
 *   ✅ CP         → interested + quote_sent
 *   🏆 Ukončené   → won
 *   📦 Archivované→ archived + lost + not_interested
 */
export const STATUS_META: Record<
  LeadStatus,
  { label: string; pill: string }
> = {
  new: {
    label: "🆕 NOVÉ",
    pill: "bg-red-500 text-white",
  },
  phone_revealed: {
    label: "📞 KONTAKT",
    pill: "bg-blue-500 text-white",
  },
  no_answer: {
    label: "🟡 NEZDVÍHALI",
    pill: "bg-amber-500 text-white",
  },
  scheduled: {
    label: "📅 NAPLÁNOVANÉ",
    pill: "bg-purple-500 text-white",
  },
  interested: {
    label: "✅ CP",
    pill: "bg-emerald-600 text-white",
  },
  not_interested: {
    label: "❌ NEZÁUJEM",
    pill: "bg-zinc-500 text-white",
  },
  quote_sent: {
    label: "✅ CP POSLANÁ",
    pill: "bg-violet-600 text-white",
  },
  needs_inspection: {
    label: "🔍 NA OBHLIADKU",
    pill: "bg-violet-500 text-white",
  },
  inspected: {
    label: "✔️ OBHLIADNUTÝ",
    pill: "bg-teal-600 text-white",
  },
  in_realization: {
    label: "🔨 V REALIZÁCII",
    pill: "bg-emerald-600 text-white",
  },
  won: {
    label: "🏆 UKONČENÉ",
    pill: "bg-green-700 text-white",
  },
  lost: {
    label: "💔 STRATENÝ",
    pill: "bg-red-700 text-white",
  },
  archived: {
    label: "📦 ARCHIVOVANÉ",
    pill: "bg-zinc-400 text-white",
  },
};

/** SLA badge state — 3 states namiesto 2 */
export type SlaBadgeState = "met" | "approaching" | "breached" | "pending" | "na";

/**
 * Vyhodnotí SLA badge state pre lead na základe deadline.
 * Approaching = deadline o menej ako 25% pôvodného času.
 */
export function getSlaBadgeState(lead: {
  sla_deadline: string | null;
  sla_status: SlaStatus;
  created_at: string;
}): SlaBadgeState {
  if (lead.sla_status === "met") return "met";
  if (lead.sla_status === "breached") return "breached";
  if (lead.sla_status === "n/a") return "na";
  if (!lead.sla_deadline) return "pending";

  const now = Date.now();
  const deadline = new Date(lead.sla_deadline).getTime();
  const created = new Date(lead.created_at).getTime();

  if (now > deadline) return "breached";

  const total = deadline - created;
  const remaining = deadline - now;
  if (total > 0 && remaining / total < 0.25) return "approaching";

  return "pending";
}

export const SLA_BADGE_META: Record<
  SlaBadgeState,
  { label: string; className: string } | null
> = {
  met: {
    label: "🟢 v SLA",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  approaching: {
    label: "🟡 blíži sa",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  breached: {
    label: "🔴 mimo SLA",
    className: "bg-red-100 text-red-800 border-red-200 animate-pulse",
  },
  pending: null,
  na: null,
};

/** "pred X" formátovanie do slovenčiny — minúty + hodiny + dni */
export function timeAgo(d: string | Date): string {
  const totalSeconds = Math.floor(
    (Date.now() - new Date(d).getTime()) / 1000,
  );
  if (totalSeconds < 60) return "práve teraz";
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return totalMinutes === 1 ? "pred 1 min" : `pred ${totalMinutes} min`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const minutesPart = totalMinutes % 60;
  if (totalHours < 24) {
    // pred 4h 12min  /  pred 1h (ak presne 0 min)
    if (minutesPart === 0) {
      return totalHours === 1 ? "pred 1 hod" : `pred ${totalHours} hod`;
    }
    return `pred ${totalHours}h ${minutesPart}min`;
  }
  const totalDays = Math.floor(totalHours / 24);
  const hoursPart = totalHours % 24;
  if (totalDays < 30) {
    if (hoursPart === 0) {
      return totalDays === 1 ? "pred 1 dňom" : `pred ${totalDays} dňami`;
    }
    return totalDays === 1
      ? `pred 1 dňom ${hoursPart}h`
      : `pred ${totalDays}d ${hoursPart}h`;
  }
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(d));
}
