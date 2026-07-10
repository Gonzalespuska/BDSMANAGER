"use client";

import * as React from "react";
import {
  AlertCircle,
  ChevronRight,
  Copy,
  Lightbulb,
  MessageSquare,
  Phone,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  CALL_SCRIPTS,
  findScript,
  PRIESTOR_LABELS,
  TYP_LABELS,
  type Priestor,
  type TypPodlahy,
} from "@/lib/data/call-scripts";

/**
 * Interaktívny picker call scriptov.
 *
 * UX:
 *   1. Klik Priestor (Interiér / Garáž / Priemysel)
 *   2. Klik Typ podlahy (Chipsová / Mramorová / Metalická / Jednofarebná /
 *      Antistatická / Neviem-poradte)
 *   3. Zobrazí sa šitý script — otváracia veta, kvalifikačné otázky, kľúčové
 *      body, námietky s odpoveďami, cenový rozsah, uzatvorenie, tipy.
 */

export function CallScriptsPicker() {
  const [priestor, setPriestor] = React.useState<Priestor | null>(null);
  const [typ, setTyp] = React.useState<TypPodlahy | null>(null);

  const script = React.useMemo(() => {
    if (!priestor || !typ) return null;
    return findScript(priestor, typ);
  }, [priestor, typ]);

  // Ktoré typy podlahy sú relevantné pre daný priestor
  const relevantTypy: TypPodlahy[] = React.useMemo(() => {
    if (!priestor) return [];
    if (priestor === "interier")
      return ["chipsova", "mramorova", "metalicka", "jednofarebna", "univerzalna"];
    if (priestor === "garaz")
      return ["chipsova", "jednofarebna", "univerzalna"];
    if (priestor === "priemysel")
      return ["antistaticka", "jednofarebna", "univerzalna"];
    return [];
  }, [priestor]);

  return (
    <div className="space-y-4">
      {/* Krok 1: PRIESTOR */}
      <div className="rounded-2xl border-2 bg-white p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" />
          Krok 1 — Kam zákazník chce podlahu?
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRIESTOR_LABELS) as Priestor[]).map((p) => {
            const isActive = priestor === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPriestor(p);
                  setTyp(null);
                }}
                className={cn(
                  "rounded-xl border-2 px-3 py-4 text-sm font-black transition-all",
                  isActive
                    ? "bg-sky-500 text-white border-sky-600 shadow-md scale-[1.02]"
                    : "border-slate-200 hover:border-sky-400 hover:bg-sky-50",
                )}
              >
                {PRIESTOR_LABELS[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Krok 2: TYP PODLAHY (iba ak vybraný priestor) */}
      {priestor && (
        <div className="rounded-2xl border-2 bg-white p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Krok 2 — Aký typ podlahy chce?
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {relevantTypy.map((t) => {
              const isActive = typ === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTyp(t)}
                  className={cn(
                    "rounded-xl border-2 px-3 py-3 text-sm font-bold transition-all text-left",
                    isActive
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-md scale-[1.02]"
                      : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50",
                  )}
                >
                  {TYP_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SCRIPT */}
      {script && (
        <ScriptDisplay script={script} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════

function ScriptDisplay({
  script,
}: {
  script: ReturnType<typeof findScript>;
}) {
  function copyOpening() {
    navigator.clipboard.writeText(script.opening);
    toast.success("Otváracia veta skopírovaná");
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-2xl border-4 border-sky-300 bg-gradient-to-br from-sky-50 to-sky-100 p-5 shadow-md">
        <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700 mb-1">
          📞 Script
        </div>
        <h2 className="text-xl font-black text-sky-900">{script.title}</h2>
        <p className="text-sm text-sky-800 mt-1">{script.subtitle}</p>
      </div>

      {/* Opening */}
      <Section
        icon={<Phone className="w-4 h-4" />}
        title="Otváracia veta"
        color="emerald"
      >
        <div className="relative">
          <p className="text-sm leading-relaxed pr-8 whitespace-pre-wrap font-medium">
            „{script.opening}"
          </p>
          <button
            type="button"
            onClick={copyOpening}
            className="absolute top-0 right-0 p-1.5 rounded-md bg-white border hover:bg-emerald-50 hover:border-emerald-400 text-emerald-700"
            aria-label="Kopírovať"
            title="Kopírovať otváraciu vetu"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </Section>

      {/* Qualifying */}
      <Section
        icon={<MessageSquare className="w-4 h-4" />}
        title="Kvalifikačné otázky (do 2 minút)"
        color="sky"
      >
        <ol className="space-y-2">
          {script.qualifying_questions.map((q, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug">
              <span className="shrink-0 w-6 h-6 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center text-xs font-black">
                {i + 1}
              </span>
              <span className="flex-1 pt-0.5">{q}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Key points */}
      <Section
        icon={<Lightbulb className="w-4 h-4" />}
        title="Kľúčové argumenty (použi 2-3 podľa reakcie)"
        color="amber"
      >
        <ul className="space-y-2">
          {script.key_points.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug">
              <span className="text-amber-600 shrink-0 mt-0.5">→</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Objections */}
      <Section
        icon={<AlertCircle className="w-4 h-4" />}
        title="Najčastejšie námietky + odpovede"
        color="rose"
      >
        <div className="space-y-3">
          {script.objections.map((o, i) => (
            <details
              key={i}
              className="rounded-lg border-2 border-rose-200 bg-white overflow-hidden"
            >
              <summary className="px-3 py-2 bg-rose-50 hover:bg-rose-100 cursor-pointer text-sm font-bold text-rose-900 inline-flex items-center gap-2 w-full">
                <span className="shrink-0 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs font-black">
                  {i + 1}
                </span>
                <span className="flex-1">„{o.objection}"</span>
                <ChevronRight className="w-4 h-4 opacity-60" />
              </summary>
              <div className="px-3 py-2.5 text-sm leading-relaxed border-t border-rose-200">
                <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 mb-1">
                  Odpoveď
                </div>
                {o.response}
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* Price range */}
      <Section
        icon={<Target className="w-4 h-4" />}
        title="Cenový rozsah (čo môžeš citovať bez obhliadky)"
        color="violet"
      >
        <div className="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white p-4 shadow-md">
          <div className="text-4xl font-black tabular-nums">
            {script.price_range.low}–{script.price_range.high}{" "}
            <span className="text-xl opacity-80">€/m²</span>
          </div>
          <div className="text-sm text-violet-100 mt-1.5 leading-snug">
            {script.price_range.note}
          </div>
        </div>
      </Section>

      {/* Closing */}
      <Section
        icon={<ChevronRight className="w-4 h-4" />}
        title="Uzatvárajúca veta"
        color="emerald"
      >
        <p className="text-sm leading-relaxed font-medium">
          „{script.closing}"
        </p>
      </Section>

      {/* Tips */}
      <Section
        icon={<Lightbulb className="w-4 h-4" />}
        title="Tipy z praxe"
        color="slate"
      >
        <ul className="space-y-1.5">
          {script.tips.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug">
              <span className="text-slate-500 shrink-0">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════

function Section({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: "sky" | "emerald" | "amber" | "rose" | "violet" | "slate";
  children: React.ReactNode;
}) {
  const c = {
    sky: "border-sky-200 bg-sky-50/40",
    emerald: "border-emerald-200 bg-emerald-50/40",
    amber: "border-amber-200 bg-amber-50/40",
    rose: "border-rose-200 bg-rose-50/40",
    violet: "border-violet-200 bg-violet-50/40",
    slate: "border-slate-200 bg-slate-50/40",
  }[color];
  const titleClr = {
    sky: "text-sky-800",
    emerald: "text-emerald-800",
    amber: "text-amber-800",
    rose: "text-rose-800",
    violet: "text-violet-800",
    slate: "text-slate-700",
  }[color];

  return (
    <div className={cn("rounded-2xl border-2 p-4", c)}>
      <div
        className={cn(
          "text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 mb-2.5",
          titleClr,
        )}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
