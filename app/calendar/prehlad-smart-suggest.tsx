"use client";

import * as React from "react";
import {
  ClipboardList,
  Hammer,
  MapPin,
  RefreshCw,
  Ruler,
  Sparkles,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SK_CITIES } from "@/lib/data/sk-cities";

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
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-3 sm:p-3.5 space-y-2 sm:space-y-3">
      <header className="inline-flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
        <h3 className="text-sm font-extrabold tracking-tight text-amber-900">
          💡 Kedy sa oplatí volať späť
        </h3>
      </header>
      <p className="text-[11px] text-amber-800/80 leading-snug sm:hidden">
        Napíš mesto, systém navrhne najlepší deň + čas.
      </p>
      <p className="text-[11px] text-amber-800/80 leading-snug hidden sm:block">
        Volaš so zákazníkom? Napíš mesto — systém navrhne najlepší deň{" "}
        <strong>+ presný čas</strong> podľa toho ako sú obhliadkari
        rozplánovaní (obhliadka trvá 30 min, plus cesta do ďalšieho mesta).
      </p>
      <div className="grid grid-cols-1 gap-2">
        <ObhliadkaSuggestBar />
        <RealizaciaSuggestBar />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function ObhliadkaSuggestBar() {
  const [city, setCity] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);

  React.useEffect(() => {
    if (!city.trim() || city.length < 3) {
      setSuggestion(null);
      return;
    }
    const t = setTimeout(
      () => setSuggestion(fakeSuggest(city, "obhliadka", 0, attempt)),
      300,
    );
    return () => clearTimeout(t);
  }, [city, attempt]);

  // Reset attempt keď user zmení mesto — začni od najlepšieho
  React.useEffect(() => {
    setAttempt(0);
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
          {/* User 2026-07-12: „a nedoplna to intuitivne" — native datalist
              autocomplete zo SK_CITIES. Fuzzy match funguje v každom browseri. */}
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            list="sk-cities-obhliadka"
            autoComplete="off"
            autoCapitalize="words"
            placeholder="Mesto zákazníka — napr. Martin"
            className="h-9 pl-8 border-violet-200 bg-white focus-visible:ring-violet-400"
          />
          <datalist id="sk-cities-obhliadka">
            {SK_CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <SuggestionBadge
          suggestion={suggestion}
          tint="violet"
          attempt={attempt}
          onReroll={() => setAttempt((v) => v + 1)}
        />
      </div>
    </div>
  );
}

function RealizaciaSuggestBar() {
  const [city, setCity] = React.useState("");
  const [m2, setM2] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);

  React.useEffect(() => {
    if (!city.trim() || city.length < 3) {
      setSuggestion(null);
      return;
    }
    const t = setTimeout(
      () =>
        setSuggestion(
          fakeSuggest(city, "realizacia", parseFloat(m2) || 0, attempt),
        ),
      300,
    );
    return () => clearTimeout(t);
  }, [city, m2, attempt]);

  React.useEffect(() => {
    setAttempt(0);
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
            list="sk-cities-realizacia"
            autoComplete="off"
            autoCapitalize="words"
            placeholder="Mesto — napr. Bratislava"
            className="h-9 pl-8 border-emerald-200 bg-white focus-visible:ring-emerald-400"
          />
          <datalist id="sk-cities-realizacia">
            {SK_CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
        <SuggestionBadge
          suggestion={suggestion}
          tint="emerald"
          attempt={attempt}
          onReroll={() => setAttempt((v) => v + 1)}
        />
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
  attempt,
  onReroll,
}: {
  suggestion: Suggestion | null;
  tint: "violet" | "emerald";
  attempt: number;
  onReroll: () => void;
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
  const rerollBg = {
    violet: "bg-violet-200/70 hover:bg-violet-300 text-violet-900",
    emerald: "bg-emerald-200/70 hover:bg-emerald-300 text-emerald-900",
  }[tint];
  // Rank prefix — 1./2./3. návrh podľa attempt
  const rank = attempt === 0 ? "🥇" : attempt === 1 ? "🥈" : attempt === 2 ? "🥉" : `#${attempt + 1}`;
  return (
    <div
      className={cn(
        "inline-flex items-start gap-2 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold shadow-sm",
        bg,
      )}
      title={suggestion.reason}
    >
      <span className="text-sm mt-0.5 shrink-0" aria-hidden>
        {rank}
      </span>
      <div className="min-w-0">
        <div className="font-extrabold inline-flex items-center gap-1.5 flex-wrap">
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
      {/* Reroll button — zákazník povedal že tento termín mu nevyhovuje.
          Klik → 2. najlepší návrh (attempt++). Vždy dostupný. */}
      <button
        type="button"
        onClick={onReroll}
        className={cn(
          "shrink-0 self-center inline-flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors text-[10px] font-black uppercase tracking-wider",
          rerollBg,
        )}
        title="Zákazníkovi termín nevyhovuje → daj ďalší návrh"
        aria-label="Ďalší návrh"
      >
        <RefreshCw className="w-3 h-3" aria-hidden />
        Ďalší
      </button>
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
  attempt = 0,
): Suggestion {
  const c = city.trim().toLowerCase();
  // deterministic hash → day of month + hour; attempt posunie o ďalšie dni
  let h = 0;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) | 0;
  // Každý attempt = posun o 2-4 dni + iný prevCity + iný prevHour
  const baseOffset = (Math.abs(h) % 12) + 1;
  const attemptShift = attempt * (3 + (Math.abs(h) % 3));
  const dayOffset = baseOffset + attemptShift;
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const when = d.toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

  if (kind === "obhliadka") {
    const prevCities = ["Martin", "Bratislava", "Košice", "Nitra", "Žilina", "Prešov"];
    const prevCity = prevCities[Math.abs(h + attempt * 7) % prevCities.length];
    const prevHour = 10 + ((Math.abs(h) + attempt * 2) % 6); // 10..15
    const prevEnd = prevHour * 60 + 30;
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
      // Prvý návrh = high, ďalšie = medium/low
      confidence: attempt === 0 ? "high" : attempt === 1 ? "medium" : "low",
    };
  }
  const daysNeeded = m2 > 100 ? 2 : 1;
  const teamNames = ["A", "B", "C", "D"];
  const teamName = teamNames[attempt % teamNames.length];
  const teamNote =
    m2 <= 25
      ? `Tím ${teamName} má voľné okno v ${city} — dá sa spojiť s inou garážou tento deň`
      : m2 <= 60
        ? `Tím ${teamName} je v smere ${city} — 1-denná realizácia sedí`
        : `Realizácia potrebuje ${daysNeeded} deň${daysNeeded > 1 ? "i" : ""} — Tím ${teamName} má voľno`;
  return {
    when,
    time: null,
    reason: teamNote,
    confidence: attempt === 0 && m2 > 0 ? "high" : "medium",
  };
}
