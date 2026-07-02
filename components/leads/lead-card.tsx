"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Clock,
  Hand,
  Mail,
  Phone,
  PhoneOff,
  X,
} from "lucide-react";

import { CallbackReminder } from "./callback-reminder";
import { HandoffActions } from "./handoff-actions";
import { LeadNotesInline } from "./lead-notes-inline";
import { LeadStatusPicker } from "./lead-status-picker";

import { Button } from "@/components/ui/button";
import {
  Lead,
  SOURCE_TYPE_LABELS,
  STATUS_META,
  timeAgo,
} from "@/lib/types/lead";
import { cn } from "@/lib/utils";
import {
  archiveLeadAction,
  changeStatusInlineAction,
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

  const dataFields = lead.data as Record<string, string | number | undefined>;
  // Termín má vlastný prominentný badge (kedy chce zákazník realizovať) —
  // pre obchodníka je to kľúčová info: urgentné vs "iba info" má inú prioritu.
  const terminValue = dataFields.termin as string | undefined;
  const infoBits = [
    dataFields.plocha ? `${dataFields.plocha} m²` : null,
    dataFields.priestor,
    dataFields.typ_podlahy,
    dataFields.lokalita,
  ].filter(Boolean) as string[];

  async function handleCall() {
    if (!lead.phone) return;
    // Optimistic UI — okamžite odhalíme číslo v UI, fetch ide na pozadí.
    // Ak server zlyhá, vrátime UI späť do pôvodného stavu.
    const prev = lead;
    setLead({
      ...lead,
      phone_revealed_at: new Date().toISOString(),
    });
    try {
      const r = await fetch("/api/lead/reveal-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      const json = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !json.ok) {
        setLead(prev);
        alert(`Chyba: ${json.error ?? `HTTP ${r.status}`}`);
      }
    } catch (e) {
      setLead(prev);
      alert(`Chyba: ${e instanceof Error ? e.message : "network"}`);
    }
  }

  // Unified helper — všetky akcie cez /api/lead/action
  async function callLeadAction(
    action: string,
    extra?: Record<string, unknown>,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
    try {
      const r = await fetch("/api/lead/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, action, ...(extra ?? {}) }),
      });
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok || !json.ok) {
        return {
          ok: false,
          error: (json.error as string) ?? `HTTP ${r.status}`,
        };
      }
      return { ok: true, data: json };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network" };
    }
  }

  async function handleMissedCall() {
    // Optimistic — okamžite zmeň UI, fetch ide na pozadí
    const prev = lead;
    setLead({
      ...lead,
      call_attempts: lead.call_attempts + 1,
      status: "no_answer",
    });
    const result = await callLeadAction("missed_call");
    if (!result.ok) {
      setLead(prev);
      alert(`Chyba: ${result.error}`);
    } else if (typeof result.data.attempts === "number") {
      // Server potvrdil presný attempts count
      setLead((cur) => ({ ...cur, call_attempts: result.data.attempts as number }));
    }
  }

  async function handleArchive() {
    if (
      !confirm(
        "Archivovať lead?\n\n" +
          "Lead pôjde do Archív tabu a zákazníkovi sa pošle automatický SMS + Email follow-up " +
          "(zatial placeholder — funkčnosť dorobíme po pripojení SMS a Resend providerov).",
      )
    )
      return;
    const prev = lead;
    setLead({ ...lead, status: "archived" });
    const result = await callLeadAction("archive");
    if (!result.ok) {
      setLead(prev);
      alert(`Chyba: ${result.error}`);
    }
  }

  /**
   * "Kontakt" — agent volal a zákazník zdvihol.
   */
  async function handleContact() {
    const prev = lead;
    setLead({ ...lead, status: "phone_revealed" });
    const result = await callLeadAction("contact");
    if (!result.ok) {
      setLead(prev);
      alert(`Chyba: ${result.error}`);
    }
  }

  // WhatsApp deep link — funguje na mobile aj desktop (web.whatsapp.com)
  const whatsappHref = lead.phone
    ? `https://wa.me/${lead.phone.replace(/[^\d+]/g, "")}`
    : null;
  // Gmail compose v novom tabe — funguje pre lognutý Google Workspace
  // (vrátane custom domén ako @epoxidovo.sk). Subject TODO: konfigurovateľný
  // v admin UI; zatiaľ hardcoded.
  const emailHref = lead.email
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        lead.email,
      )}&su=${encodeURIComponent("Epoxidovo.sk, Dopyt")}`
    : null;

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
              {/* SLA badge odstránený z agent view — agent vidí kedy odhalil
                  číslo z aktivity timestampu. Metrika zostáva v DB pre admin. */}
            </div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 shrink-0">
              <span className="font-semibold">{sourceLabel}</span>
              <span className="text-muted-foreground/40">·</span>
              <Clock className="w-3 h-3" aria-hidden />
              <span>{timeAgo(lead.created_at)}</span>
            </div>
          </div>

          {/* Name — source_campaign (keyword z reklamy) je viditeľný iba
              v admin panely. Pre obchodáka by to bolo iba šum. */}
          <div className="px-5 pt-3">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight">
              {lead.name}
            </h2>
          </div>

          {/* Phone + email vľavo, callback pripomienka vpravo */}
          <div className="px-5 pt-3 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
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
            {lead.email ? (
              <a
                href={emailHref ?? `mailto:${lead.email}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 text-lg md:text-xl font-extrabold text-foreground hover:text-emerald-700 break-all leading-tight"
              >
                <Mail className="w-5 h-5 md:w-6 md:h-6 shrink-0" aria-hidden />
                {lead.email}
              </a>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground/70">
                <Mail className="w-4 h-4 shrink-0" aria-hidden />
                Email neznámy
              </div>
            )}
            </div>

            {/* Callback reminder vpravo */}
            {lead.next_callback_at && (
              <CallbackReminder when={lead.next_callback_at} />
            )}
          </div>

          {/* Termín realizácie — prominentný badge (najdôležitejšia info
              pre obchodníka: 'Urgentne do mesiaca' vs 'Zatiaľ info' = úplne
              iná priorita hovoru). */}
          {terminValue && (
            <div className="px-5 pt-3">
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border-2 text-xs font-bold",
                  /urgent|urgentne|do 1|do jedn/i.test(terminValue)
                    ? "bg-rose-50 border-rose-300 text-rose-800"
                    : /iba info|len info|prieskum/i.test(terminValue)
                      ? "bg-zinc-50 border-zinc-300 text-zinc-700"
                      : "bg-amber-50 border-amber-300 text-amber-800",
                )}
                title="Kedy chce zákazník realizovať"
              >
                📅 Kedy: <span className="font-extrabold">{terminValue}</span>
              </div>
            </div>
          )}

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

          {/* Callback reminder zobrazený vpravo v phone+email riadku (vyššie). */}

          {/* Action bar */}
          <div className="px-5 pt-4 pb-4 mt-4 border-t bg-zinc-50/60">
          {/* Outcome row:
              - V Nové (status=new) + odhalené → Kontakt + Nedvíha
                ("kam zaradiť?")
              - V Kontakt (status=phone_revealed) → veľký Ponuka button
                (lead zdvihol, ďalší krok je poslať CP)
              - V no_answer/archived → žiadne outcome buttons tu (Nedvíha
                pokus 2./3. ide tlačidlom Nedvíha v bottom alebo
                Archivovať banner) */}
          {isRevealed && lead.status === "new" && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Button
                type="button"
                onClick={handleContact}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11"
                title="Zdvihla → presunie do Kontakt tabu"
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
              </Button>
            </div>
          )}

          {/* Kontakt tab — veľký Ponuka button (priamy presmer na generátor) */}
          {lead.status === "phone_revealed" && (
            <div className="mb-2">
              <Button
                asChild
                className="w-full h-12 bg-sky-600 hover:bg-sky-700 text-white font-bold text-base shadow-[0_3px_10px_rgba(2,132,199,0.3)]"
              >
                <Link href={`/generator?lead=${lead.id}`}>
                  <Calculator className="w-5 h-5 mr-2" aria-hidden />
                  Poslať cenovú ponuku
                </Link>
              </Button>
            </div>
          )}

          {/* Archivovať s SMS+Email follow-up — len v Nedvíha po >= 3 pokusoch */}
          {lead.status === "no_answer" && lead.call_attempts >= 3 && (
            <div className="mb-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-red-900 dark:text-red-200">
                <strong>{lead.call_attempts}×</strong> nezdvihol.
                Archivuj a pošli automatický SMS + Email follow-up.
                <span className="block text-[10px] opacity-70 mt-0.5">
                  (SMS+Email zatiaľ placeholder, funkčnosť po pripojení providerov)
                </span>
              </div>
              <Button
                type="button"
                onClick={handleArchive}
                disabled={busy}
                size="sm"
                className="h-9 bg-red-600 hover:bg-red-700 text-white font-bold shrink-0"
              >
                📦 Archivovať
              </Button>
            </div>
          )}

          {/* AssignedBanner ("Kontakt: <name>") odstránený — leady sú
              rozdelené medzi agentov rovnomerne (auto-assign), nepotrebujeme
              značiť kto ich vlastní. */}

          {/* Hlavná akcia row.
              - Pri NOVOM leade: iba Email + Odhaliť číslo (žiadna Ponuka —
                najprv treba zavolať a zistiť čo zákazník chce).
              - Po odhalení / v ďalších stavoch: + Ponuka button. */}
          <div
            className={cn(
              "grid gap-2",
              // 2 cols keď nie je malý Ponuka button (new + phone_revealed),
              // 3 cols v ostatných stavoch (no_answer, interested, quote_sent…)
              lead.status === "new" || lead.status === "phone_revealed"
                ? "grid-cols-2"
                : "grid-cols-3",
            )}
          >
            {emailHref ? (
              <Button asChild variant="outline" size="sm" className="h-10">
                <a
                  href={emailHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Otvorí Gmail compose s predvyplneným adresátom"
                >
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
              isRevealed ? (
                // Po odhalení: priamy tel: link (user gesture → browser
                // dovolí dial bez warningu)
                <Button
                  asChild
                  size="sm"
                  className="h-10 bg-green-600 hover:bg-green-700 text-white font-bold shadow-[0_3px_10px_rgba(22,163,74,0.3)]"
                >
                  <a href={`tel:${lead.phone}`} title="Vytočiť">
                    <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                    Zavolať
                  </a>
                </Button>
              ) : (
                // Pred odhalením: reveal action, žiadny dial
                <Button
                  type="button"
                  onClick={handleCall}
                  disabled={busy}
                  size="sm"
                  className="h-10 bg-green-600 hover:bg-green-700 text-white font-bold shadow-[0_3px_10px_rgba(22,163,74,0.3)]"
                >
                  <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                  Odhaliť číslo
                </Button>
              )
            ) : (
              <Button variant="outline" size="sm" className="h-10" disabled>
                <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                Zavolať
              </Button>
            )}
            {/* Malý Ponuka button — len v stavoch kde nie je veľký CTA hore
                (no_answer/interested/quote_sent). V "new" žiadny (najprv volaj),
                v "phone_revealed" je big "Poslať cenovú ponuku" CTA (nedupluj). */}
            {lead.status !== "new" && lead.status !== "phone_revealed" && (
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
            )}
          </div>

          {/* Role handoff — obchodník posunie zákazku na obhliadku alebo
              do realizácie. Zobrazí sa iba v stavoch kde to má zmysel. */}
          {["phone_revealed", "no_answer", "scheduled", "interested", "quote_sent", "won"].includes(
            lead.status,
          ) && (
            <div className="mt-2 pt-2 border-t border-dashed">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                Posunúť ďalej v tíme
              </div>
              <HandoffActions leadId={lead.id} currentStatus={lead.status} />
            </div>
          )}
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
// ClaimBanner odstránený — auto-assign nasadený, lead príde rovno
// pridelený. (Server actions claimLeadAction / returnLeadAction
// zostali ako fallback pre admin reassign cez Admin UI fázu.)

/**
 * AssignedBanner — zobrazuje meno pridelenj agenta.
 * Po zavedení auto-assignu už nie je "Vrátiť do systému" — admin
 * môže lead reassignuť cez admin UI (zatiaľ TODO).
 */
function AssignedBanner({ name }: { name: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 inline-flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-200">
      <Hand className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="font-semibold">Kontakt:</span>
      <span>{name ?? "—"}</span>
    </div>
  );
}
