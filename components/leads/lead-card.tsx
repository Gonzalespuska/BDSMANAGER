"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Hand,
  Mail,
  Phone,
  PhoneOff,
  X,
} from "lucide-react";

import { LeadNotesInline } from "./lead-notes-inline";
import { LeadStatusPicker } from "./lead-status-picker";

import { Button } from "@/components/ui/button";
import {
  getSlaBadgeState,
  Lead,
  SLA_BADGE_META,
  SOURCE_TYPE_LABELS,
  STATUS_META,
  timeAgo,
} from "@/lib/types/lead";
import { cn } from "@/lib/utils";
import {
  changeStatusInlineAction,
  claimLeadAction,
  recordMissedCallAction,
  returnLeadAction,
  revealPhoneAction,
  updateLeadOutcomeAction,
} from "@/app/agent/actions";

/**
 * LeadCard — primary UI element pre agenta.
 * Spec: "One-thumb agent flow — handle lead in 2 taps (Call → Outcome)".
 *
 * Default state: zobrazí 📞 ZAVOLAŤ tlačidlo — kliknutie:
 *   1. revealPhoneAction() (server, async — logs phone_revealed_at, SLA)
 *   2. window.location = tel:<phone> — otvorí dialer na mobile
 *
 * Po hovore agent klikne výsledok (✅ záujem / ❌ nezáujem / 📵 nedvíha / 📅 callback)
 */
export function LeadCard({ lead: initialLead }: { lead: Lead }) {
  const [lead, setLead] = React.useState(initialLead);
  const [busy, setBusy] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);

  const statusMeta = STATUS_META[lead.status];
  const sourceLabel =
    SOURCE_TYPE_LABELS[lead.source_type] ?? `📥 ${lead.source_type}`;
  const isRevealed = Boolean(lead.phone_revealed_at);
  const slaBadge = SLA_BADGE_META[getSlaBadgeState(lead)];

  const dataFields = lead.data as Record<string, string | number | undefined>;
  const infoBits = [
    dataFields.plocha ? `${dataFields.plocha} m²` : null,
    dataFields.priestor,
    dataFields.typ_podlahy,
    dataFields.lokalita,
    dataFields.termin,
  ].filter(Boolean) as string[];

  async function handleCall() {
    if (!lead.phone) return;
    setBusy(true);
    // Reveal (server action) — log SLA + audit
    const result = await revealPhoneAction(lead.id);
    if (result.ok) {
      setLead({
        ...lead,
        phone_revealed_at: new Date().toISOString(),
        status: lead.status === "new" ? "phone_revealed" : lead.status,
      });
      // Trigger tel: dialer (na mobile otvorí volacie tlačidlo, na desktop často no-op)
      window.location.href = `tel:${lead.phone}`;
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  async function handleMissedCall() {
    setBusy(true);
    const result = await recordMissedCallAction(lead.id);
    if (result.ok) {
      setLead({
        ...lead,
        call_attempts: lead.call_attempts + 1,
        status: result.archived ? "archived" : "no_answer",
      });
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  /**
   * "Kontakt" — agent volal a zákazník zdvihol.
   * Nech sa lead presunie do "Kontakt" tabu (status zostáva phone_revealed
   * — to už nastavila revealPhoneAction). Tu len značíme last_activity_at
   * cez inline status change a refetch.
   */
  async function handleContact() {
    setBusy(true);
    const result = await changeStatusInlineAction(lead.id, "phone_revealed");
    if (result.ok) {
      setLead({ ...lead, status: "phone_revealed" });
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  // WhatsApp deep link — funguje na mobile aj desktop (web.whatsapp.com)
  const whatsappHref = lead.phone
    ? `https://wa.me/${lead.phone.replace(/[^\d+]/g, "")}`
    : null;
  const emailHref = lead.email ? `mailto:${lead.email}` : null;

  // Status color pre vertical accent strip (vľavo)
  const accentColor =
    lead.status === "new"
      ? "bg-red-500"
      : lead.status === "phone_revealed"
        ? "bg-blue-500"
        : lead.status === "no_answer"
          ? "bg-amber-500"
          : lead.status === "interested" || lead.status === "quote_sent"
            ? "bg-emerald-500"
            : lead.status === "won"
              ? "bg-green-600"
              : "bg-zinc-400";

  return (
    <>
      <article className="relative rounded-2xl border bg-background shadow-sm hover:shadow-md transition-shadow overflow-hidden flex">
        {/* Left accent strip — farba podľa statusu */}
        <div className={cn("w-1.5 shrink-0", accentColor)} aria-hidden />

        <div className="flex-1 min-w-0">
          {/* Top row: badges + source/time */}
          <div className="px-5 pt-4 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <LeadStatusPicker
                leadId={lead.id}
                status={lead.status}
                onChange={(s) => setLead({ ...lead, status: s })}
              />
              {lead.call_attempts > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md",
                    lead.call_attempts >= 3
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800",
                  )}
                >
                  <AlertCircle className="w-3 h-3" aria-hidden />
                  {lead.call_attempts}× nedvíha
                </span>
              )}
              {slaBadge && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md",
                    slaBadge.className,
                  )}
                >
                  {slaBadge.label}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 shrink-0">
              <span className="font-semibold">{sourceLabel}</span>
              <span className="text-muted-foreground/40">·</span>
              <Clock className="w-3 h-3" aria-hidden />
              <span>{timeAgo(lead.created_at)}</span>
            </div>
          </div>

          {/* Name + campaign */}
          <div className="px-5 pt-3">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight">
              {lead.name}
            </h2>
            {lead.source_campaign && (
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                {lead.source_campaign}
              </p>
            )}
          </div>

          {/* Phone display — revealed = velký zelený, nerevealed = subtle hint */}
          <div className="px-5 pt-3">
            {isRevealed && lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-2 text-2xl md:text-3xl font-extrabold text-emerald-700 hover:text-emerald-900 tracking-tight"
              >
                <Phone className="w-6 h-6 md:w-7 md:h-7" aria-hidden />
                {lead.phone}
              </a>
            ) : null}
            {!lead.phone && (
              <div className="text-sm text-muted-foreground">
                Telefón nie je k dispozícii. Kontaktuj cez email.
              </div>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Mail className="w-4 h-4" aria-hidden />
                {lead.email}
              </a>
            )}
          </div>

          {/* Info bits (custom fields) */}
          {infoBits.length > 0 && (
            <div className="px-5 pt-4 flex flex-wrap items-center gap-1.5">
              {infoBits.map((bit, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-800 text-xs font-semibold"
                >
                  {bit}
                </span>
              ))}
            </div>
          )}

          {/* Message excerpt — pekný blockquote namiesto italic kvôli AI vibe */}
          {typeof dataFields.message === "string" && dataFields.message && (
            <div className="px-5 pt-3">
              <div className="border-l-2 border-zinc-300 pl-3 py-0.5">
                <p className="text-sm text-zinc-700 leading-snug line-clamp-2">
                  {dataFields.message}
                </p>
              </div>
            </div>
          )}

          {/* Inline poznámka agenta */}
          <div className="px-5 pt-3">
            <LeadNotesInline
              leadId={lead.id}
              initialNote={
                typeof dataFields.agent_note === "string"
                  ? dataFields.agent_note
                  : ""
              }
            />
          </div>

          {/* Callback timer */}
          {lead.next_callback_at && (
            <div className="px-5 pt-3 text-xs text-blue-700 inline-flex items-center gap-1.5 font-semibold">
              <Calendar className="w-3.5 h-3.5" aria-hidden />
              Ďalší pokus: {new Date(lead.next_callback_at).toLocaleString("sk-SK")}
            </div>
          )}

          {/* Action bar */}
          <div className="px-5 pt-4 pb-4 mt-4 border-t bg-zinc-50/60">
          {/* Outcome buttons — iba ak je číslo odhalené */}
          {isRevealed && lead.status !== "archived" && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Button
                type="button"
                onClick={handleContact}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11"
                title="Zdvihla → presunie do Kontakt tabu, tam klasifikuj"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden />
                Kontakt
              </Button>
              <Button
                type="button"
                onClick={handleMissedCall}
                disabled={busy}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-11"
              >
                <PhoneOff className="w-4 h-4 mr-1.5" aria-hidden />
                Nedvíha
                {lead.call_attempts > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-white/25 text-[10px] font-bold">
                    {lead.call_attempts}×
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* Claim banner / Kontakt riadok podľa stavu */}
          {!lead.assigned_to ? (
            <ClaimBanner
              leadId={lead.id}
              onClaimed={(meName) =>
                setLead({
                  ...lead,
                  assigned_to: "self",
                  assigned_user_name: meName,
                })
              }
              busy={busy}
              setBusy={setBusy}
            />
          ) : (
            <AssignedBanner
              name={lead.assigned_user_name}
              leadId={lead.id}
              status={lead.status}
              onReturned={() =>
                setLead({ ...lead, assigned_to: null, assigned_user_name: null })
              }
            />
          )}

          {/* Hlavná akcia row: Email + Zavolať + Ponuka + Detail */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {emailHref ? (
              <Button asChild variant="outline" size="sm" className="h-10">
                <a href={emailHref}>
                  <Mail className="w-4 h-4 mr-1.5" aria-hidden />
                  Email
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-10" disabled>
                <Mail className="w-4 h-4 mr-1.5" aria-hidden />
                Email
              </Button>
            )}
            {lead.phone ? (
              <Button
                type="button"
                onClick={handleCall}
                disabled={busy}
                size="sm"
                title={
                  isRevealed
                    ? "Vytočiť — telefón je odhalený"
                    : "Klikni — odhalí sa číslo a otvorí dialer"
                }
                className="h-10 bg-green-600 hover:bg-green-700 text-white font-bold shadow-[0_3px_10px_rgba(22,163,74,0.3)] flex flex-col items-center justify-center leading-none gap-0.5"
              >
                <span className="inline-flex items-center">
                  <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                  Zavolať
                </span>
                {!isRevealed && (
                  <span className="text-[10px] font-medium opacity-90 uppercase tracking-wider">
                    klikni → odhalí číslo
                  </span>
                )}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-10" disabled>
                <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                Zavolať
              </Button>
            )}
            <Button
              asChild
              size="sm"
              className="h-10 bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-[0_3px_10px_rgba(2,132,199,0.3)]"
            >
              <Link href={`/generator?lead=${lead.id}`}>
                <Calculator className="w-4 h-4 mr-1.5" aria-hidden />
                Ponuka
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10">
              <Link href={`/agent/leads/${lead.id}`}>
                <ExternalLink className="w-4 h-4 mr-1.5" aria-hidden />
                Detail
              </Link>
            </Button>
          </div>
        </div>
        </div>
      </article>

      {modalOpen && (
        <OutcomeModal
          lead={lead}
          onClose={() => setModalOpen(false)}
          onSaved={(newStatus) => {
            setLead({ ...lead, status: newStatus });
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// Modal — "Výsledok hovoru"
// ============================================================================

function OutcomeModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: (newStatus: Lead["status"]) => void;
}) {
  const [outcome, setOutcome] = React.useState<
    "interested" | "scheduled" | "quote_sent" | "not_interested" | "won" | "lost"
  >("interested");
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("10:00");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setBusy(true);
    const formData = new FormData();
    formData.set("lead_id", lead.id);
    formData.set("status", outcome);
    formData.set("note", note);
    if (outcome === "scheduled" && date && time) {
      formData.set("callback_at", new Date(`${date}T${time}`).toISOString());
    }
    const result = await updateLeadOutcomeAction(formData);
    setBusy(false);
    if (result.ok) {
      onSaved(outcome);
    } else {
      alert(`Chyba: ${result.error}`);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">
            Výsledok hovoru — {lead.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Zavrieť"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
            <div>
              📞 <strong>{lead.phone}</strong>
              {lead.email && (
                <>
                  {" · 📧 "}
                  {lead.email}
                </>
              )}
            </div>
            <div className="text-muted-foreground">
              {SOURCE_TYPE_LABELS[lead.source_type] ?? lead.source_type} ·{" "}
              {timeAgo(lead.created_at)}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Výsledok hovoru
            </div>
            <div className="space-y-1.5">
              <RadioRow
                checked={outcome === "interested"}
                onChange={() => setOutcome("interested")}
                icon="✅"
                label="Zdvihla — záujem"
              />
              <RadioRow
                checked={outcome === "scheduled"}
                onChange={() => setOutcome("scheduled")}
                icon="📅"
                label="Zdvihla — chce volať neskôr"
              />
              {outcome === "scheduled" && (
                <div className="ml-7 grid grid-cols-2 gap-2 mt-1">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="px-3 py-2 rounded-lg border bg-background text-sm"
                  />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="px-3 py-2 rounded-lg border bg-background text-sm"
                  />
                </div>
              )}
              <RadioRow
                checked={outcome === "quote_sent"}
                onChange={() => setOutcome("quote_sent")}
                icon="📋"
                label="Poslať cenovú ponuku"
              />
              <RadioRow
                checked={outcome === "not_interested"}
                onChange={() => setOutcome("not_interested")}
                icon="❌"
                label="Zdvihla — nemá záujem"
              />
              <RadioRow
                checked={outcome === "won"}
                onChange={() => setOutcome("won")}
                icon="🏆"
                label="Vyhraný (podpísaná zmluva)"
              />
              <RadioRow
                checked={outcome === "lost"}
                onChange={() => setOutcome("lost")}
                icon="💔"
                label="Stratený"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Poznámka
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Detaily hovoru, dohodnuté kroky…"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2 pt-3 border-t">
            <Button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="flex-1 h-11"
            >
              {busy ? "Ukladám…" : "Uložiť"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="h-11"
            >
              Zrušiť
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  icon,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  icon: string;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
        checked
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
          : "border-border hover:border-foreground/20 hover:bg-muted/40",
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-blue-500"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">
          {icon} {label}
        </div>
      </div>
    </label>
  );
}

/**
 * ClaimBanner — zobrazí sa na nepriradených leadoch (assigned_to=null).
 * Klik na "Prevziať" → claimLeadAction, lead sa zviaže k tomuto agentovi.
 * Race-condition handled na serveri (atomic UPDATE ... WHERE assigned_to IS NULL).
 *
 * onClaimed dostane meno z server actionu (čerstvo z DB) takže aj v dev
 * móde s mock cache fungs správne.
 */
function ClaimBanner({
  leadId,
  onClaimed,
  busy,
  setBusy,
}: {
  leadId: string;
  onClaimed: (userName: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  async function claim() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await claimLeadAction(leadId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClaimed(res.user_name);
  }
  return (
    <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50 dark:bg-sky-950/30 p-3 flex items-center justify-between gap-3">
      <div className="text-sm text-sky-900 dark:text-sky-200">
        <strong>Nepriradený lead</strong> — prevezmi si ho ak ho chceš spracovať.
        {error && (
          <span className="ml-2 text-destructive font-medium">⚠ {error}</span>
        )}
      </div>
      <Button
        type="button"
        onClick={claim}
        disabled={busy}
        size="sm"
        className="h-9 bg-sky-600 hover:bg-sky-700 text-white font-bold shrink-0"
      >
        <Hand className="w-4 h-4 mr-1.5" aria-hidden />
        {busy ? "Beriem…" : "Prevziať"}
      </Button>
    </div>
  );
}

/**
 * AssignedBanner — keď je lead pridelený (claimed). Ukazuje meno kontaktu
 * + "Vrátiť" tlačidlo (assigned_to → NULL, lead sa zviera v systéme pre
 * iného agenta).
 *
 * "Vrátiť" je zakázané pre finálne statusy (won/lost/archived).
 */
function AssignedBanner({
  name,
  leadId,
  status,
  onReturned,
}: {
  name: string | null | undefined;
  leadId: string;
  status: string;
  onReturned: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Vrátiť sa dá LEN ak ešte lead nebol kontaktovaný — status = "new".
  // Po kliknutí "Kontakt" (status → phone_revealed) už agent nemôže
  // zákazníka "hodiť späť do systému" — má za neho zodpovednosť.
  const canReturn = status === "new";

  async function doReturn() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await returnLeadAction(leadId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirming(false);
    onReturned();
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <strong>Vrátiť lead?</strong> Lead bude opäť voľný pre iného agenta.
          {error && (
            <span className="ml-2 text-destructive font-medium">⚠ {error}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={doReturn}
            disabled={busy}
            size="sm"
            variant="outline"
            className="h-8 border-amber-400 text-amber-900 hover:bg-amber-100"
          >
            {busy ? "Vraciam…" : "Áno, vrátiť"}
          </Button>
          <Button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            size="sm"
            variant="ghost"
            className="h-8"
          >
            Zrušiť
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
      <div className="inline-flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-200">
        <Hand className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="font-semibold">Kontakt:</span>
        <span>{name ?? "—"}</span>
      </div>
      {canReturn && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-semibold text-emerald-800/80 hover:text-emerald-900 hover:underline"
        >
          ↩ Vrátiť do systému
        </button>
      )}
    </div>
  );
}
