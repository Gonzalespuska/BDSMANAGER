"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { CallscriptButton } from "./callscript-button";
import { SmsCopyButton } from "./sms-copy-button";
import { HandoffActions } from "./handoff-actions";
import { LeadNotesInline } from "./lead-notes-inline";
import { LeadStatusPicker } from "./lead-status-picker";
import { MissedCallDropdown } from "./missed-call-dropdown";
import { MissingFieldChip } from "./missing-field-chip";
import { LeadEmailEditor } from "./lead-email-editor";
import { SK_CITIES } from "@/lib/data/sk-cities";

import { Button } from "@/components/ui/button";
import {
  Lead,
  SOURCE_TYPE_LABELS,
  STATUS_META,
  timeAgo,
} from "@/lib/types/lead";
import { cn } from "@/lib/utils";
import { formatPhoneSK } from "@/lib/phone-format";
import { toast } from "@/components/ui/toast";
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
export function LeadCard({
  lead: initialLead,
  isAdmin = false,
}: {
  lead: Lead;
  /** Admin má prístup k "Won" statusu v pickeri. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [lead, setLead] = React.useState(initialLead);
  const [busy, setBusy] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  // Keď akcia (Kontakt / Nedvíha / Archív) presunie lead do iného tabu,
  // najprv skryjeme kartu (fade-out), a router.refresh() ju vráti do
  // správneho tabu. Bez toho by na moment blikla nová stavovka.
  const [leaving, setLeaving] = React.useState(false);

  const statusMeta = STATUS_META[lead.status];
  const sourceLabel =
    SOURCE_TYPE_LABELS[lead.source_type] ?? `📥 ${lead.source_type}`;
  const isRevealed = Boolean(lead.phone_revealed_at);

  const dataFields = lead.data as Record<string, string | number | undefined>;
  // Termín má vlastný prominentný badge (kedy chce zákazník realizovať) —
  // pre obchodníka je to kľúčová info: urgentné vs "iba info" má inú prioritu.
  const terminValue = dataFields.termin as string | undefined;
  // Predošlá CP — ak lead ma odoslanú CP, môžeme ju znovu otvoriť + preposlať.
  const lastQuote = (lead.data as Record<string, unknown>).last_quote as
    | {
        version?: number;
        sent_at?: string;
        sent_to?: string;
        snapshot?: { total?: number };
      }
    | undefined;
  const hasSavedQuote = !!lastQuote?.sent_at;
  // Button "Upraviť CP" sa zobrazí pre všetky leady v CP tabe
  // (interested + quote_sent) alebo ak už majú saved quote.
  //   • hasSavedQuote → pre-fillne generátor pôvodným stavom (edit)
  //   • quote_sent bez saved → otvorí prázdny gen. (napr. staré leady)
  //   • interested → otvorí prázdny gen. na vytvorenie novej CP
  const showEditCpButton =
    hasSavedQuote ||
    lead.status === "quote_sent" ||
    lead.status === "interested";
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

  async function handleMissedCall(reminderHours?: number) {
    setLeaving(true);
    const result = await callLeadAction(
      "missed_call",
      reminderHours ? { reminder_hours: reminderHours } : undefined,
    );
    if (!result.ok) {
      setLeaving(false);
      console.error("[missed_call] failed", result.error, { lead_id: lead.id });
      toast.error(`Chyba pri Nedvíha: ${result.error}`);
    } else {
      toast.success(
        `📵 ${lead.name || "Lead"} → Nezdvíhali${reminderHours ? ` (pripomienka o ${reminderHours}h)` : " (pripomienka o 4h)"}`,
        { href: "/agent?tab=nedovolany" },
      );
      window.location.href = "/agent?tab=nedovolany";
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
    setLeaving(true);
    const result = await callLeadAction("archive");
    if (!result.ok) {
      setLeaving(false);
      toast.error(`Chyba: ${result.error}`);
    } else {
      toast.success(`📦 ${lead.name || "Lead"} → Archivované`, {
        href: "/agent?tab=archivovane",
      });
      window.location.href = "/agent?tab=archivovane";
    }
  }

  /**
   * „Do koša" — okamžité zahodenie leadu (bez follow-up SMS/Email).
   * User 2026-07-14: „pridaj ak mame proste uz neaktivny lead ze to
   * proste uz nechce moznost ho zahodit … novy status ktory sa bude
   * volat kos alebo tak". Trash != Archived: archive = „follow-up
   * niekedy neskor", trash = „mrtvy lead, ignoruj".
   */
  async function handleTrash() {
    if (
      !confirm(
        `Hodiť "${lead.name || "lead"}" do koša?\n\n` +
          "Lead sa presunie do Koš tabu a už sa nebude auto-priradzovať " +
          "obchodákom. Neposielame follow-up. Môžeš ho odtiaľ obnoviť.",
      )
    )
      return;
    setLeaving(true);
    const result = await callLeadAction("trash");
    if (!result.ok) {
      setLeaving(false);
      toast.error(`Chyba: ${result.error}`);
    } else {
      toast.success(`🗑 ${lead.name || "Lead"} → Kôš`, {
        href: "/agent?tab=kos",
      });
      window.location.href = "/agent?tab=kos";
    }
  }

  /**
   * „Neexistujúce číslo" — obchodák volal a operátor oznámil ze číslo neexistuje.
   * User 2026-07-16: „volal som ako obchodak a dalo mi ze volane cislo
   * neexistuje, email nemame a chcel som to dat do toho kosa co sme sa
   * bavili ale neni tam ta moznost". Rovnaká akcia ako trash, ale iný
   * confirm + iný toast (obchodák vidí prečo lead skončil v koši).
   */
  async function handleInvalidPhone() {
    if (
      !confirm(
        `Označiť "${lead.name || "lead"}" ako neexistujúce číslo?\n\n` +
          `📞 ${lead.phone ?? "—"}\n\n` +
          "Lead pôjde do Koša (neplatné číslo, žiadny follow-up). " +
          "Nebude sa už auto-priradzovať obchodákom.",
      )
    )
      return;
    setLeaving(true);
    const result = await callLeadAction("trash", { reason: "invalid_phone" });
    if (!result.ok) {
      setLeaving(false);
      toast.error(`Chyba: ${result.error}`);
    } else {
      toast.success(`❌ ${lead.name || "Lead"} → Neexistujúce číslo (Kôš)`, {
        href: "/agent?tab=kos",
      });
      window.location.href = "/agent?tab=kos";
    }
  }

  /**
   * "Kontakt" — agent volal a zákazník zdvihol.
   * Karta zmizne z Nové tab-u, objaví sa v Kontakt tab-e po refreshi.
   */
  async function handleContact() {
    setLeaving(true);
    const result = await callLeadAction("contact");
    if (!result.ok) {
      setLeaving(false);
      toast.error(`Chyba: ${result.error}`);
    } else {
      // User 2026-07-16: „ked zmenim stav napriklad na kontakt z noveho, tak
      // nech ma hodi na ten stav dany priklad do kontakt ked hodim po
      // telefonate tak som v kontakt a mozem pokracovat s nejakou akciou
      // poslat mu cp".
      toast.success(`✅ ${lead.name || "Lead"} → Kontakt`, {
        href: "/agent?tab=kontakt",
      });
      window.location.href = "/agent?tab=kontakt";
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
      <article
        className={cn(
          "relative rounded-2xl border bg-background shadow-sm hover:shadow-md overflow-hidden flex",
          // Plynulá zmena: keď je 'leaving', karta pomaly zmizne
          // (fade + shrink) — namiesto placeholder blikance.
          "transition-all duration-300",
          leaving
            ? "opacity-0 scale-[0.98] translate-x-2 pointer-events-none"
            : "opacity-100 scale-100 translate-x-0",
        )}
      >
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
                isAdmin={isAdmin}
                leadName={lead.name}
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
                className="inline-flex items-center gap-2 text-2xl md:text-3xl font-extrabold text-emerald-700 hover:text-emerald-900 tracking-tight tabular-nums"
              >
                <Phone className="w-6 h-6 md:w-7 md:h-7" aria-hidden />
                {formatPhoneSK(lead.phone)}
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
              // User 2026-07-16: „niekedy v leade nieje email v tom pripade
              // nech je kolonka kde mozem doplnit ten email rovanko ako ked
              // chyba mesto typ podlahy".
              <LeadEmailEditor
                leadId={lead.id}
                onSaved={(email) => setLead({ ...lead, email })}
              />
            )}
            </div>

            {/* Pravý stĺpec — callback + obhliadka + realizácia (all vpravo hore).
                Obhliadka/realizácia badge sú klikateľné → otvoria kalendár
                na daný mesiac. Farbou farbia typ udalosti. */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {lead.next_callback_at && (
                <CallbackReminder when={lead.next_callback_at} />
              )}
              {lead.inspection_at && (
                <Link
                  href={`/calendar?m=${lead.inspection_at.slice(0, 7)}`}
                  className="inline-flex flex-col items-end gap-0 px-2.5 py-1.5 rounded-lg border-2 border-violet-300 bg-violet-50 text-[11px] font-bold text-violet-900 hover:bg-violet-100 hover:border-violet-400 hover:shadow-sm transition-all min-w-fit"
                  title="Otvoriť v kalendári"
                >
                  <span className="inline-flex items-center gap-1">
                    🔍 <span className="uppercase tracking-wider text-[9px]">Obhliadka</span>
                  </span>
                  <span className="font-extrabold tabular-nums">
                    {new Date(lead.inspection_at).toLocaleString("sk-SK", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Bratislava",
                    })}
                  </span>
                  {lead.inspection_by_name && (
                    <span className="text-[10px] opacity-80 font-semibold">
                      {lead.inspection_by_name}
                    </span>
                  )}
                </Link>
              )}
              {lead.realization_at && (
                <Link
                  href={`/calendar?m=${lead.realization_at.slice(0, 7)}`}
                  className="inline-flex flex-col items-end gap-0 px-2.5 py-1.5 rounded-lg border-2 border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-sm transition-all min-w-fit"
                  title="Otvoriť v kalendári"
                >
                  <span className="inline-flex items-center gap-1">
                    🔨 <span className="uppercase tracking-wider text-[9px]">Realizácia</span>
                  </span>
                  <span className="font-extrabold tabular-nums">
                    {new Date(lead.realization_at).toLocaleString("sk-SK", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Bratislava",
                    })}
                  </span>
                  {lead.realization_by_name && (
                    <span className="text-[10px] opacity-80 font-semibold">
                      {lead.realization_by_name}
                    </span>
                  )}
                </Link>
              )}
            </div>
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

          {/* Info bits — kľúčové polia leadu (plocha, priestor, typ podlahy,
              lokalita). Ak chýbajú, zobrazí sa amber dashed „+ Doplniť"
              chip s inline dropdown/input — obchodák môže pri hovore hneď
              doplniť bez otvárania detailu. */}
          <div className="px-5 pt-4 flex flex-wrap items-center gap-1.5">
            <MissingFieldChip
              leadId={lead.id}
              field="plocha"
              value={coerceString(dataFields.plocha)}
              kind="number"
              placeholder="m²"
              suffix="m²"
            />
            <MissingFieldChip
              leadId={lead.id}
              field="priestor"
              value={coerceString(dataFields.priestor)}
              kind="priestor"
              placeholder="Priestor"
            />
            <MissingFieldChip
              leadId={lead.id}
              field="typ_podlahy"
              value={coerceString(dataFields.typ_podlahy)}
              kind="typ_podlahy"
              placeholder="Typ podlahy"
            />
            <MissingFieldChip
              leadId={lead.id}
              field="lokalita"
              value={coerceString(dataFields.lokalita)}
              kind="text"
              placeholder="Mesto"
              autocomplete={SK_CITIES}
            />
          </div>

          {/* Callscript — floating pravý-dolný roh leadu (user 2026-07-12:
              „ten call script nech je v pravo dole v leade vzdy"). Absolútna
              pozícia vnútri <article className="relative">, aby držala tam
              nezávisle od obsahu. Tlačidlo má vlastný z-index nad content. */}

          {/* Message excerpt — collapse/expand ak je dlhá.
              User 2026-07-14: „nemame moznost zobrazit celu poznamku a preto
              ju nevidime celu — pridat tam zobrazit celu poznamku". */}
          {typeof dataFields.message === "string" && dataFields.message && (
            <div className="px-5 pt-3">
              <MessageExcerpt message={dataFields.message as string} />
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
            <>
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
                <MissedCallDropdown
                  busy={busy}
                  onPick={(hrs) => handleMissedCall(hrs)}
                />
              </div>
            </>
          )}

          {/* Kontakt tab — veľký Ponuka button + Nedvíha (druhý pokus).
              User 2026-07-14: „nefunguje tlacidlo nezdviha" — v Kontakt
              tabe chýbalo Nedvíha, keď obchodák volá druhýkrát a nezdvihnú. */}
          {lead.status === "phone_revealed" && (
            <div className="mb-2 space-y-2">
              <div className="flex gap-2">
                <Button
                  asChild
                  className="flex-1 h-12 bg-sky-600 hover:bg-sky-700 text-white font-bold text-base shadow-[0_3px_10px_rgba(2,132,199,0.3)]"
                >
                  <Link href={`/generator?lead=${lead.id}`}>
                    <Calculator className="w-5 h-5 mr-2" aria-hidden />
                    Poslať cenovú ponuku
                  </Link>
                </Button>
                {lead.email && (
                  <QuickEmailButton
                    leadId={lead.id}
                    email={lead.email}
                    leadName={lead.name}
                    hasSavedQuote={hasSavedQuote}
                  />
                )}
              </div>
              <MissedCallDropdown
                busy={busy}
                onPick={(hrs) => handleMissedCall(hrs)}
              />
            </div>
          )}

          {/* Nedvíha tab — SMS copy + prípadný ďalší pokus nezdvihal */}
          {lead.status === "no_answer" && (
            <div className="mb-2 space-y-2">
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-violet-800 flex items-center gap-1.5">
                  📱 Pošli SMS aby zákazník zavolal späť
                </div>
                <SmsCopyButton leadName={lead.name} phone={lead.phone} />
                <p className="text-[10px] text-violet-700/80 leading-snug">
                  Skopíruje pripravený text — vlož v SMS aplikácii a odošli z
                  tvojho čísla. Auto-SMS z čísla obchodáka dorobíme neskôr.
                </p>
              </div>
              {lead.call_attempts < 3 && (
                <MissedCallDropdown
                  busy={busy}
                  onPick={(hrs) => handleMissedCall(hrs)}
                />
              )}
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

          {/* User 2026-07-14: „do kosa je strasne — ma byt normalne v tom
              statuse ze to tam manulane hodis". Samostatný red-button prec,
              „Kôš" je teraz option v status pickeri (dropdown pri statuse). */}

          {/* AssignedBanner ("Kontakt: <name>") odstránený — leady sú
              rozdelené medzi agentov rovnomerne (auto-assign), nepotrebujeme
              značiť kto ich vlastní. */}

          {/* Hlavná akcia row.
              - Pri NOVOM leade: iba Email + Odhaliť číslo (žiadna Ponuka —
                najprv treba zavolať a zistiť čo zákazník chce).
              - V CP tabe (interested/quote_sent): iba Email + Zavolať,
                „Ponuka" button preč — pod ním je „Upraviť CP" (duplikát
                by len mátol obchodníka).
              - V ostatných (no_answer, ...): + Ponuka button.

              Na desktope „Zavolať" (tel: link) prakticky nič nerobí —
              tak ho tam skryjeme (md:hidden). Grid na desktope potom
              zredukujeme o 1 stĺpec keď je Zavolať skrytý (revealed
              alebo bez čísla). „Odhaliť číslo" ostáva na PC — to je
              samostatná akcia (obchodák si číslo zobrazí a potom volá
              z iného zariadenia). */}
          <div
            className={cn(
              "grid gap-2",
              // 2 cols keď nie je malý Ponuka button (new + phone_revealed
              // + CP tab, kde je pod akciami "Upraviť CP" button).
              // 3 cols v ostatných stavoch (no_answer, ...).
              lead.status === "new" ||
                lead.status === "phone_revealed" ||
                showEditCpButton
                ? // mobile: 2, desktop: 2 alebo 1 keď Zavolať skryté
                  isRevealed || !lead.phone
                  ? "grid-cols-2 md:grid-cols-1"
                  : "grid-cols-2"
                : // mobile: 3, desktop: 3 alebo 2 keď Zavolať skryté
                  isRevealed || !lead.phone
                  ? "grid-cols-3 md:grid-cols-2"
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
                // dovolí dial bez warningu). Na desktope skryté —
                // tel: link na PC otvorí FaceTime / dialer čo obchodák
                // typicky nechce.
                <Button
                  asChild
                  size="sm"
                  className="md:hidden h-10 bg-green-600 hover:bg-green-700 text-white font-bold shadow-[0_3px_10px_rgba(22,163,74,0.3)]"
                >
                  <a href={`tel:${lead.phone}`} title="Vytočiť">
                    <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                    Zavolať
                  </a>
                </Button>
              ) : (
                // Pred odhalením: reveal action, žiadny dial.
                // OSTÁVA na desktope aj mobile — je to samostatná akcia
                // (odhalí + zaloguje phone_revealed_at, obchodák potom
                // volá z iného zariadenia).
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
              // Bez telefónu — disabled Zavolať. Na desktope zbytočný, skryť.
              <Button variant="outline" size="sm" className="md:hidden h-10" disabled>
                <Phone className="w-4 h-4 mr-1.5" aria-hidden />
                Zavolať
              </Button>
            )}
            {/* Malý Ponuka button — len v stavoch mimo CP tabu.
                V "new" žiadny (najprv volaj), v "phone_revealed" je big
                "Poslať cenovú ponuku" CTA (nedupluj), v CP tabe je
                pod týmto blokom "Upraviť CP" (nedupluj rovnakú akciu). */}
            {lead.status !== "new" &&
              lead.status !== "phone_revealed" &&
              !showEditCpButton && (
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

          {/* UPRAVIŤ CP — v CP tabe (interested/quote_sent) alebo keď má
              lead uloženú CP. Otvorí generátor s POŽADOVANÝMI SAMÝMI číslami
              ako pri pôvodnom odoslaní (pre-fill z data.last_quote). Ak nič
              uložené nie je (staré leady zo starých CP flows), otvorí prázdny
              generátor. */}
          {showEditCpButton && (
            <div className="mt-2 flex gap-2">
              <Button
                asChild
                className="flex-1 h-12 bg-sky-600 hover:bg-sky-700 text-white font-bold text-base shadow-[0_3px_10px_rgba(2,132,199,0.3)]"
                title={
                  hasSavedQuote && lastQuote?.sent_at
                    ? `Pôvodná CP poslaná ${new Date(lastQuote.sent_at).toLocaleString("sk-SK")}${lastQuote.sent_to ? ` na ${lastQuote.sent_to}` : ""}`
                    : "Otvoriť generátor s pôvodnými hodnotami"
                }
              >
                <Link
                  href={
                    hasSavedQuote
                      ? `/generator?lead=${lead.id}&resend=1`
                      : `/generator?lead=${lead.id}`
                  }
                >
                  <Calculator className="w-5 h-5 mr-2" aria-hidden />
                  Upraviť CP
                  {lastQuote?.version && lastQuote.version > 1 && (
                    <span className="ml-1.5 text-[11px] font-normal opacity-80">
                      (v{lastQuote.version})
                    </span>
                  )}
                </Link>
              </Button>
              {lead.email && (
                <QuickEmailButton
                  leadId={lead.id}
                  email={lead.email}
                  leadName={lead.name}
                  hasSavedQuote={hasSavedQuote}
                />
              )}
            </div>
          )}

          {/* Role handoff — obchodník posunie zákazku na obhliadku alebo
              do realizácie. Zobrazí sa iba v stavoch kde to má zmysel. */}
          {["phone_revealed", "no_answer", "scheduled", "interested", "quote_sent", "won"].includes(
            lead.status,
          ) && (
            <div className="mt-2 pt-2 border-t border-dashed">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                Posunúť ďalej v tíme
              </div>
              <HandoffActions
                leadId={lead.id}
                currentStatus={lead.status}
                leadCity={
                  typeof dataFields.lokalita === "string"
                    ? dataFields.lokalita
                    : null
                }
              />
            </div>
          )}
        </div>
        {/* Callscript riadok pod akciami — INSIDE flex-1 min-w-0 (nie side-column).
            User 2026-07-16: „pozri ako to je skaredo cele preco sa to cele
            nefituje do toho okna". Predtým bol callscript flex sibling
            k content divu → renderoval sa vpravo od karty a robil ju
            asymetrickou. Teraz je normálny riadok dole. */}
        <div className="px-5 pb-4 -mt-1 flex items-center justify-end">
          <CallscriptButton
            leadId={lead.id}
            leadName={lead.name}
            leadPhone={lead.phone}
            floorType={coerceString(dataFields.typ_podlahy)}
            space={coerceString(dataFields.priestor)}
            plocha={coerceString(dataFields.plocha)}
            lokalita={coerceString(dataFields.lokalita)}
            savedAnswers={
              (lead.data as Record<string, unknown>).callscript_answers as
                | Record<string, { value: string; note?: string; at: string }>
                | null
                | undefined
            }
          />
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

/**
 * Bezpečná konverzia unknown → string alebo null.
 * Používa sa v MissingFieldChip aby chip fungoval aj keď hodnota v
 * lead.data je uložená ako number namiesto string (napr. plocha=80).
 */
/**
 * MessageExcerpt — zobrazí poznámku klienta s možnosťou rozbaliť celý text.
 * User 2026-07-14: „nemame moznost zobrazit celu poznamku a preto ju
 * nevidime celu — pridat tam zobrazit celu poznamku alebo to nejako
 * vymysliet". Ak sa text vojde do 2 riadkov, „Zobraziť celú" sa nezobrazí.
 */
function MessageExcerpt({ message }: { message: string }) {
  const [expanded, setExpanded] = React.useState(false);
  // Heuristika: viac ako 120 znakov ALEBO viac ako 2 riadky → treba expand.
  const needsExpand = message.length > 120 || message.split("\n").length > 2;
  return (
    <div className="border-l-2 border-zinc-300 pl-3 py-0.5">
      <p
        className={cn(
          "text-sm text-zinc-700 leading-snug whitespace-pre-wrap",
          !expanded && needsExpand && "line-clamp-2",
        )}
      >
        {message}
      </p>
      {needsExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
          className="mt-1 text-xs font-bold text-sky-700 hover:text-sky-900 underline underline-offset-2"
        >
          {expanded ? "Skryť" : "Zobraziť celú poznámku ▾"}
        </button>
      )}
    </div>
  );
}

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return isFinite(v) ? String(v) : null;
  return null;
}

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
              📞 <strong className="tabular-nums">{formatPhoneSK(lead.phone ?? "")}</strong>
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

/**
 * QuickEmailButton — malé tlačidlo vedľa "Poslať cenovú ponuku" / "Upraviť CP".
 *
 * Klik → otvorí inline modal s editovateľným textom (pre-fill default).
 * Obchodník môže dopísať / upraviť text → klik Odoslať → server pošle email
 * cez Resend s posledným PDF-om (last_quote) ako prílohou.
 *
 * Ak lead ešte nemá vygenerovanú CP (nemá `last_quote`), tlačidlo je disabled
 * a hovorí "najprv vytvor CP v generátore".
 */
function QuickEmailButton({
  leadId,
  email,
  leadName,
  hasSavedQuote,
}: {
  leadId: string;
  email: string;
  leadName: string;
  hasSavedQuote: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [text, setText] = React.useState("");
  const [me, setMe] = React.useState<{
    name: string;
    email: string;
    phone: string | null;
  } | null>(null);

  // Fetch prihláseného usera pri otvorení modálu — chceme jeho meno/tel/email
  // do signatúry (nie hardcoded "Tim EPOXIDOVO").
  React.useEffect(() => {
    if (!open || me) return;
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((data) => setMe(data))
      .catch(() => setMe({ name: "", email: "info@epoxidovo.sk", phone: null }));
  }, [open, me]);

  const defaultBody = React.useMemo(() => {
    const first = leadName ? " " + leadName.split(" ")[0] : "";
    const agentName = me?.name || "Obchodák EPOXIDOVO";
    const agentPhone = me?.phone || "";
    const agentEmail = me?.email || "info@epoxidovo.sk";
    return `Dobrý deň${first},

posielam Vám cenovú ponuku ktorú sme spolu prebrali. V prípade otázok ma neváhajte kontaktovať.

S pozdravom,
${agentName}${agentPhone ? "\n" + agentPhone : ""}
EPOXIDOVO s. r. o.
${agentEmail}
www.epoxidovo.sk`;
  }, [leadName, me]);

  React.useEffect(() => {
    if (open) setText(defaultBody);
  }, [open, defaultBody]);

  async function sendNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/quote/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          body_text: text,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Chyba: " + (json.error ?? `HTTP ${res.status}`));
      } else {
        setOpen(false);
        toast.success(`✉️ CP preposlaná zákazníkovi (${email})`);
      }
    } catch (e) {
      toast.error("Sieťová chyba: " + (e instanceof Error ? e.message : "?"));
    } finally {
      setBusy(false);
    }
  }

  if (!hasSavedQuote) {
    return (
      <button
        type="button"
        disabled
        title="Najprv vytvor CP v generátore (klik Poslať cenovú ponuku / Upraviť CP)"
        className="inline-flex items-center justify-center h-12 w-12 rounded-md bg-slate-100 border-2 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
      >
        ✍️
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Rýchlo poslať CP — s možnosťou upraviť text pred odoslaním"
        className="inline-flex items-center justify-center h-12 w-12 rounded-md bg-white border-2 border-sky-300 hover:border-sky-500 hover:bg-sky-50 text-sky-700 hover:text-sky-900 transition-colors shadow-sm"
      >
        ✍️
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg">✍️ Rýchlo poslať CP</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Príloha:{" "}
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                    📎 ponuka.pdf
                  </span>{" "}
                  · Príjemca:{" "}
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                    {email}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
                aria-label="Zatvoriť"
              >
                ×
              </button>
            </header>
            <div className="p-5 flex-1 overflow-auto">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Text emailu (upraviteľný)
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={14}
                autoFocus
                disabled={busy}
                className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none resize-y whitespace-pre"
              />
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Kurzor začína na vrchu — dopisuj text nad podpisom. PDF sa
                pripojí automaticky.
              </p>
            </div>
            <footer className="px-5 py-4 border-t bg-slate-50 flex items-center justify-end gap-2 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-4 py-2"
              >
                Zrušiť
              </button>
              <button
                type="button"
                onClick={sendNow}
                disabled={busy || !text.trim()}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 text-sm font-bold transition-colors shadow"
              >
                {busy ? "Odosielam…" : "📤 Odoslať CP"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
