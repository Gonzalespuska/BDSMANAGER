"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  PhoneOff,
  X,
} from "lucide-react";

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
  recordMissedCallAction,
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

  // WhatsApp deep link — funguje na mobile aj desktop (web.whatsapp.com)
  const whatsappHref = lead.phone
    ? `https://wa.me/${lead.phone.replace(/[^\d+]/g, "")}`
    : null;
  const emailHref = lead.email ? `mailto:${lead.email}` : null;

  return (
    <>
      <article className="rounded-2xl border bg-background shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        {/* Top row: status pill + priority + SLA + source/time */}
        <div className="px-4 sm:px-5 pt-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full",
                statusMeta.pill,
              )}
            >
              {statusMeta.label}
            </span>
            {lead.priority === "high" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                ⚡ HIGH
              </span>
            )}
            {lead.call_attempts > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border",
                  lead.call_attempts >= 3
                    ? "bg-red-100 text-red-800 border-red-200"
                    : "bg-amber-100 text-amber-800 border-amber-200",
                )}
              >
                <AlertCircle className="w-3 h-3" aria-hidden />
                {lead.call_attempts}× nedvíha
              </span>
            )}
            {slaBadge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border",
                  slaBadge.className,
                )}
              >
                {slaBadge.label}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <span className="font-semibold">{sourceLabel}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden />
              {timeAgo(lead.created_at)}
            </span>
          </div>
        </div>

        {/* Name + campaign */}
        <div className="px-4 sm:px-5 pt-3">
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
            {lead.name}
          </h2>
          {lead.source_campaign && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {lead.source_campaign}
            </p>
          )}
        </div>

        {/* Phone — primary CTA alebo revealed number */}
        <div className="px-4 sm:px-5 pt-3">
          {!isRevealed && lead.phone ? (
            <Button
              type="button"
              onClick={handleCall}
              disabled={busy}
              size="lg"
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold text-base px-6 h-12 shadow-[0_4px_14px_rgba(22,163,74,0.35)]"
            >
              <Phone className="w-5 h-5 mr-2" aria-hidden />
              ZAVOLAŤ
            </Button>
          ) : isRevealed && lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex items-center gap-2 text-2xl md:text-3xl font-extrabold text-emerald-700 hover:text-emerald-900 tracking-tight"
            >
              <Phone className="w-6 h-6 md:w-7 md:h-7" aria-hidden />
              {lead.phone}
            </a>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              Telefón nie je k dispozícii — kontaktuj cez email
            </div>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="mt-1.5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Mail className="w-4 h-4" aria-hidden />
              {lead.email}
            </a>
          )}
        </div>

        {/* Info bits (custom fields) */}
        {infoBits.length > 0 && (
          <div className="px-4 sm:px-5 pt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {infoBits.map((bit, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-foreground text-sm font-semibold"
              >
                {bit}
              </span>
            ))}
          </div>
        )}

        {/* Message excerpt */}
        {typeof dataFields.message === "string" && dataFields.message && (
          <div className="px-4 sm:px-5 pt-3">
            <p className="text-sm text-muted-foreground leading-snug line-clamp-2 italic">
              „{dataFields.message}"
            </p>
          </div>
        )}

        {/* Callback timer */}
        {lead.next_callback_at && (
          <div className="px-4 sm:px-5 pt-3 text-xs text-blue-700 inline-flex items-center gap-1.5 font-semibold">
            <Calendar className="w-3.5 h-3.5" aria-hidden />
            Ďalší pokus: {new Date(lead.next_callback_at).toLocaleString("sk-SK")}
          </div>
        )}

        {/* Action bar — secondary buttons + outcome */}
        <div className="px-4 sm:px-5 pt-4 pb-4 mt-3 border-t bg-muted/30">
          {/* Outcome buttons — iba ak je číslo odhalené */}
          {isRevealed && lead.status !== "archived" && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden />
                Zdvihla
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

          {/* Secondary actions — vždy viditeľné */}
          <div className="grid grid-cols-3 gap-2">
            {whatsappHref ? (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1" aria-hidden />
                  WhatsApp
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-9" disabled>
                <MessageCircle className="w-3.5 h-3.5 mr-1" aria-hidden />
                WhatsApp
              </Button>
            )}
            {emailHref ? (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={emailHref}>
                  <Mail className="w-3.5 h-3.5 mr-1" aria-hidden />
                  Email
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-9" disabled>
                <Mail className="w-3.5 h-3.5 mr-1" aria-hidden />
                Email
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href={`/agent/leads/${lead.id}`}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" aria-hidden />
                Detail
              </Link>
            </Button>
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
