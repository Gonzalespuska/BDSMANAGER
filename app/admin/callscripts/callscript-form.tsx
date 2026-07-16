"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { toast } from "@/components/ui/toast";
import { CALLSCRIPT_PLACEHOLDERS, renderCallscript } from "@/lib/callscript-render";
import {
  ScriptStepper,
  type Answer,
  type Step as StepperStep,
} from "@/components/leads/callscript-stepper";

type StepType = "info" | "choice" | "yesno" | "number" | "freetext";
type Step = StepperStep;
// Loose helper — pri manipulácii dostaneme all props naraz.
type LooseStep = {
  id: string;
  type: StepType;
  prompt: string;
  options?: Array<{ value: string; label: string }>;
  allow_other?: boolean;
  unit?: string;
  required?: boolean;
};

type Script = {
  id?: string;
  label: string;
  description: string | null;
  floor_type: string | null;
  space: string | null;
  body: string;
  steps: Step[] | null;
  sort_order: number;
  active: boolean;
};

const FLOOR_TYPES = [
  { value: "", label: "— žiadny (fallback pre všetky) —" },
  { value: "jednofarebna", label: "Jednofarebná epoxidová" },
  { value: "chipsova", label: "Chipsová" },
  { value: "mramorova", label: "Mramorová" },
  { value: "metalicka", label: "Metalická" },
];
const SPACES = [
  { value: "", label: "— žiadny —" },
  { value: "dom", label: "Interiér / Dom" },
  { value: "garaz", label: "Garáž" },
  { value: "exterier", label: "Exteriér" },
  { value: "sklad", label: "Sklad / Hala / Dielňa" },
  { value: "firma", label: "Firma / Kancelária" },
];

function randomStepId() {
  return "s" + Math.floor(1000 + (Date.now() % 10000)).toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

export function CallscriptForm({ initial }: { initial: Script }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Script>(initial);
  const [saving, setSaving] = React.useState(false);
  const isEdit = Boolean(initial.id);

  // Live preview state — obchodákov pohľad počas editácie
  const [previewStepIdx, setPreviewStepIdx] = React.useState(0);
  const [previewAnswers, setPreviewAnswers] = React.useState<Record<string, Answer>>({});
  const [previewPendingNote, setPreviewPendingNote] = React.useState("");
  const [previewOtherText, setPreviewOtherText] = React.useState("");
  const [previewCtx, setPreviewCtx] = React.useState({
    leadName: "Ján Novák",
    plocha: "150" as string,
    lokalita: "Prešov",
    typPodlahy: "jednofarebná",
    priestor: "garáž",
  });

  function patch(k: keyof Script, v: unknown) {
    setForm((prev) => ({ ...prev, [k]: v }) as Script);
  }

  const steps = form.steps ?? [];

  function addStep(type: StepType) {
    const base: LooseStep = { id: randomStepId(), type, prompt: "" };
    if (type === "choice") base.options = [{ value: "1", label: "" }];
    patch("steps", [...steps, base as Step]);
  }
  function updateStep(i: number, patchS: Partial<LooseStep>) {
    const next = steps.slice() as LooseStep[];
    next[i] = { ...next[i], ...patchS };
    patch("steps", next as Step[]);
  }
  function removeStep(i: number) {
    const next = steps.slice();
    next.splice(i, 1);
    patch("steps", next);
  }
  function moveStep(i: number, dir: -1 | 1) {
    const next = steps.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch("steps", next);
  }
  function addOption(stepIdx: number) {
    const step = steps[stepIdx];
    if (step.type !== "choice") return;
    const next = steps.slice();
    next[stepIdx] = {
      ...step,
      options: [...(step.options ?? []), { value: String((step.options?.length ?? 0) + 1), label: "" }],
    };
    patch("steps", next);
  }
  function updateOption(stepIdx: number, optIdx: number, val: Partial<{ value: string; label: string }>) {
    const step = steps[stepIdx];
    if (step.type !== "choice" || !step.options) return;
    const next = steps.slice();
    const opts = step.options.slice();
    opts[optIdx] = { ...opts[optIdx], ...val };
    next[stepIdx] = { ...step, options: opts };
    patch("steps", next);
  }
  function removeOption(stepIdx: number, optIdx: number) {
    const step = steps[stepIdx];
    if (step.type !== "choice" || !step.options) return;
    const next = steps.slice();
    const opts = step.options.slice();
    opts.splice(optIdx, 1);
    next[stepIdx] = { ...step, options: opts };
    patch("steps", next);
  }

  async function save() {
    if (!form.label.trim()) return toast.error("Label je povinný");
    if (!form.body.trim() && steps.length === 0) return toast.error("Alebo Body text alebo aspoň 1 krok");
    setSaving(true);
    const payload = {
      ...(isEdit ? { id: form.id } : {}),
      label: form.label.trim(),
      description: form.description?.trim() || null,
      floor_type: form.floor_type || null,
      space: form.space || null,
      body: form.body,
      steps: steps.length > 0 ? steps : null,
      sort_order: form.sort_order || 100,
      active: form.active,
    };
    const r = await fetch("/api/admin/call-scripts", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    setSaving(false);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    toast.success(isEdit ? "Uložené" : "Vytvorené");
    router.push("/admin/callscripts");
    router.refresh();
  }

  function insertPlaceholder(field: "body" | "prompt", tag: string, stepIdx?: number) {
    if (field === "body") {
      patch("body", (form.body ?? "") + tag);
    } else if (stepIdx != null) {
      const s = steps[stepIdx];
      updateStep(stepIdx, { prompt: (s.prompt ?? "") + tag });
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link
          href="/admin/callscripts"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Call scripty
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {isEdit ? "Upraviť call script" : "Nový call script"}
        </h1>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
      <div className="space-y-5">
      {/* Základné */}
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600">Label</span>
            <input
              value={form.label}
              onChange={(e) => patch("label", e.target.value)}
              placeholder="Napr. JEDNOFAREBNÁ — interiér"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 mt-1 text-sm font-bold"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600">Popis (interne)</span>
            <input
              value={form.description ?? ""}
              onChange={(e) => patch("description", e.target.value)}
              placeholder="Kedy použiť tento script"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 mt-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600">Typ podlahy</span>
            <select
              value={form.floor_type ?? ""}
              onChange={(e) => patch("floor_type", e.target.value || null)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 mt-1 text-sm font-bold"
            >
              {FLOOR_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600">Priestor</span>
            <select
              value={form.space ?? ""}
              onChange={(e) => patch("space", e.target.value || null)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 mt-1 text-sm font-bold"
            >
              {SPACES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600">Sort order</span>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => patch("sort_order", Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 mt-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => patch("active", e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-bold">Aktívny (viditeľný pre obchodákov)</span>
          </label>
        </div>
      </section>

      {/* Body text */}
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-black text-slate-900">Body text (fallback ak nemáš kroky)</h2>
            <p className="text-[11px] text-muted-foreground">
              Ak sú Kroky prázdne, obchodák uvidí tento text ako klasický callscript.
            </p>
          </div>
          <PlaceholdersHelp onInsert={(t) => insertPlaceholder("body", t)} />
        </div>
        <textarea
          value={form.body}
          onChange={(e) => patch("body", e.target.value)}
          rows={10}
          placeholder="Dobrý deň, pán {priezvisko}, volám ohľadom cenovej ponuky..."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
      </section>

      {/* Steps */}
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="font-black text-slate-900">Interaktívne kroky ({steps.length})</h2>
          <p className="text-[11px] text-muted-foreground">
            Každý krok = 1 obrazovka pre obchodáka. Odpovede + poznámky sa uložia k leadu.
          </p>
        </div>
        {steps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne kroky. Pridaj prvý krok dole.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, i) => (
              <StepEditor
                key={step.id}
                idx={i}
                step={step}
                onUpdate={(patchS) => updateStep(i, patchS)}
                onRemove={() => removeStep(i)}
                onMove={(dir) => moveStep(i, dir)}
                onAddOption={() => addOption(i)}
                onUpdateOption={(oi, v) => updateOption(i, oi, v)}
                onRemoveOption={(oi) => removeOption(i, oi)}
                onInsertPlaceholder={(t) => insertPlaceholder("prompt", t, i)}
              />
            ))}
          </div>
        )}
        <div className="pt-2 border-t flex flex-wrap gap-2">
          <span className="text-[11px] font-black uppercase text-slate-500 self-center mr-2">Pridať krok:</span>
          {(["info", "choice", "yesno", "number", "freetext"] as StepType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addStep(t)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black px-2 py-1"
            >
              <Plus className="w-3 h-3" />
              {STEP_LABEL[t]}
            </button>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end gap-2 sticky bottom-2 bg-white/95 backdrop-blur border-t p-3 rounded-lg">
        <Link
          href="/admin/callscripts"
          className="inline-flex items-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-black px-4 py-2"
        >
          Zrušiť
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black px-4 py-2 disabled:opacity-50 shadow-md"
        >
          <Save className="w-4 h-4" />
          {saving ? "Ukladám…" : "Uložiť"}
        </button>
      </div>
      </div>{/* end left column */}

      {/* Preview column — kompletný obchodákov modal */}
      <div className="xl:sticky xl:top-3 space-y-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-2">
          <span>👁 Preview — takto to uvidí obchodák</span>
          {steps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPreviewStepIdx(0);
                setPreviewAnswers({});
                setPreviewPendingNote("");
                setPreviewOtherText("");
              }}
              className="ml-auto text-sky-700 hover:underline normal-case tracking-normal font-bold"
            >
              🔄 Reset
            </button>
          )}
        </div>
        {/* Modal shell — 1:1 s CallscriptButton */}
        <div className="rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[75vh] flex flex-col border border-black/10">
          {/* Header (rose gradient) */}
          <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white shrink-0">
            <div className="w-full flex items-center gap-1.5 px-5 pt-2.5 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                👤 {previewCtx.leadName?.trim() || "Neznámy lead"}
              </span>
              <span className="text-[10px] opacity-70 ml-1">← späť na lead</span>
            </div>
            <div className="px-5 pb-3 flex items-center gap-3">
              <div className="w-5 h-5 shrink-0">📞</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
                  Scenár hovoru
                </div>
                <div className="font-black text-lg leading-tight truncate">
                  {form.label || "(bez názvu)"}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 text-white font-black text-xs px-3 py-2 shadow-md shrink-0">
                📞 Vytočiť
              </span>
              <span className="w-8 h-8 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                ✕
              </span>
            </div>
          </div>

          {/* Tag row (typ podlahy + priestor) */}
          {(form.floor_type || form.space) && (
            <div className="px-5 py-2 border-b bg-slate-50 flex items-center gap-1.5 shrink-0 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Tagy scriptu:
              </span>
              {form.floor_type && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  🎨 {form.floor_type}
                </span>
              )}
              {form.space && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                  📍 {form.space}
                </span>
              )}
              <span className="ml-auto text-[10px] italic text-slate-400">
                (obchodák: 150 m² · Prešov)
              </span>
            </div>
          )}

          {/* Body */}
          <div className="p-5 overflow-y-auto flex-1">
            {form.description && (
              <div className="text-xs italic text-slate-500 mb-3">
                {form.description}
              </div>
            )}
            {steps.length > 0 ? (
              <ScriptStepper
                steps={steps}
                stepIdx={previewStepIdx}
                setStepIdx={setPreviewStepIdx}
                answers={previewAnswers}
                pendingNote={previewPendingNote}
                setPendingNote={setPreviewPendingNote}
                otherText={previewOtherText}
                setOtherText={setPreviewOtherText}
                ctx={previewCtx}
                onAnswer={(id, value, note) => {
                  setPreviewAnswers((prev) => ({
                    ...prev,
                    [id]: { value, note: note?.trim() || undefined, at: "preview" },
                  }));
                  setPreviewPendingNote("");
                  setPreviewOtherText("");
                }}
              />
            ) : form.body ? (
              <pre className="text-sm font-semibold text-slate-900 whitespace-pre-wrap font-sans leading-relaxed">
                {renderCallscript(form.body, previewCtx)}
              </pre>
            ) : (
              <div className="text-center text-xs text-slate-400 italic py-8">
                Zatiaľ prázdne — pridaj kroky alebo body text v ľavom stĺpci ↑
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-5 py-3 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
            <span className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-black">
              Zavrieť
            </span>
          </div>
        </div>

        {/* Preview data — nastavovanie mock leadu */}
        <details className="rounded-lg border border-slate-200 bg-slate-50 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-black text-slate-700 select-none">
            🧪 Testovací lead pre preview
          </summary>
          <div className="p-3 pt-1 space-y-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-slate-500">Meno + priezvisko</span>
              <input
                value={previewCtx.leadName ?? ""}
                onChange={(e) => setPreviewCtx({ ...previewCtx, leadName: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1 mt-0.5 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-slate-500">Plocha m²</span>
                <input
                  value={previewCtx.plocha ?? ""}
                  onChange={(e) => setPreviewCtx({ ...previewCtx, plocha: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1 mt-0.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-slate-500">Lokalita</span>
                <input
                  value={previewCtx.lokalita ?? ""}
                  onChange={(e) => setPreviewCtx({ ...previewCtx, lokalita: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1 mt-0.5 text-sm"
                />
              </label>
            </div>
          </div>
        </details>
      </div>
      </div>{/* end grid */}
    </div>
  );
}

const STEP_LABEL: Record<StepType, string> = {
  info: "Info text",
  choice: "Otázka s možnosťami",
  yesno: "Áno / Nie",
  number: "Číslo",
  freetext: "Voľný text",
};

function StepEditor({
  idx,
  step,
  onUpdate,
  onRemove,
  onMove,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onInsertPlaceholder,
}: {
  idx: number;
  step: Step;
  onUpdate: (p: Partial<Step>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onAddOption: () => void;
  onUpdateOption: (i: number, v: Partial<{ value: string; label: string }>) => void;
  onRemoveOption: (i: number) => void;
  onInsertPlaceholder: (tag: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            className="w-6 h-5 rounded hover:bg-slate-200 flex items-center justify-center text-slate-500"
            title="Vyššie"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <GripVertical className="w-3.5 h-3.5 text-slate-400 self-center" aria-hidden />
          <button
            type="button"
            onClick={() => onMove(1)}
            className="w-6 h-5 rounded hover:bg-slate-200 flex items-center justify-center text-slate-500"
            title="Nižšie"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded">
              #{idx + 1}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded">
              {STEP_LABEL[step.type]}
            </span>
            <input
              value={step.id}
              onChange={(e) => onUpdate({ id: e.target.value.trim() })}
              placeholder="id"
              className="text-[11px] font-mono border rounded px-1.5 py-0.5 w-24"
              title="Kľúč pod ktorým sa odpoveď uloží"
            />
            {step.type !== "info" && (
              <label className="text-[11px] flex items-center gap-1 ml-auto">
                <input
                  type="checkbox"
                  checked={step.required ?? false}
                  onChange={(e) => onUpdate({ required: e.target.checked })}
                />
                Povinná
              </label>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase text-slate-600">Text / otázka</span>
              <PlaceholdersHelp compact onInsert={onInsertPlaceholder} />
            </div>
            <textarea
              value={step.prompt}
              onChange={(e) => onUpdate({ prompt: e.target.value })}
              rows={2}
              placeholder={
                step.type === "info"
                  ? "Text ktorý obchodák prečíta zákazníkovi"
                  : "Otázka pre zákazníka (napr. Jedná sa o novostavbu alebo starší betón?)"
              }
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          {step.type === "choice" && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-black uppercase text-slate-600">Možnosti</div>
              {(step.options ?? []).map((o, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <input
                    value={o.value}
                    onChange={(e) => onUpdateOption(oi, { value: e.target.value })}
                    placeholder="value"
                    className="w-20 text-[11px] font-mono border rounded px-1.5 py-1"
                  />
                  <input
                    value={o.label}
                    onChange={(e) => onUpdateOption(oi, { label: e.target.value })}
                    placeholder="Zobrazovaný text (napr. 1–2 roky)"
                    className="flex-1 text-sm border rounded px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveOption(oi)}
                    className="w-6 h-6 rounded hover:bg-rose-100 text-rose-600 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onAddOption}
                  className="text-[11px] font-bold text-sky-700 hover:underline"
                >
                  + Pridať možnosť
                </button>
                <label className="text-[11px] flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={step.allow_other ?? false}
                    onChange={(e) => onUpdate({ allow_other: e.target.checked })}
                  />
                  Povoliť „Iné (vlastný text)"
                </label>
              </div>
            </div>
          )}
          {step.type === "number" && (
            <label className="block">
              <span className="text-[10px] font-black uppercase text-slate-600">Jednotka (voliteľná)</span>
              <input
                value={step.unit ?? ""}
                onChange={(e) => onUpdate({ unit: e.target.value })}
                placeholder="m², €, rokov…"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 mt-1 text-sm"
              />
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="w-8 h-8 rounded-md hover:bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"
          title="Zmazať krok"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PlaceholdersHelp({
  onInsert,
  compact = false,
}: {
  onInsert: (tag: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-bold text-sky-700 hover:underline"
      >
        {compact ? "{ }" : "Vložiť placeholder →"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border-2 border-slate-200 bg-white shadow-2xl p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 px-1">
            Klik = vloží tag
          </div>
          {CALLSCRIPT_PLACEHOLDERS.map((p) => (
            <button
              key={p.tag}
              type="button"
              onClick={() => {
                onInsert(p.tag);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 flex items-start gap-2"
            >
              <code className="bg-slate-100 text-rose-600 text-xs font-mono px-1.5 py-0.5 rounded shrink-0">
                {p.tag}
              </code>
              <span className="text-[11px] text-slate-600">{p.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
