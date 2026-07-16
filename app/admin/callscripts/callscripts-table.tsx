"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Edit, Eye, Power, Trash2, X } from "lucide-react";

import { toast } from "@/components/ui/toast";
import {
  ScriptStepper,
  type Answer,
  type Step as StepperStep,
} from "@/components/leads/callscript-stepper";
import { renderCallscript } from "@/lib/callscript-render";

type Script = {
  id: string;
  label: string;
  description: string | null;
  floor_type: string | null;
  space: string | null;
  body: string;
  steps: Array<Record<string, unknown>> | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export function CallscriptsTable({
  initial,
  role = "obchod",
}: {
  initial: Script[];
  role?: "obchod" | "obhliadky";
}) {
  const router = useRouter();
  const [scripts, setScripts] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const preview = scripts.find((s) => s.id === previewId) ?? null;

  async function toggleActive(s: Script) {
    setBusy(s.id);
    const r = await fetch("/api/admin/call-scripts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setScripts((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
    toast.success(!s.active ? "Aktivovaný" : "Deaktivovaný");
  }

  async function del(s: Script) {
    if (!confirm(`Naozaj natvrdo zmazať script "${s.label}"?`)) return;
    setBusy(s.id);
    const r = await fetch("/api/admin/call-scripts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, hard: true }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setScripts((prev) => prev.filter((x) => x.id !== s.id));
    toast.success("🗑 Zmazaný");
    setTimeout(() => router.refresh(), 900);
  }

  async function duplicate(s: Script) {
    setBusy(s.id);
    const r = await fetch("/api/admin/call-scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: s.label + " (kópia)",
        description: s.description,
        floor_type: s.floor_type,
        space: s.space,
        body: s.body,
        steps: s.steps,
        sort_order: (s.sort_order ?? 100) + 1,
        active: false,
        target_role: role,
      }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setScripts((prev) => [...prev, j.script]);
    toast.success("✅ Duplikát vytvorený");
    setTimeout(() => router.refresh(), 900);
  }

  if (scripts.length === 0) {
    const isObhliadky = role === "obhliadky";
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <div className="font-black text-slate-700 text-lg mb-1">
          Zatiaľ žiadny {isObhliadky ? "obhliadka postup" : "call script"}
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          {isObhliadky
            ? "Klikni „Nový obhliadka postup“ a vytvor scenár pre obhliadkárov."
            : "Klikni „Nový script“ a vytvor scenár pre obchodákov."}
        </div>
        <Link
          href={`/admin/callscripts/new?role=${role}`}
          className={
            "inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-black px-3 py-2 " +
            (isObhliadky
              ? "bg-violet-600 hover:bg-violet-700"
              : "bg-rose-600 hover:bg-rose-700")
          }
        >
          + Nový {isObhliadky ? "obhliadka postup" : "script"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scripts.map((s) => {
        const stepCount = Array.isArray(s.steps) ? s.steps.length : 0;
        return (
          <div
            key={s.id}
            className={
              "rounded-xl border-2 p-3 flex items-start gap-3 " +
              (s.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70")
            }
          >
            <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-black">
              {s.sort_order}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-black text-slate-900 truncate">{s.label}</div>
                {!s.active && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                    Vypnutý
                  </span>
                )}
                {stepCount > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                    {stepCount} krokov
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground flex gap-3 mt-0.5 flex-wrap">
                {s.floor_type && <span>🎨 {s.floor_type}</span>}
                {s.space && <span>📍 {s.space}</span>}
                {!s.floor_type && !s.space && <span className="italic">bez tagov (fallback)</span>}
                <span>· {s.body.length} znakov</span>
              </div>
              {s.description && (
                <div className="text-xs text-slate-500 italic mt-1 line-clamp-1">
                  {s.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewId(s.id)}
                className="w-8 h-8 rounded-md hover:bg-sky-50 flex items-center justify-center"
                title="Preview — takto to uvidí obchodák/obhliadkár"
              >
                <Eye className="w-4 h-4 text-sky-600" />
              </button>
              <button
                type="button"
                onClick={() => toggleActive(s)}
                disabled={busy === s.id}
                className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center disabled:opacity-40"
                title={s.active ? "Deaktivovať (skryť)" : "Aktivovať (znova zobraziť)"}
              >
                <Power
                  className={
                    "w-4 h-4 " + (s.active ? "text-emerald-600" : "text-slate-400")
                  }
                />
              </button>
              <button
                type="button"
                onClick={() => duplicate(s)}
                disabled={busy === s.id}
                className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center disabled:opacity-40"
                title="Duplikovať"
              >
                <Copy className="w-4 h-4 text-slate-600" />
              </button>
              <Link
                href={`/admin/callscripts/${s.id}`}
                className="w-8 h-8 rounded-md hover:bg-sky-50 flex items-center justify-center"
                title="Upraviť"
              >
                <Edit className="w-4 h-4 text-sky-600" />
              </Link>
              <button
                type="button"
                onClick={() => del(s)}
                disabled={busy === s.id}
                className="w-8 h-8 rounded-md hover:bg-rose-50 flex items-center justify-center disabled:opacity-40"
                title="Zmazať"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
              </button>
            </div>
          </div>
        );
      })}
      {preview && (
        <PreviewModal
          script={preview}
          role={role}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

function PreviewModal({
  script,
  role,
  onClose,
}: {
  script: Script;
  role: "obchod" | "obhliadky";
  onClose: () => void;
}) {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [pendingNote, setPendingNote] = React.useState("");
  const [otherText, setOtherText] = React.useState("");
  const steps = (script.steps ?? []) as StepperStep[];
  const ctx = {
    leadName: "Ján Novák",
    plocha: "150",
    lokalita: "Prešov",
    typPodlahy: script.floor_type,
    priestor: script.space,
  };
  const isObhliadky = role === "obhliadky";

  React.useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[85vh] w-full max-w-lg flex flex-col border border-black/10"
      >
        <div
          className={
            "text-white shrink-0 bg-gradient-to-br " +
            (isObhliadky
              ? "from-violet-500 to-violet-700"
              : "from-rose-500 to-rose-700")
          }
        >
          <div className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider opacity-90">
            👤 {ctx.leadName} — mock lead
          </div>
          <div className="px-5 pb-3 flex items-center gap-3">
            <div className="w-5 h-5 shrink-0">
              {isObhliadky ? "🔍" : "📞"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
                {isObhliadky ? "Obhliadka postup" : "Scenár hovoru"}
              </div>
              <div className="font-black text-lg leading-tight truncate">
                {script.label || "(bez názvu)"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0"
              title="Zavrieť (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {(script.floor_type || script.space) && (
          <div className="px-5 py-2 border-b bg-slate-50 flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Tagy:
            </span>
            {script.floor_type && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                🎨 {script.floor_type}
              </span>
            )}
            {script.space && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                📍 {script.space}
              </span>
            )}
          </div>
        )}
        <div className="p-5 overflow-y-auto flex-1">
          {script.description && (
            <div className="text-xs italic text-slate-500 mb-3">
              {script.description}
            </div>
          )}
          {steps.length > 0 ? (
            <ScriptStepper
              steps={steps}
              stepIdx={stepIdx}
              setStepIdx={setStepIdx}
              answers={answers}
              pendingNote={pendingNote}
              setPendingNote={setPendingNote}
              otherText={otherText}
              setOtherText={setOtherText}
              ctx={ctx}
              onAnswer={(id, value, note) => {
                setAnswers((p) => ({
                  ...p,
                  [id]: { value, note: note?.trim() || undefined, at: "preview" },
                }));
                setPendingNote("");
                setOtherText("");
              }}
            />
          ) : script.body ? (
            <pre className="text-sm font-semibold text-slate-900 whitespace-pre-wrap font-sans leading-relaxed">
              {renderCallscript(script.body, ctx)}
            </pre>
          ) : (
            <div className="text-center text-xs text-slate-400 italic py-8">
              Prázdne — script nemá kroky ani body text.
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] text-slate-500 italic">
            Preview — odpovede sa nikam neukladajú
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm font-black"
          >
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  );
}
