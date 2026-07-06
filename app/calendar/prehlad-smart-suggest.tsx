"use client";

import * as React from "react";
import {
  ClipboardList,
  Hammer,
  MapPin,
  Ruler,
  Sparkles,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Smart-suggest bars pre obchodáka (v Prehľad paneli pod kalendárom).
 *
 * PREČO:
 *   Obchodák volá so zákazníkom → pýta si termín → potrebuje RÝCHLO
 *   povedať kedy vieme prísť. Zadá mesto (Martin, Košice...) a systém
 *   navrhne najlepší deň podľa toho ako sú vybookovaní obhliadkari /
 *   realizátori a či už niekto do daného mesta / smeru neide.
 *
 * OBHLIADKA:
 *   Vstup: mesto zákazníka
 *   Logika: nájdi deň keď už obhliadkár do tohto mesta / smeru IDE — vtedy
 *   je to nákladovo najlepšie (obhliadka trvá 10 min, cesta do Martina 2 h).
 *
 * REALIZÁCIA:
 *   Vstup: mesto + m² + typ podlahy
 *   Logika: podľa m² sa určí či sa dá spojiť s inou zákazkou:
 *     • 100+ m² = solo deň (garáž hala, obývačka)
 *     • 20 m² (bežná garáž) = dá sa až 5 za deň jednému tímu
 *     • Multi-day plán ak zákazka trvá viac dní
 *
 * ROZPRACOVANÉ — pozri TODO.md „SMART-SUGGEST + TÍM MODEL". Zatiaľ UI
 * kostra + placeholder návrhy (aby obchodák videl kam to smeruje).
 */
export function PrehladSmartSuggest() {
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-3.5 space-y-3">
      <header className="inline-flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
        <div>
          <h3 className="text-sm font-extrabold tracking-tight text-amber-900">
            💡 Checkni si kedy sa oplatí
          </h3>
          <p className="text-[11px] text-amber-800/80 leading-snug">
            Volaš so zákazníkom? Napíš mesto — systém navrhne najlepší deň{" "}
            <strong>+ presný čas</strong> podľa toho ako sú obhliadkari
            rozplánovaní (obhliadka trvá 30 min, plus cesta do ďalšieho mesta).
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-2.5">
        <ObhliadkaSuggestBar />
        <RealizaciaSuggestBar />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function ObhliadkaSuggestBar() {
  const [city, setCity] = React.useState("");
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);

  React.useEffect(() => {
    if (!city.trim() || city.length < 3) {
      setSuggestion(null);
      return;
    }
    // 🚧 Placeholder — zatiaľ deterministický "návrh" z hash mesta.
    // Reálna logika príde po SQL migrácii 10_role_handoff — query nad
    // priradenými obhliadkami (assignments) + geo-agregácia podľa smeru.
    const t = setTimeout(() => setSuggestion(fakeSuggest(city, "obhliadka")), 300);
    return () => clearTimeout(t);
  }, [city]);

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <ClipboardList className="w-4 h-4 text-violet-700" aria-hidden />
          <span className="text-xs font-extrabold uppercase tracking-wider text-violet-900">
            Obhliadka
          </span>
        </div>
        <div className="flex-1 min-w-[180px] relative">
          <MapPin
            className="w-3.5 h-3.5 text-violet-500 absolute left-2.5 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mesto zákazníka — napr. Martin"
            className="h-9 pl-8 border-violet-200 bg-white focus-visible:ring-violet-400"
          />
        </div>
        <SuggestionBadge suggestion={suggestion} tint="violet" />
      </div>
    </div>
  );
}

function RealizaciaSuggestBar() {
  const [city, setCity] = React.useState("");
  const [m2, setM2] = React.useState("");
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);

  React.useEffect(() => {
    if (!city.trim() || city.length < 3) {
      setSuggestion(null);
      return;
    }
    const t = setTimeout(
      () => setSuggestion(fakeSuggest(city, "realizacia", parseFloat(m2) || 0)),
      300,
    );
    return () => clearTimeout(t);
  }, [city, m2]);

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <Hammer className="w-4 h-4 text-emerald-700" aria-hidden />
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
            Realizácia
          </span>
        </div>
        <div className="flex-1 min-w-[160px] relative">
          <MapPin
            className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mesto — napr. Bratislava"
            className="h-9 pl-8 border-emerald-200 bg-white focus-visible:ring-emerald-400"
          />
        </div>
        <div className="w-[120px] relative">
          <Ruler
            className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="number"
            inputMode="decimal"
            value={m2}
            onChange={(e) => setM2(e.target.value)}
            placeholder="m²"
            className="h-9 pl-8 border-emerald-200 bg-white focus-visible:ring-emerald-400 tabular-nums"
          />
        </div>
        <SuggestionBadge suggestion={suggestion} tint="emerald" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

type Suggestion = {
  when: string; // dátum, napr. "pondelok 06. 07."
  time?: string | null; // presný čas napr. "15:00"
  reason: string;
  confidence: "high" | "medium" | "low";
};

function SuggestionBadge({
  suggestion,
  tint,
}: {
  suggestion: Suggestion | null;
  tint: "violet" | "emerald";
}) {
  if (!suggestion) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        Zadaj mesto a systém navrhne najlepší termín
      </div>
    );
  }
  const bg = {
    violet: "bg-violet-100 border-violet-300 text-violet-900",
    emerald: "bg-emerald-100 border-emerald-300 text-emerald-900",
  }[tint];
  return (
    <div
      className={cn(
        "inline-flex items-start gap-2 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold shadow-sm",
        bg,
      )}
      title={suggestion.reason}
    >
      <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <div>
        <div className="font-extrabold inline-flex items-center gap-1.5">
          {suggestion.when}
          {suggestion.time && (
            <span className="tabular-nums bg-white/70 px-1.5 py-0.5 rounded text-[11px]">
              🕒 {suggestion.time}
            </span>
          )}
        </div>
        <div className="text-[10px] font-medium opacity-80 leading-tight">
          {suggestion.reason}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 🚧 Placeholder návrh — deterministický z city (aby demo malo obsah).
// Reálna logika príde po SQL migrácii + assignments tabuľke.
//
// TIME LOGIC (obhliadka):
//   • Obhliadka trvá cca 30 min
//   • Ak má obhliadkár predošlú obhliadku v inom meste, spočíta sa čas:
//       koniec predošlej = štart + 30 min
//       štart našej      = koniec predošlej + cesta medzi mestami
//   • Fake dáta simulujú: „Ivan končí v Martine 14:30 → v Žiline 15:00"

// Približné časy medzi hlavnými SK mestami (v minútach jednosmerne).
// Zjednodušené na dvojicu miest — reálne pôjde cez lat/lon.
const TRAVEL_MIN: Record<string, number> = {
  martin: 30, // z Martina do najbližšieho (Žilina)
  zilina: 30,
  bratislava: 90,
  trnava: 45,
  nitra: 60,
  banska: 45,
  kosice: 120,
  presov: 30,
  poprad: 60,
  trencin: 45,
  ba: 90,
};

function fakeSuggest(
  city: string,
  kind: "obhliadka" | "realizacia",
  m2 = 0,
): Suggestion {
  const c = city.trim().toLowerCase();
  // deterministic hash → day of month + hour
  let h = 0;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) | 0;
  const dayOffset = (Math.abs(h) % 12) + 1;
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const when = d.toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

  if (kind === "obhliadka") {
    // Simuluj predošlú obhliadku v inom meste — vypočítaj presný čas
    const prevCities = ["Martin", "Bratislava", "Košice", "Nitra"];
    const prevCity = prevCities[Math.abs(h) % prevCities.length];
    const prevHour = 13 + (Math.abs(h) % 3); // 13, 14 alebo 15
    const prevEnd = prevHour * 60 + 30; // + 30 min obhliadka
    const travel = TRAVEL_MIN[c] ?? 60;
    const startMin = prevEnd + travel;
    const startH = Math.floor(startMin / 60);
    const startM = startMin % 60;
    const time = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;

    const reason = `Predošlá v ${prevCity} končí ${prevHour}:30, cesta do ${city} ~${travel} min → nová obhliadka o ${time}`;
    return {
      when,
      time,
      reason,
      confidence: "medium",
    };
  }
  // realizacia — realizácia trvá celý deň, nemá konkrétny čas, iba dátum
  const daysNeeded = m2 > 100 ? 2 : m2 > 60 ? 1 : 1;
  const teamNote =
    m2 <= 25
      ? `Tím A má voľné okno v ${city} — dá sa spojiť s inou garážou tento deň`
      : m2 <= 60
        ? `Tím B je v smere ${city} — 1-denná realizácia sedí`
        : `Realizácia potrebuje ${daysNeeded} deň${daysNeeded > 1 ? "i" : ""} — Tím C má voľno`;
  return {
    when,
    time: null,
    reason: teamNote,
    confidence: m2 > 0 ? "medium" : "low",
  };
}
