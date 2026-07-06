"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { completeInspectionAction } from "@/app/agent/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InspectionResult {
  measured_m2?: number;
  substrate_condition?: string;
  substrate_notes?: string;
  recommended_service?: string;
  agent_note?: string;
  feasible?: boolean;
  price_estimate?: number;
  /** Odtrhový test (adhesion pull-off) v MPa. Prah OK >= 1.5 MPa. */
  adhesion_mpa?: number;
  /** Vlhkosť podkladu — priemer z meraní (%) */
  moisture_pct?: number;
  /** Maximálna nameraná vlhkosť (%) — najhorší bod */
  moisture_max_pct?: number;
  /** Teplota vzduchu (°C) pri obhliadke */
  air_temperature?: number;
  /** Relatívna vlhkosť vzduchu (%) pri obhliadke */
  air_humidity_pct?: number;
}

export function InspectionForm({
  leadId,
  existingResult,
}: {
  leadId: string;
  existingResult: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [measuredM2, setMeasuredM2] = React.useState<string>(
    typeof (existingResult as InspectionResult)?.measured_m2 === "number"
      ? String((existingResult as InspectionResult).measured_m2)
      : "",
  );
  const [substrateCondition, setSubstrateCondition] = React.useState(
    (existingResult as InspectionResult)?.substrate_condition ?? "good",
  );
  const [substrateNotes, setSubstrateNotes] = React.useState(
    (existingResult as InspectionResult)?.substrate_notes ?? "",
  );
  const [recommendedService, setRecommendedService] = React.useState(
    (existingResult as InspectionResult)?.recommended_service ?? "",
  );
  const [agentNote, setAgentNote] = React.useState(
    (existingResult as InspectionResult)?.agent_note ?? "",
  );
  const [feasible, setFeasible] = React.useState<boolean>(
    (existingResult as InspectionResult)?.feasible ?? true,
  );
  const [adhesionMpa, setAdhesionMpa] = React.useState<string>(
    typeof (existingResult as InspectionResult)?.adhesion_mpa === "number"
      ? String((existingResult as InspectionResult).adhesion_mpa)
      : "",
  );
  const [moisturePct, setMoisturePct] = React.useState<string>(
    typeof (existingResult as InspectionResult)?.moisture_pct === "number"
      ? String((existingResult as InspectionResult).moisture_pct)
      : "",
  );
  const [moistureMaxPct, setMoistureMaxPct] = React.useState<string>(
    typeof (existingResult as InspectionResult)?.moisture_max_pct === "number"
      ? String((existingResult as InspectionResult).moisture_max_pct)
      : "",
  );
  const [airTemp, setAirTemp] = React.useState<string>(
    typeof (existingResult as InspectionResult)?.air_temperature === "number"
      ? String((existingResult as InspectionResult).air_temperature)
      : "",
  );
  const [airHumidity, setAirHumidity] = React.useState<string>(
    typeof (existingResult as InspectionResult)?.air_humidity_pct === "number"
      ? String((existingResult as InspectionResult).air_humidity_pct)
      : "",
  );

  // Auto-verdict — je zákazka realizovateľná?
  const adhesionN = parseFloat(adhesionMpa) || 0;
  const moistureN = parseFloat(moisturePct) || 0;
  const adhesionVerdict =
    adhesionMpa === ""
      ? null
      : adhesionN >= 1.5
        ? "ok"
        : adhesionN >= 1.0
          ? "warn"
          : "bad";
  const moistureVerdict =
    moisturePct === "" ? null : moistureN <= 4 ? "ok" : moistureN <= 5 ? "warn" : "bad";

  async function submit() {
    const m2Num = parseFloat(measuredM2) || 0;
    if (m2Num <= 0) {
      alert("Zadaj skutočnú plochu v m²");
      return;
    }
    if (!agentNote.trim()) {
      alert("Napíš aspoň krátku poznámku pre obchodníka.");
      return;
    }

    setBusy(true);
    const result: InspectionResult = {
      measured_m2: m2Num,
      substrate_condition: substrateCondition,
      substrate_notes: substrateNotes.trim() || undefined,
      recommended_service: recommendedService.trim() || undefined,
      agent_note: agentNote.trim(),
      feasible,
      adhesion_mpa: adhesionMpa ? parseFloat(adhesionMpa) : undefined,
      moisture_pct: moisturePct ? parseFloat(moisturePct) : undefined,
      moisture_max_pct: moistureMaxPct
        ? parseFloat(moistureMaxPct)
        : undefined,
      air_temperature: airTemp ? parseFloat(airTemp) : undefined,
      air_humidity_pct: airHumidity ? parseFloat(airHumidity) : undefined,
    };
    const res = await completeInspectionAction(leadId, result as unknown as Record<string, unknown>);
    setBusy(false);
    if (!res.ok) {
      alert(`Chyba: ${res.error}`);
      return;
    }
    alert("✅ Obhliadka dokončená. Obchodník bol notifikovaný.");
    router.push("/obhliadky");
  }

  return (
    <section className="rounded-2xl border-2 border-violet-300 bg-violet-50/40 p-5 space-y-4">
      <header>
        <h2 className="font-bold inline-flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-violet-600" aria-hidden />
          Vyplniť výsledok obhliadky
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Po odoslaní dostane obchodník notifikáciu a môže poslať cenovú ponuku zákazníkovi.
        </p>
      </header>

      {/* Reálne rozmery */}
      <div>
        <Label htmlFor="measured-m2" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Skutočná plocha (m²) <span className="text-rose-600">*</span>
        </Label>
        <Input
          id="measured-m2"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.1}
          value={measuredM2}
          onChange={(e) => setMeasuredM2(e.target.value)}
          disabled={busy}
          placeholder="napr. 47.5"
          className="mt-1 h-10 text-base font-bold"
        />
      </div>

      {/* ═══ TECHNICKÉ MERANIA ═══ */}
      <div className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
        <div className="text-xs font-extrabold uppercase tracking-widest text-sky-900 inline-flex items-center gap-1.5">
          🔬 Technické merania
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Odtrhový test */}
          <div>
            <Label htmlFor="adhesion" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Odtrhový test (MPa)
            </Label>
            <div className="relative mt-1">
              <Input
                id="adhesion"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={adhesionMpa}
                onChange={(e) => setAdhesionMpa(e.target.value)}
                disabled={busy}
                placeholder="1.8"
                className="h-10 pr-14 text-base font-bold tabular-nums"
              />
              {adhesionVerdict && (
                <span
                  className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    adhesionVerdict === "ok"
                      ? "bg-emerald-100 text-emerald-800"
                      : adhesionVerdict === "warn"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {adhesionVerdict === "ok" ? "✅ OK" : adhesionVerdict === "warn" ? "⚠️ HRAN" : "❌ ZLE"}
                </span>
              )}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Prah OK ≥ 1.5 MPa
            </div>
          </div>

          {/* Vlhkomer (priemer) */}
          <div>
            <Label htmlFor="moisture" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Vlhkosť podkladu (%)
            </Label>
            <div className="relative mt-1">
              <Input
                id="moisture"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={moisturePct}
                onChange={(e) => setMoisturePct(e.target.value)}
                disabled={busy}
                placeholder="3.2"
                className="h-10 pr-14 text-base font-bold tabular-nums"
              />
              {moistureVerdict && (
                <span
                  className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    moistureVerdict === "ok"
                      ? "bg-emerald-100 text-emerald-800"
                      : moistureVerdict === "warn"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {moistureVerdict === "ok" ? "✅ OK" : moistureVerdict === "warn" ? "⚠️ HRAN" : "❌ ZLE"}
                </span>
              )}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Prah OK ≤ 4 %
            </div>
          </div>

          {/* Max vlhkosť */}
          <div>
            <Label htmlFor="moisture-max" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Max nameraná vlhkosť (%)
            </Label>
            <Input
              id="moisture-max"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={moistureMaxPct}
              onChange={(e) => setMoistureMaxPct(e.target.value)}
              disabled={busy}
              placeholder="4.5"
              className="mt-1 h-10 text-base tabular-nums"
            />
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Najhorší bod
            </div>
          </div>

          {/* Teplota */}
          <div>
            <Label htmlFor="air-temp" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Teplota vzduchu (°C)
            </Label>
            <Input
              id="air-temp"
              type="number"
              inputMode="decimal"
              step={0.5}
              value={airTemp}
              onChange={(e) => setAirTemp(e.target.value)}
              disabled={busy}
              placeholder="18"
              className="mt-1 h-10 text-base tabular-nums"
            />
          </div>

          {/* Rel. vlhkosť vzduchu */}
          <div className="col-span-2">
            <Label htmlFor="air-humidity" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Relatívna vlhkosť vzduchu (%)
            </Label>
            <Input
              id="air-humidity"
              type="number"
              inputMode="decimal"
              step={1}
              value={airHumidity}
              onChange={(e) => setAirHumidity(e.target.value)}
              disabled={busy}
              placeholder="55"
              className="mt-1 h-10 text-base tabular-nums"
            />
            <div className="text-[9px] text-muted-foreground mt-0.5">
              Dôležité pre pot life epoxidu — pri &gt; 75% je aplikácia riziková.
            </div>
          </div>
        </div>
      </div>

      {/* Stav podkladu */}
      <div>
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Stav podkladu
        </Label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {[
            { v: "good", label: "✅ Dobrý", color: "bg-emerald-100 border-emerald-300 text-emerald-800" },
            { v: "acceptable", label: "🟡 Prijateľný", color: "bg-amber-100 border-amber-300 text-amber-800" },
            { v: "bad", label: "🔴 Zlý", color: "bg-rose-100 border-rose-300 text-rose-800" },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setSubstrateCondition(opt.v)}
              disabled={busy}
              className={`px-3 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                substrateCondition === opt.v
                  ? opt.color
                  : "bg-background border-input hover:border-muted-foreground/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Substrate notes */}
      <div>
        <Label htmlFor="substrate-notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Detaily o podklade (voliteľné)
        </Label>
        <textarea
          id="substrate-notes"
          value={substrateNotes}
          onChange={(e) => setSubstrateNotes(e.target.value)}
          disabled={busy}
          placeholder="napr. Praskliny na 3 miestach cca 20 cm, mokrá škvrna pri stene, treba samonivelačku"
          maxLength={2000}
          className="mt-1 w-full h-20 rounded-md border border-input bg-background p-2 text-sm resize-none"
        />
      </div>

      {/* Recommended service */}
      <div>
        <Label htmlFor="recommended-service" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Odporúčaná služba
        </Label>
        <Input
          id="recommended-service"
          type="text"
          value={recommendedService}
          onChange={(e) => setRecommendedService(e.target.value)}
          disabled={busy}
          placeholder="napr. Chipsová polyuretánová podlaha"
          className="mt-1"
        />
      </div>

      {/* Feasibility */}
      <div>
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Realizovateľné?
        </Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFeasible(true)}
            disabled={busy}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
              feasible
                ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                : "bg-background border-input"
            }`}
          >
            ✅ Áno, pošli ponuku
          </button>
          <button
            type="button"
            onClick={() => setFeasible(false)}
            disabled={busy}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
              !feasible
                ? "bg-rose-100 border-rose-300 text-rose-800"
                : "bg-background border-input"
            }`}
          >
            ❌ Nie
          </button>
        </div>
      </div>

      {/* Agent note (povinné) */}
      <div>
        <Label htmlFor="agent-note" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Odkaz obchodníkovi <span className="text-rose-600">*</span>
        </Label>
        <textarea
          id="agent-note"
          value={agentNote}
          onChange={(e) => setAgentNote(e.target.value)}
          disabled={busy}
          placeholder="Krátky súhrn — čo videl si, aké máš odporúčanie na cenu, alebo prečo to nie je realizovateľné."
          maxLength={2000}
          required
          className="mt-1 w-full h-24 rounded-md border border-input bg-background p-2 text-sm resize-none"
        />
      </div>

      <Button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full bg-violet-600 hover:bg-violet-700"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
        ) : (
          <Send className="w-4 h-4 mr-1.5" aria-hidden />
        )}
        Odoslať výsledok obchodníkovi
      </Button>
    </section>
  );
}

function ClipboardCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}
