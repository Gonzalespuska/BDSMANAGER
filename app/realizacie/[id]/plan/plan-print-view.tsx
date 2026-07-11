"use client";

import * as React from "react";
import { SIKA_PRODUCTS } from "@/lib/data/sika-products";
import {
  FLOOR_SYSTEMS,
  calcSystemForArea,
  COAT_LABELS,
  type CalculatedItem,
} from "@/lib/data/floor-systems";

interface Step {
  n: number;
  label: string;
  note?: string;
}

/**
 * Build steps podľa typu podlahy + priestoru.
 * User špecifikácia:
 *   1. Vybrúsenie
 *   2. Zošívanie / spravovanie podkladu
 *   3. Vysávanie
 *   4. Kontrola pred penetráciou
 *   5. Penetrácia
 *   6. Vybrúsenie penetrácie
 *   7. Povysávanie
 *   8. Kontrola povysávania
 *   9. Farebná vrstva
 *   10. Chipsy (ak garáž) alebo Lak (ak jednofarebná/metalika/mramor)
 */
function buildSteps(isGarage: boolean): Step[] {
  const steps: Step[] = [
    { n: 1, label: "Vybrúsenie" },
    { n: 2, label: "Zošívanie / spravovanie podkladu" },
    { n: 3, label: "Vysávanie" },
    {
      n: 4,
      label: "Kontrola — správne povysávané a vybrúsené pred penetráciou",
      note: "vizuálna kontrola + prípadné opravné vybrúsenie",
    },
    { n: 5, label: "Penetrácia" },
    { n: 6, label: "Vybrúsenie penetrácie" },
    { n: 7, label: "Povysávanie" },
    { n: 8, label: "Kontrola povysávania" },
    { n: 9, label: "Farebná vrstva" },
  ];
  if (isGarage) {
    steps.push({ n: 10, label: "Chipsy (rozsypanie + rovnomerné pokrytie)" });
  } else {
    steps.push({ n: 10, label: "Vrchný lak" });
  }
  return steps;
}

/**
 * Default zoznam materiálov zo skladu — plus možnosť pridať ďalšie.
 * V budúcnosti napojíme na skutočnú inventúru.
 */
const SKLAD_DEFAULT_MATERIALS = SIKA_PRODUCTS.slice(0, 8);

export function PlanPrintView({
  leadName,
  lokalita,
  teamName,
  obchodakName,
  obhliadkarName,
  realizationDate,
  activeView,
  isGarage,
  plocha,
  systemId: initialSystemId,
  procedureSteps,
  systemCode,
  realizationInventory,
  realizationSystemLabel,
  leadId,
  inventoryTakenAt,
  teamMembers,
  zakazkaCislo,
  isChipsFloor,
  inspectionMeasurements,
}: {
  leadName: string;
  leadPhone?: string | null;
  floorType?: string | null;
  priestor?: string | null;
  plocha?: string | null;
  lokalita: string | null;
  teamName?: string | null;
  obchodakName?: string | null;
  obhliadkarName?: string | null;
  realizationDate?: string | null;
  activeView: "postup" | "sklad" | "zodpovednost";
  isGarage: boolean;
  isJednofarebna?: boolean;
  isChipsova?: boolean;
  isMetalicka?: boolean;
  isMramorova?: boolean;
  systemId?: string | null;
  procedureSteps?: Array<{ step: number; title: string; note: string }>;
  systemCode?: string | null;
  // Inventúra vypočítaná obchodákom pri kliknutí "Poslať na realizáciu"
  // (uložená v lead.data.realization_inventory). Realizator ju len vidí,
  // NEMENÍ. User 2026-07-11: "ten system vybera obchodak a ma mu to tam
  // vypisat iba ze co ma zobrat podla m2 a podla systemu ktory vybral
  // obchodak".
  realizationInventory?: Array<{
    sku: string;
    label: string;
    qty: number;
    unit: string;
    unit_size_kg?: number;
    note?: string;
  }>;
  realizationSystemLabel?: string | null;
  leadId?: string;
  inventoryTakenAt?: string | null;
  /** Členovia realizačného tímu — round-robin cez kroky Zodpovednosti. */
  teamMembers?: Array<{ id: string; name: string }>;
  /** Skrátené ID zákazky pre hlavičku protokolu. */
  zakazkaCislo?: string;
  /** Ak je typ podlahy chipsová, pridá sa krok 11 „Aplikácia chipsov". */
  isChipsFloor?: boolean;
  /** Podmienky prostredia zmerané obhliadkárom — auto-fill do bodu 2. */
  inspectionMeasurements?: {
    air_temp_c: number | null;
    substrate_temp_c: number | null;
    rh_pct: number | null;
    dew_point_c: number | null;
    moisture_cm_avg: number | null;
    measured_by: string | null;
  };
}) {
  // Ak sme dostali kroky z DB (podľa priradeného systému), použij ich.
  // Inak fallback na hardcoded buildSteps(isGarage).
  // User: "autoamticky mu to na dany system upravi aj postup pretoze
  // postup je iny pre ine systemy".
  const steps: Step[] =
    procedureSteps && procedureSteps.length > 0
      ? procedureSteps.map((s) => ({
          n: s.step,
          label: s.title,
          note: s.note,
        }))
      : buildSteps(isGarage);
  void systemCode;
  void initialSystemId;
  const areaNum = parseFloat((plocha ?? "").replace(",", ".")) || 0;

  // Deprecated (system picker + Sika katalóg + custom items) — realizator
  // to nesmie meniť, obchodák to už pre-vybral cez SystemPickerButton.
  // Ponechávame prázdne stubs aby ďalší kód nižšie neprestal fungovať.
  function _unused() {
    void SIKA_PRODUCTS;
    void FLOOR_SYSTEMS;
    void calcSystemForArea;
    void COAT_LABELS;
  }
  void _unused;

  const [skladPicks, setSkladPicks] = React.useState<
    Array<{ sap: string; name: string; packaging: string; qty: string }>
  >([]);
  void skladPicks;

  const [customName, setCustomName] = React.useState("");
  void customName;
  const [customQty, setCustomQty] = React.useState("");
  void customQty;

  function addFromCatalog(sap: string, name: string, packaging: string) {
    setSkladPicks((prev) => {
      if (prev.some((p) => p.sap === sap)) return prev;
      return [...prev, { sap, name, packaging, qty: "1" }];
    });
  }
  void addFromCatalog;
  function addCustom() {
    const n = customName.trim();
    const q = customQty.trim();
    if (!n || !q) return;
    setSkladPicks((prev) => [
      ...prev,
      { sap: "vlastný", name: n, packaging: "—", qty: q },
    ]);
    setCustomName("");
    setCustomQty("");
  }

  return (
    <div className="print-page bg-white border-2 border-slate-200 rounded-2xl p-8 mb-6 print:border-0 print:p-4 print:rounded-none print:mb-0 print:break-after-page">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body * { visibility: hidden; }
          .print-page, .print-page * { visibility: visible; }
          .print-page { position: static; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header — minimálny: iba dátum, mesto, tím.
          Skryté pre zodpovednost view — ten má vlastný A4 hlavičku. */}
      {activeView !== "zodpovednost" && (
      <div className="mb-6 pb-4 border-b-2 border-slate-300">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
              {activeView === "postup"
                ? "Postupový plán realizácie"
                : activeView === "sklad"
                  ? "Zoznam materiálu zo skladu"
                  : "Protokol zodpovednosti"}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">
              {leadName}
            </h2>
          </div>
          <div className="text-right text-xs text-slate-700 space-y-0.5">
            <div>
              <strong>Dátum:</strong>{" "}
              {realizationDate
                ? new Date(realizationDate).toLocaleDateString("sk-SK", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    timeZone: "Europe/Bratislava",
                  })
                : "—"}
            </div>
            {lokalita && (
              <div>
                <strong>Mesto:</strong> {lokalita}
              </div>
            )}
            <div>
              <strong>Tím:</strong> {teamName ?? "—"}
            </div>
          </div>
        </div>
      </div>
      )}

      {activeView === "postup" ? (
        // ═════════ POSTUPOVÝ PLÁN ═════════
        <>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 border border-slate-300">
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-10">
                  #
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700">
                  Krok
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-16">
                  Hotovo
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700 w-48">
                  Meno + Podpis
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-24">
                  Dátum
                </th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.n} className="border border-slate-300">
                  <td className="border border-slate-300 px-2 py-3 text-center tabular-nums font-black text-lg">
                    {s.n}
                  </td>
                  <td className="border border-slate-300 px-3 py-3">
                    <div className="font-bold">{s.label}</div>
                    {s.note && (
                      <div className="text-[10px] text-slate-600 italic mt-0.5">
                        {s.note}
                      </div>
                    )}
                  </td>
                  <td className="border border-slate-300 px-2 py-3 text-center">
                    <div className="w-6 h-6 border-2 border-slate-400 rounded mx-auto"></div>
                  </td>
                  <td className="border border-slate-300 px-2 py-3">
                    {/* Prázdny riadok pre meno + podpis */}
                    <div className="h-8 border-b border-dashed border-slate-300"></div>
                  </td>
                  <td className="border border-slate-300 px-2 py-3">
                    <div className="h-8 border-b border-dashed border-slate-300"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </>
      ) : activeView === "sklad" ? (
        // ═════════ INVENTÚRA — READ-ONLY, čo obchodák pre-vybral ═════════
        // User 2026-07-11: "ten system vybera obchodak a ma mu to tam
        // vypisat iba ze co ma zobrat podla m2 a podla systemu ktory
        // vybral obchodak. Balenie je na kg nie ze vedro sud. Vzal preč
        // → jeden submit button ze zobral to potvrdi".
        <>
          {/* Info banner o systéme */}
          <div className="mb-4 rounded-lg border-2 border-emerald-300 bg-emerald-50/60 p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                  📦 Inventúra — priprav zo skladu
                </div>
                <div className="mt-1 font-black text-lg text-slate-900">
                  {realizationSystemLabel
                    ? `Systém: ${realizationSystemLabel}`
                    : "Systém: —"}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Zoznam vypočítal obchodák podľa vybraného systému a plochy.
                </div>
              </div>
              {areaNum > 0 && (
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                    Plocha
                  </div>
                  <div className="text-2xl font-black text-emerald-700 tabular-nums">
                    {areaNum} m²
                  </div>
                </div>
              )}
            </div>
          </div>

          {(!realizationInventory || realizationInventory.length === 0) ? (
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <div className="text-amber-900 font-black text-sm mb-1">
                ⚠ Obchodák ešte nevybral systém
              </div>
              <div className="text-xs text-amber-800">
                Kým obchodák neklikne „Poslať na realizáciu" a nevyberie
                systém (Sikafloor 264 atď.), inventúra sa neobjaví.
              </div>
            </div>
          ) : (
            <>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border border-slate-300">
                    <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-10">
                      #
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700">
                      Materiál
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-24">
                      Ks
                    </th>
                    <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-24">
                      Balenie
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {realizationInventory.map((p, i) => (
                    <tr key={p.sku + i} className="border border-slate-300">
                      <td className="border border-slate-300 px-2 py-3 text-center tabular-nums font-black text-lg">
                        {i + 1}
                      </td>
                      <td className="border border-slate-300 px-3 py-3">
                        <div className="font-black text-base">{p.label}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          SKU {p.sku}
                        </div>
                        {p.note && (
                          <div className="text-[10px] text-slate-600 italic mt-0.5">
                            {p.note}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-3 text-center">
                        <div className="text-3xl font-black tabular-nums text-emerald-700">
                          {p.qty}×
                        </div>
                      </td>
                      <td className="border border-slate-300 px-2 py-3 text-center">
                        <div className="text-lg font-black tabular-nums text-slate-800">
                          {typeof p.unit_size_kg === "number"
                            ? `${p.unit_size_kg} kg`
                            : p.unit}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Big submit button — nahradzuje per-row „Vzal" checkbox */}
              {leadId && (
                <div className="mt-4 no-print">
                  <InventoryTakenButton
                    leadId={leadId}
                    initialTakenAt={inventoryTakenAt ?? null}
                  />
                </div>
              )}
            </>
          )}
        </>
      ) : (
        // ═════════ ZODPOVEDNOSŤ — v samostatnom bloku nižšie ═════════
        <div className="text-xs text-slate-500 italic">
          {/* Bude zrenderované v samostatnej sekcii pod tabuľkou */}
        </div>
      )}

      {activeView === "zodpovednost" && (
        // ═════════ PROTOKOL ZODPOVEDNOSTI — v2 podľa spec z 2026-07-11 ═════════
        // User: "toto si vytlaci realizacny tym ktory dostal danu zakazku
        // tie mena tam budu podla toho kto je v time cize priklad su
        // juro a petko tak sa to bude striedat".
        // + A4, čierno-biele, prázdne polia na ručný zápis, min 30px riadky.
        <ResponsibilityProtocol
          leadName={leadName}
          lokalita={lokalita ?? null}
          plocha={plocha ?? null}
          realizationSystemLabel={realizationSystemLabel ?? floorType ?? null}
          realizationDate={realizationDate ?? null}
          teamMembers={teamMembers ?? []}
          zakazkaCislo={zakazkaCislo ?? null}
          isChipsFloor={!!isChipsFloor}
          inspectionMeasurements={inspectionMeasurements ?? null}
        />
      )}

      {/* Print footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Epoxidovo s.r.o. · najcrm.sk</span>
        <span>{new Date().toLocaleString("sk-SK")}</span>
      </div>
    </div>
  );
}

/**
 * Veľký "Zobral som materiál" button — realizator klikne raz keď má
 * všetko zo skladu. User: "vzal preč, jeden submit ze zobral to potvrdi".
 */
function InventoryTakenButton({
  leadId,
  initialTakenAt,
}: {
  leadId: string;
  initialTakenAt: string | null;
}) {
  const [takenAt, setTakenAt] = React.useState<string | null>(initialTakenAt);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/lead/inventory-taken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        setBusy(false);
        return;
      }
      setTakenAt((j.taken_at as string) ?? new Date().toISOString());
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusy(false);
    }
  }

  if (takenAt) {
    const when = new Date(takenAt).toLocaleString("sk-SK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className="rounded-xl bg-emerald-100 border-2 border-emerald-400 p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl shrink-0">
          ✓
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-lg text-emerald-900 leading-tight">
            Materiál prevzatý
          </div>
          <div className="text-xs text-emerald-800">
            Zaznamenané: {when}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-5 text-lg font-black shadow-lg transition-colors disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
            Ukladám…
          </>
        ) : (
          <>
            ✅ Zobral som celý materiál zo skladu
          </>
        )}
      </button>
      {error && (
        <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PROTOKOL ZODPOVEDNOSTI — A4 tlačiteľný, čierno-biely
// ══════════════════════════════════════════════════════════════════════════

interface WorkStep {
  n: number;
  label: string;
  isControl?: boolean;
  chipsOnly?: boolean;
}

/**
 * Round-robin priradenie mien tímu na kroky.
 * Vstup: teamMembers (napr. [Juro, Peťo]) + zoznam krokov.
 * Výstup: pre každý krok vráti meno člena podľa index % team.length.
 * Ak tím je prázdny → prázdny reťazec (miesto na ručné doplnenie).
 * Kontrolné kroky (isControl) → ideálne INÝ člen než predchádzajúci úkon.
 */
function assignResponsibilities(
  steps: WorkStep[],
  team: Array<{ id: string; name: string }>,
): Array<WorkStep & { assignee: string }> {
  if (team.length === 0) return steps.map((s) => ({ ...s, assignee: "" }));
  const out: Array<WorkStep & { assignee: string }> = [];
  let idx = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    let picked = team[idx % team.length];
    // Ak kontrola a prev step má rovnakú osobu → posuň o 1
    if (s.isControl && out.length > 0) {
      const prev = out[out.length - 1];
      if (prev.assignee === picked.name && team.length > 1) {
        picked = team[(idx + 1) % team.length];
        idx++;
      }
    }
    out.push({ ...s, assignee: picked.name });
    idx++;
  }
  return out;
}

function ResponsibilityProtocol({
  leadName,
  lokalita,
  plocha,
  realizationSystemLabel,
  realizationDate,
  teamMembers,
  zakazkaCislo,
  isChipsFloor,
  inspectionMeasurements,
}: {
  leadName: string;
  lokalita: string | null;
  plocha: string | null;
  realizationSystemLabel: string | null;
  realizationDate: string | null;
  teamMembers: Array<{ id: string; name: string }>;
  zakazkaCislo: string | null;
  isChipsFloor: boolean;
  inspectionMeasurements: {
    air_temp_c: number | null;
    substrate_temp_c: number | null;
    rh_pct: number | null;
    dew_point_c: number | null;
    moisture_cm_avg: number | null;
    measured_by: string | null;
  } | null;
}) {
  // Kroky presne podľa user-spec.
  const baseSteps: WorkStep[] = [
    { n: 1, label: "Vybrúsenie podkladu" },
    { n: 2, label: "Vysávanie" },
    { n: 3, label: "Skontrolovanie 1. povysávania", isControl: true },
    { n: 4, label: "Miešanie sudov s penetráciou (skontrolovať pomer)" },
    { n: 5, label: "Penetrácia" },
    { n: 6, label: "Vybrúsenie penetrácie" },
    { n: 7, label: "Povysávanie" },
    { n: 8, label: "Skontrolovanie 2. povysávania", isControl: true },
    { n: 9, label: "Miešanie finálnej vrstvy (pomer + pot-life)" },
    { n: 10, label: "Aplikácia finálnej vrstvy" },
    { n: 11, label: "Aplikácia chipsov", chipsOnly: true },
  ];
  const steps = baseSteps.filter((s) => !s.chipsOnly || isChipsFloor);
  const withAssignees = assignResponsibilities(steps, teamMembers);

  // Evidencia materiálu / šarže — LEN pri väčších zákazkách (150+ m²)
  // aby sa malé zákazky nezabalovali papierovaním. User: "pri
  // zakazchach nad 150m nech toto pridava".
  const plochaNum = plocha ? parseFloat(plocha.replace(",", ".")) : 0;
  const showEvidenceSection = plochaNum >= 150;

  // Dynamické čísla sekcií — bez evidencie sú 2-5, s evidenciou 2-6.
  const secN = (base: number) => (showEvidenceSection ? base : base - 1);
  void secN;

  // User (2026-07-11): "datum realizacie je datum ktory je na realizacii
  // nie ze ked stlaci na ten papier vytlacit ho chce a bude to den
  // dopredu bude tam o den menej". Použi realization_at z DB s timeZone
  // Europe/Bratislava aby sa nedostal off-by-one deň keď je server v UTC
  // ale user testuje v SK timezone. Nikdy NIE dnešný dátum tlače.
  const dateStr = realizationDate
    ? new Date(realizationDate).toLocaleDateString("sk-SK", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Bratislava",
      })
    : "";

  return (
    <div className="responsibility-protocol print:text-black">
      {/* A4 print styles — čierno-biele, 15mm margins, print-safe */}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          .responsibility-protocol { color: #000; font-family: "Arial", "Helvetica", sans-serif; }
          .responsibility-protocol * { color: #000 !important; background: transparent !important; }
          .responsibility-protocol table { page-break-inside: auto; }
          .responsibility-protocol tr { page-break-inside: avoid; page-break-after: auto; }
          .responsibility-protocol h2, .responsibility-protocol h3 { page-break-after: avoid; }
          .no-print { display: none !important; }
        }
        .responsibility-protocol table { border-collapse: collapse; width: 100%; font-size: 11px; }
        .responsibility-protocol th, .responsibility-protocol td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
        .responsibility-protocol th { text-align: left; font-weight: 700; background: #f0f0f0; }
        .responsibility-protocol .row-min { height: 32px; }
        .responsibility-protocol .row-tall { height: 44px; }
        .responsibility-protocol .checkbox { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; }
        .responsibility-protocol .field-line { border-bottom: 1px solid #000; display: inline-block; min-width: 200px; height: 16px; }
        .responsibility-protocol h2 { font-size: 14px; font-weight: 800; margin: 12px 0 6px; border-bottom: 2px solid #000; padding-bottom: 3px; text-transform: uppercase; }
        .responsibility-protocol h3 { font-size: 12px; font-weight: 700; margin: 8px 0 4px; }
        .responsibility-protocol .logo-slot { height: 40px; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #999; margin-bottom: 8px; }
        @media print {
          .responsibility-protocol .logo-slot { border-color: #ccc; }
        }
        .responsibility-protocol .control-row { background: #f5f5f5; }
        .responsibility-protocol .doložka { font-size: 10.5px; line-height: 1.5; margin-top: 12px; padding: 8px; border: 1px solid #000; }
      `}</style>

      <div style={{ textAlign: "center", marginBottom: "10px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 800, margin: 0, letterSpacing: "0.5px" }}>
          PROTOKOL ZODPOVEDNOSTI
        </h1>
        <div style={{ fontSize: "10px", marginTop: "2px" }}>
          Rozdelenie krokov realizácie a zodpovednosti za výkon
        </div>
      </div>

      {/* 1. HLAVIČKA */}
      <h2>1. Hlavička</h2>
      <table>
        <tbody>
          <tr className="row-min">
            <td style={{ width: "30%", fontWeight: 700 }}>Zákazka / číslo:</td>
            <td>{zakazkaCislo ?? ""}</td>
          </tr>
          <tr className="row-min">
            <td style={{ fontWeight: 700 }}>Objekt (byt / adresa):</td>
            <td>
              {leadName} {lokalita ? `· ${lokalita}` : ""}
            </td>
          </tr>
          <tr className="row-min">
            <td style={{ fontWeight: 700 }}>Plocha m²:</td>
            <td>{plocha ?? ""}</td>
          </tr>
          <tr className="row-min">
            <td style={{ fontWeight: 700 }}>Systém:</td>
            <td>{realizationSystemLabel ?? ""}</td>
          </tr>
          <tr className="row-min">
            <td style={{ fontWeight: 700 }}>Dátum realizácie:</td>
            <td>{dateStr}</td>
          </tr>
        </tbody>
      </table>

      {/* 2. EVIDENCIA MATERIÁLU / ŠARŽE — LEN pre zákazky nad 150 m².
          User 2026-07-11: "pri zakazchach nad 150m nech toto pridava
          to je super ale asi aj viac riadkov este 2".
          Pri menších zákazkách sa nechá vynechať — zbytočné papierovanie. */}
      {showEvidenceSection && (
        <>
          <h2>2. Evidencia materiálu / šarže</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "35%" }}>Produkt</th>
                <th style={{ width: "25%" }}>Šarža (batch)</th>
                <th style={{ width: "15%" }}>Počet balení</th>
                <th style={{ width: "25%" }}>Kto miešal</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i} className="row-tall">
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Rozdelenie práce — sekcia 2 (bez evidencie) alebo 3 (s evidenciou) */}
      <h2>{showEvidenceSection ? "3" : "2"}. Rozdelenie práce medzi realizatorov</h2>
      {teamMembers.length > 0 && (
        <div style={{ fontSize: "10px", marginBottom: "4px" }}>
          <strong>Tím:</strong> {teamMembers.map((m) => m.name).join(", ")}{" "}
          {teamMembers.length > 1 && (
            <em>(mená sú predvyplnené striedavo — v prípade zmeny prečiarknite a napíšte ručne)</em>
          )}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th style={{ width: "5%", textAlign: "center" }}>Č.</th>
            <th style={{ width: "30%" }}>Úkon</th>
            <th style={{ width: "18%" }}>Zodpovedná osoba</th>
            <th style={{ width: "12%" }}>Čas od–do</th>
            <th style={{ width: "8%", textAlign: "center" }}>Hotovo</th>
            <th style={{ width: "15%" }}>Podpis</th>
            <th style={{ width: "12%" }}>Poznámka</th>
          </tr>
        </thead>
        <tbody>
          {withAssignees.map((s) => (
            <tr key={s.n} className={s.isControl ? "control-row row-tall" : "row-tall"}>
              <td style={{ textAlign: "center", fontWeight: 800, fontSize: "13px" }}>
                {s.n}
              </td>
              <td>
                <strong>{s.label}</strong>
                {s.isControl && (
                  <div style={{ fontSize: "9px", marginTop: "2px" }}>
                    ⚠ <em>Kontrola — podpisuje INÁ osoba než ktorá krok robila</em>
                  </div>
                )}
              </td>
              <td>{s.assignee}</td>
              <td></td>
              <td style={{ textAlign: "center" }}>
                <span className="checkbox"></span>
              </td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 5. FOTODOKUMENTÁCIA */}
      <h2>{showEvidenceSection ? "4" : "3"}. Fotodokumentácia</h2>
      <div style={{ padding: "8px", border: "1px solid #000", fontSize: "11px" }}>
        Zaškrtnite fotky ktoré boli spravené počas realizácie:
        <div style={{ marginTop: "6px", display: "flex", gap: "18px", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="checkbox"></span> pred brúsením
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="checkbox"></span> po brúsení
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="checkbox"></span> po povysávaní
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="checkbox"></span> po penetrácii
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="checkbox"></span> finál
          </label>
        </div>
      </div>

      {/* 6. SÚPIS CHÝB / DEFEKTOV */}
      <h2>{showEvidenceSection ? "5" : "4"}. Súpis chýb / defektov (ak sa niečo nájde)</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: "12%" }}>Dátum</th>
            <th style={{ width: "25%" }}>Popis chyby</th>
            <th style={{ width: "18%" }}>Ktorý krok ju spôsobil</th>
            <th style={{ width: "18%" }}>Zodpovedná osoba</th>
            <th style={{ width: "17%" }}>Náprava</th>
            <th style={{ width: "10%" }}>Náklad (€)</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i} className="row-tall">
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 7. ZODPOVEDNOSTNÁ DOLOŽKA */}
      <h2>{showEvidenceSection ? "6" : "5"}. Zodpovednostná doložka</h2>
      <div className="doložka">
        Každý svojím podpisom v tabuľke (bod {showEvidenceSection ? 3 : 2}) potvrdzuje, že ním vykonaný
        úkon bol spravený správne a podľa pokynov technológie. Ak sa pri
        záručnej reklamácii preukáže, že chyba na diele vznikla{" "}
        <strong>preukázateľne zlým vykonaním konkrétneho úkonu</strong>, náklady
        na opravu (materiál + práca + doprava) znáša{" "}
        <strong>zodpovedná osoba za daný úkon</strong> — v prípade kontrolných
        krokov (3 a 8) aj kontrolór, ktorý úkon odsúhlasil.
      </div>

      <div style={{ marginTop: "20px", display: "flex", gap: "20px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #000", paddingTop: "4px", textAlign: "center", fontSize: "10px" }}>
            Vedúci tímu — meno + podpis
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #000", paddingTop: "4px", textAlign: "center", fontSize: "10px" }}>
            Dátum
          </div>
        </div>
      </div>
    </div>
  );
}
