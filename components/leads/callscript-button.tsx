"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, Phone, PhoneCall, User, X } from "lucide-react";

import { renderCallscript } from "@/lib/callscript-render";

/**
 * CallscriptButton — malý „📞 Callscript" button na leade.
 *
 * User 2026-07-11:
 *   "obchodaci pri leade vzdy ze otvorit callscript a otvori im ten call
 *    script v takom okne, vzdy podla typu podlahy je call script su
 *    viazane cize mramorova interier dom ma iny call script ako
 *    mramorova garaz a podobne, to tlacidlo na otvorenie call scriptu
 *    nemusi byt velke".
 *
 * Fetchne z /api/admin/call-scripts a zvolí najlepšiu zhodu podľa
 * (floorType, space). Ak žiadna zhoda → univerzálny (floor_type=NULL).
 */

type Step =
  | { id: string; type: "info"; prompt: string }
  | {
      id: string;
      type: "choice";
      prompt: string;
      options: Array<{ value: string; label: string }>;
      allow_other?: boolean;
      required?: boolean;
    }
  | { id: string; type: "yesno"; prompt: string; required?: boolean }
  | { id: string; type: "number"; prompt: string; unit?: string; required?: boolean }
  | { id: string; type: "freetext"; prompt: string; required?: boolean };

type Script = {
  id: string;
  label: string;
  description: string | null;
  floor_type: string | null;
  space: string | null;
  body: string;
  steps: Step[] | null;
  sort_order: number;
  active: boolean;
};

type Answer = {
  value: string;
  note?: string;
  at: string;
};

function normalizeFloorType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("chips")) return "chipsova";
  if (n.includes("mramor")) return "mramorova";
  if (n.includes("metal")) return "metalicka";
  if (n.includes("jedno") || n.includes("epoxid") || n.includes("polyuret"))
    return "jednofarebna";
  return null;
}

function normalizeSpace(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("garaz")) return "garaz";
  if (n.includes("dom") || n.includes("byt") || n.includes("interier"))
    return "dom";
  if (n.includes("exterier") || n.includes("vonk")) return "exterier";
  if (n.includes("firma") || n.includes("kancel") || n.includes("obchod"))
    return "firma";
  if (n.includes("sklad") || n.includes("hala") || n.includes("dielna"))
    return "sklad";
  return null;
}

function scoreScript(
  s: Script,
  floorType: string | null,
  space: string | null,
): number {
  let score = 0;
  if (s.floor_type && floorType && s.floor_type === floorType) score += 10;
  else if (!s.floor_type) score += 1; // fallback univerzálny
  if (s.space && space && s.space === space) score += 5;
  else if (!s.space) score += 0.5;
  // penalizuj mismatche
  if (s.floor_type && floorType && s.floor_type !== floorType) score -= 8;
  if (s.space && space && s.space !== space) score -= 3;
  return score;
}

export function CallscriptButton({
  leadId,
  leadName,
  leadPhone,
  floorType,
  space,
  plocha,
  lokalita,
  savedAnswers,
}: {
  leadId?: string;
  leadName?: string | null;
  leadPhone?: string | null;
  floorType?: string | null;
  space?: string | null;
  plocha?: string | number | null;
  lokalita?: string | null;
  /** Uložené odpovede z minulého hovoru — obchodák sa vráti tam kde skončil. */
  savedAnswers?: Record<string, Answer> | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [scripts, setScripts] = React.useState<Script[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [savingTag, setSavingTag] = React.useState(false);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // User 2026-07-16: „ked nemas to info tie tagy ze kde ide ta podlaha
  // a aky typ tak priamo v tom call scripte musis mat moznost dropdownom
  // to doplnit". Lokálne overrides — persistujeme cez /api/lead/update-field
  // ale používame ich okamžite pre re-score bez čakania na router.refresh.
  const [localFloor, setLocalFloor] = React.useState<string | null>(floorType ?? null);
  const [localSpace, setLocalSpace] = React.useState<string | null>(space ?? null);
  React.useEffect(() => setLocalFloor(floorType ?? null), [floorType]);
  React.useEffect(() => setLocalSpace(space ?? null), [space]);

  const nFloor = normalizeFloorType(localFloor);
  const nSpace = normalizeSpace(localSpace);

  // Odpovede zo stepper-a — kopírované z propa (server state) + patchované
  // lokálne pri každom kliknutí.
  const [answers, setAnswers] = React.useState<Record<string, Answer>>(
    () => savedAnswers ?? {},
  );
  React.useEffect(() => {
    if (savedAnswers) setAnswers(savedAnswers);
  }, [savedAnswers]);

  const [stepIdx, setStepIdx] = React.useState(0);
  const [pendingNote, setPendingNote] = React.useState("");
  const [otherText, setOtherText] = React.useState("");

  const renderCtx = React.useMemo(
    () => ({
      leadName,
      plocha,
      lokalita,
      typPodlahy: localFloor,
      priestor: localSpace,
    }),
    [leadName, plocha, lokalita, localFloor, localSpace],
  );

  // User 2026-07-16: „ked to obchodak zisti a zada do toho dropdownu
  // loadne mu automatikcy novy script ktory uz je na tie tagy a
  // nadpoji sa tym na rozhovor". Ak sa počas otvoreného modálu zmení
  // floorType alebo space (obchodák aktualizoval MissingFieldChip),
  // re-score existujúci list a prepni na best match.
  React.useEffect(() => {
    if (!scripts || scripts.length === 0) return;
    const ranked = [...scripts].sort(
      (a, b) => scoreScript(b, nFloor, nSpace) - scoreScript(a, nFloor, nSpace),
    );
    const best = ranked[0];
    if (best && best.id !== selectedId) {
      setSelectedId(best.id);
    }
    // scripts a selectedId sú stable references; sledujeme iba tagy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nFloor, nSpace, scripts]);

  async function openModal() {
    setOpen(true);
    if (scripts !== null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/call-scripts");
      const j = await r.json();
      if (!j.ok) {
        const raw = String(j.error ?? "");
        // Preložime PostgREST schema-cache error na actionable správu.
        // Table 'call_scripts' existuje v DB (migrácia 31), len PostgREST
        // cache ho ešte nezachytila — admin musí spustiť NOTIFY pgrst.
        const friendly = /schema cache|not.*found.*table|call_scripts/i.test(raw)
          ? `PostgREST cache je stale. Otvor /admin a klikni „Reload PostgREST schema cache" — do 2s to bude fungovať.`
          : raw || "Nepodarilo sa načítať skripty";
        setError(friendly);
        setLoading(false);
        return;
      }
      const active = ((j.scripts ?? []) as Script[]).filter((s) => s.active);
      setScripts(active);
      // auto-pick best match
      if (active.length > 0) {
        const ranked = [...active].sort(
          (a, b) => scoreScript(b, nFloor, nSpace) - scoreScript(a, nFloor, nSpace),
        );
        setSelectedId(ranked[0].id);
      }
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setLoading(false);
    }
  }

  const selected = scripts?.find((s) => s.id === selectedId) ?? null;

  async function saveAnswer(stepId: string, value: string, note?: string) {
    if (!leadId) return;
    const at = new Date().toISOString();
    const nextAnswers = { ...answers, [stepId]: { value, note: note?.trim() || undefined, at } };
    setAnswers(nextAnswers);
    setPendingNote("");
    setOtherText("");
    // Persist do lead.data.callscript_answers cez update-field endpoint
    try {
      await fetch("/api/lead/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          field: "callscript_answers",
          value: JSON.stringify(nextAnswers),
        }),
      });
    } catch {
      // Non-blocking — používateľ pokračuje aj bez persist
    }
  }

  async function saveTag(field: "typ_podlahy" | "priestor", value: string) {
    if (!leadId) return;
    setSavingTag(true);
    try {
      await fetch("/api/lead/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, field, value }),
      });
      if (field === "typ_podlahy") setLocalFloor(value);
      else setLocalSpace(value);
    } finally {
      setSavingTag(false);
    }
  }

  const FLOOR_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "jednofarebná epoxidová", label: "Jednofarebná (epoxid)" },
    { value: "chipsová", label: "Chipsová" },
    { value: "mramorová", label: "Mramorová" },
    { value: "metalická", label: "Metalická" },
  ];
  const SPACE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "interiér", label: "Interiér (dom/byt)" },
    { value: "garáž", label: "Garáž" },
    { value: "exteriér", label: "Exteriér" },
    { value: "priemyselná hala", label: "Priemyselná hala" },
  ];

  // User 2026-07-16: „ten callscript nech funguje ale s tym co proste
  // som ti posielal" — reaktivované, používa existujúce scripty v DB
  // (migrácia 31, tagované floor_type + space).
  const answeredCount = Object.keys(answers).length;
  const trigger = (
    <button
      type="button"
      onClick={openModal}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-br from-rose-500 to-rose-700 hover:from-rose-600 hover:to-rose-800 text-white shadow-[0_2px_6px_rgba(225,29,72,0.35)] transition-all"
      title="Otvorí interaktívny scenár hovoru — kliknutím naň idete volať"
    >
      <PhoneCall className="w-3.5 h-3.5" />
      Zavolať + scenár
      {answeredCount > 0 && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] font-black">
          {answeredCount}
        </span>
      )}
    </button>
  );

  const modal = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white shrink-0">
          {/* Top row — lead meno + link späť na kartu */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-1.5 px-5 pt-2.5 pb-1 text-left hover:bg-white/5 transition-colors"
            title="Zavrieť a vrátiť sa na lead kartu"
          >
            <User className="w-3.5 h-3.5 opacity-90" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">
              {leadName?.trim() || "Neznámy lead"}
            </span>
            <span className="text-[10px] opacity-70 ml-1">← späť na lead</span>
          </button>
          {/* Main row — script label + zavolať + close */}
          <div className="px-5 pb-3 flex items-center gap-3">
            <Phone className="w-5 h-5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
                Scenár hovoru
              </div>
              <div className="font-black text-lg leading-tight truncate">
                {selected?.label ?? "Vyber skript"}
              </div>
            </div>
            {leadPhone && (
              <a
                href={`tel:${leadPhone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs px-3 py-2 shadow-md shrink-0"
                title={`Vytočiť ${leadPhone}`}
              >
                <PhoneCall className="w-3.5 h-3.5" />
                Vytočiť
              </a>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading && (
          <div className="p-8 flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="text-sm font-bold">Načítavam skripty…</div>
          </div>
        )}
        {error && (
          <div className="p-5 text-sm text-rose-800 bg-rose-50 space-y-3">
            <div>⚠ {error}</div>
            {/schema cache|Reload PostgREST/i.test(error) && (
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setLoading(true);
                  try {
                    await fetch("/api/admin/reload-postgrest", { method: "POST" });
                    await new Promise((r) => setTimeout(r, 1500));
                    setScripts(null); // force re-fetch
                    openModal();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "reload failed");
                    setLoading(false);
                  }
                }}
                className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-black shadow-sm"
              >
                🔄 Reload cache teraz
              </button>
            )}
          </div>
        )}
        {scripts && scripts.length === 0 && !loading && (
          <div className="p-8 text-center text-slate-500">
            <div className="font-bold text-slate-700 mb-1">
              Zatiaľ žiadne skripty
            </div>
            <div className="text-sm">
              Admin ešte nevytvoril žiadny call skript v /admin/podklady.
            </div>
          </div>
        )}

        {scripts && scripts.length > 0 && (
          <>
            {/* Selector — ak je viac skriptov, dá sa prepnúť */}
            {scripts.length > 1 && (
              <div className="px-5 py-2 border-b bg-slate-50 flex items-center gap-2 overflow-x-auto shrink-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">
                  Iný:
                </div>
                {scripts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={
                      "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors " +
                      (s.id === selectedId
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-slate-700 border-slate-300 hover:border-rose-300")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="p-5 overflow-y-auto flex-1">
              {leadId && (!nFloor || !nSpace) && (
                <div className="mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <span>⚠</span> Doplň chýbajúce tagy — script sa automaticky prepne
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {!nFloor && (
                      <label className="block">
                        <span className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                          Typ podlahy
                        </span>
                        <select
                          disabled={savingTag}
                          value=""
                          onChange={(e) => e.target.value && saveTag("typ_podlahy", e.target.value)}
                          className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="">— vyber —</option>
                          {FLOOR_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {!nSpace && (
                      <label className="block">
                        <span className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                          Priestor
                        </span>
                        <select
                          disabled={savingTag}
                          value=""
                          onChange={(e) => e.target.value && saveTag("priestor", e.target.value)}
                          className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="">— vyber —</option>
                          {SPACE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              )}
              {selected?.description && (
                <div className="text-xs italic text-slate-500 mb-3">
                  {selected.description}
                </div>
              )}
              {selected && selected.steps && selected.steps.length > 0 ? (
                <ScriptStepper
                  steps={selected.steps}
                  stepIdx={stepIdx}
                  setStepIdx={setStepIdx}
                  answers={answers}
                  pendingNote={pendingNote}
                  setPendingNote={setPendingNote}
                  otherText={otherText}
                  setOtherText={setOtherText}
                  ctx={renderCtx}
                  onAnswer={saveAnswer}
                />
              ) : selected ? (
                <pre className="text-sm font-semibold text-slate-900 whitespace-pre-wrap font-sans leading-relaxed">
                  {renderCallscript(selected.body ?? "", renderCtx)}
                </pre>
              ) : null}
            </div>
          </>
        )}

        <div className="border-t px-5 py-3 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm font-black"
          >
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}

/**
 * Interaktívny stepper — kroky zo script.steps JSON.
 * Zobrazí progress bar, aktuálnu otázku, možnosti + textarea na poznámku.
 * Odpovede sa okamžite ukladajú cez onAnswer(stepId, value, note).
 *
 * User 2026-07-16: „chapes ze nech to je interaktivne moznosti nech to
 * ma + poznamku a potom ked skoncis hovor tak mas zodpovedane tie
 * otazky a vies sa k tomu vratit potom".
 */
function ScriptStepper({
  steps,
  stepIdx,
  setStepIdx,
  answers,
  pendingNote,
  setPendingNote,
  otherText,
  setOtherText,
  ctx,
  onAnswer,
}: {
  steps: Step[];
  stepIdx: number;
  setStepIdx: (n: number) => void;
  answers: Record<string, Answer>;
  pendingNote: string;
  setPendingNote: (s: string) => void;
  otherText: string;
  setOtherText: (s: string) => void;
  ctx: {
    leadName?: string | null;
    plocha?: string | number | null;
    lokalita?: string | null;
    typPodlahy?: string | null;
    priestor?: string | null;
  };
  onAnswer: (stepId: string, value: string, note?: string) => Promise<void>;
}) {
  const total = steps.length;
  const idx = Math.max(0, Math.min(stepIdx, total));
  const finished = idx >= total;
  const step = finished ? null : steps[idx];
  const existing = step ? answers[step.id] : undefined;

  React.useEffect(() => {
    setPendingNote(existing?.note ?? "");
    setOtherText("");
  }, [step?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const answeredCount = Object.keys(answers).length;

  function goNext() {
    setStepIdx(Math.min(idx + 1, total));
  }
  function goBack() {
    setStepIdx(Math.max(0, idx - 1));
  }

  async function submit(value: string) {
    if (!step) return;
    await onAnswer(step.id, value, pendingNote);
    goNext();
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
          <div className="text-4xl mb-1">✅</div>
          <div className="font-black text-emerald-900 text-lg">Hotovo — hovor zaznamenaný</div>
          <div className="text-xs text-emerald-800/80 mt-1">
            Všetky odpovede sa uložili k leadu. Vráť sa k nemu a zvoľ ďalší stav.
          </div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Sumár odpovedí
          </div>
          {steps.map((s) => {
            const a = answers[s.id];
            if (s.type === "info") return null;
            return (
              <div key={s.id} className="text-xs">
                <div className="font-bold text-slate-700">{renderText(s.prompt, ctx)}</div>
                <div className="pl-2 mt-0.5">
                  {a ? (
                    <>
                      <span className="font-semibold text-emerald-700">↳ {a.value}</span>
                      {a.note && (
                        <span className="block text-slate-500 italic">📝 {a.note}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 italic">— nevyplnené</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setStepIdx(0)}
          className="text-xs font-bold text-sky-700 hover:underline"
        >
          ← Späť na začiatok scenára
        </button>
      </div>
    );
  }

  if (!step) return null;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
          <span className="text-slate-500">
            Krok {idx + 1} / {total}
          </span>
          <span className="text-emerald-600">{answeredCount} zodpovedaných</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-rose-700 transition-all"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Prompt */}
      <div className="text-sm font-bold text-slate-900 leading-relaxed">
        {renderText(step.type === "info" ? (step as { prompt: string }).prompt : step.prompt, ctx)}
      </div>

      {/* Odpoveď — podľa typu */}
      {step.type === "info" && (
        <div className="text-[11px] text-slate-500 italic">Prečítaj / povedz zákazníkovi ↑</div>
      )}

      {step.type === "choice" && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {step.options.map((o) => {
              const isSelected = existing?.value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => submit(o.value)}
                  className={
                    "rounded-lg border-2 px-3 py-2.5 text-sm font-bold text-left transition-all " +
                    (isSelected
                      ? "border-rose-600 bg-rose-50 text-rose-900"
                      : "border-slate-200 bg-white text-slate-800 hover:border-rose-300 hover:bg-rose-50/40")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {step.allow_other && (
            <div className="pt-1">
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Iné (vlastný text)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Napíš vlastnú odpoveď…"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => otherText.trim() && submit(otherText.trim())}
                  disabled={!otherText.trim()}
                  className="rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-black px-3 disabled:opacity-40"
                >
                  Uložiť
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step.type === "yesno" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => submit("yes")}
            className={
              "rounded-xl border-2 py-3 font-black transition-all " +
              (existing?.value === "yes"
                ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                : "border-slate-200 bg-white text-slate-800 hover:border-emerald-300")
            }
          >
            ✅ Áno
          </button>
          <button
            type="button"
            onClick={() => submit("no")}
            className={
              "rounded-xl border-2 py-3 font-black transition-all " +
              (existing?.value === "no"
                ? "border-rose-600 bg-rose-50 text-rose-900"
                : "border-slate-200 bg-white text-slate-800 hover:border-rose-300")
            }
          >
            ❌ Nie
          </button>
        </div>
      )}

      {step.type === "number" && (
        <div className="flex gap-2">
          <input
            type="number"
            value={existing?.value ?? ""}
            onChange={(e) => setPendingNote(e.target.value)}
            placeholder={step.unit ? `Číslo (${step.unit})` : "Číslo"}
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-bold"
          />
          <button
            type="button"
            onClick={() => submit(pendingNote.trim() || String(existing?.value ?? ""))}
            className="rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm font-black px-4"
          >
            Uložiť
          </button>
        </div>
      )}

      {step.type === "freetext" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={otherText || existing?.value || ""}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Napíš odpoveď…"
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => otherText.trim() && submit(otherText.trim())}
            disabled={!otherText.trim()}
            className="rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm font-black px-4 disabled:opacity-40"
          >
            Uložiť
          </button>
        </div>
      )}

      {/* Poznámka — voliteľná, vždy viditeľná pre non-info kroky */}
      {step.type !== "info" && (
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
            📝 Poznámka (voliteľná)
          </label>
          <textarea
            value={pendingNote}
            onChange={(e) => setPendingNote(e.target.value)}
            rows={2}
            placeholder="Ak zákazník povedal niečo dôležité, zapíš si to tu…"
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
          {existing && pendingNote !== (existing.note ?? "") && (
            <button
              type="button"
              onClick={() => onAnswer(step.id, existing.value, pendingNote)}
              className="mt-1 text-[10px] font-bold text-sky-700 hover:underline"
            >
              💾 Aktualizovať poznámku
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t">
        <button
          type="button"
          onClick={goBack}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Späť
        </button>
        <div className="flex items-center gap-2">
          {step.type !== "info" && !(step as { required?: boolean }).required && (
            <button
              type="button"
              onClick={goNext}
              className="text-[11px] text-slate-500 hover:text-slate-800 italic"
            >
              Preskočiť
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-black px-3 py-1.5"
          >
            Ďalej <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function renderText(
  text: string,
  ctx: {
    leadName?: string | null;
    plocha?: string | number | null;
    lokalita?: string | null;
    typPodlahy?: string | null;
    priestor?: string | null;
  },
): string {
  return renderCallscript(text, ctx);
}
