"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { renderCallscript } from "@/lib/callscript-render";

export type Step =
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
  | {
      id: string;
      type: "number";
      prompt: string;
      unit?: string;
      required?: boolean;
    }
  | { id: string; type: "freetext"; prompt: string; required?: boolean };

export type Answer = {
  value: string;
  note?: string;
  at: string;
};

export type StepperCtx = {
  leadName?: string | null;
  agentName?: string | null;
  plocha?: string | number | null;
  lokalita?: string | null;
  typPodlahy?: string | null;
  priestor?: string | null;
};

export function ScriptStepper({
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
  ctx: StepperCtx;
  onAnswer: (stepId: string, value: string, note?: string) => Promise<void> | void;
}) {
  const total = steps.length;
  const idx = Math.max(0, Math.min(stepIdx, total));
  const finished = idx >= total;
  const step = finished ? null : steps[idx];
  const existing = step ? answers[step.id] : undefined;

  React.useEffect(() => {
    setPendingNote(existing?.note ?? "");
    setOtherText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

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
          <div className="font-black text-emerald-900 text-lg">
            Hotovo — hovor zaznamenaný
          </div>
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
                <div className="font-bold text-slate-700">
                  {renderCallscript(s.prompt, ctx)}
                </div>
                <div className="pl-2 mt-0.5">
                  {a ? (
                    <>
                      <span className="font-semibold text-emerald-700">
                        ↳ {a.value}
                      </span>
                      {a.note && (
                        <span className="block text-slate-500 italic">
                          📝 {a.note}
                        </span>
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
      <div className="text-sm font-bold text-slate-900 leading-relaxed whitespace-pre-wrap">
        {renderCallscript(step.prompt, ctx)}
      </div>

      {/* Odpoveď — podľa typu */}
      {step.type === "info" && (
        <div className="text-[11px] text-slate-500 italic">
          Prečítaj / povedz zákazníkovi ↑
        </div>
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
                  {o.label || (
                    <span className="italic text-slate-400">(prázdny label)</span>
                  )}
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
            value={otherText || existing?.value || ""}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder={step.unit ? `Číslo (${step.unit})` : "Číslo"}
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-bold"
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
