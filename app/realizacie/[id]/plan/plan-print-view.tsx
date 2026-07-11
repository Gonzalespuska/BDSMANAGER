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
  const areaNum = parseFloat((plocha ?? "").replace(",", ".")) || 0;
  const [systemId, setSystemId] = React.useState<string>(initialSystemId ?? "");
  const selectedSystem = React.useMemo(
    () => FLOOR_SYSTEMS.find((s) => s.id === systemId) ?? null,
    [systemId],
  );
  const calcItems: CalculatedItem[] = React.useMemo(() => {
    if (!selectedSystem || areaNum <= 0) return [];
    return calcSystemForArea(selectedSystem, areaNum);
  }, [selectedSystem, areaNum]);

  const [skladPicks, setSkladPicks] = React.useState<
    Array<{ sap: string; name: string; packaging: string; qty: string }>
  >([]);
  const [customName, setCustomName] = React.useState("");
  const [customQty, setCustomQty] = React.useState("");

  function addFromCatalog(sap: string, name: string, packaging: string) {
    setSkladPicks((prev) => {
      if (prev.some((p) => p.sap === sap)) return prev;
      return [...prev, { sap, name, packaging, qty: "1" }];
    });
  }
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

      {/* Header — minimálny: iba dátum, mesto, tím */}
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
                  })
                : new Date().toLocaleDateString("sk-SK")}
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
      ) : (
        // ═════════ ZOZNAM ZO SKLADU ═════════
        <>
          {/* Systém selector — auto-výpočet materiálu podľa m² */}
          <div className="mb-4 no-print rounded-lg border-2 border-sky-300 bg-sky-50/60 p-3 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-900 flex items-center justify-between">
              <span>🎯 Vyber systém podlahy → auto-výpočet</span>
              {areaNum > 0 && (
                <span className="text-[10px] normal-case font-normal">
                  plocha: <strong>{areaNum} m²</strong>
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <select
                value={systemId}
                onChange={(e) => setSystemId(e.target.value)}
                className="flex-1 min-w-[240px] rounded-lg border-2 border-sky-300 bg-white px-3 py-2 text-sm font-bold focus:border-sky-500 focus:outline-none"
              >
                <option value="">— vyber systém —</option>
                {FLOOR_SYSTEMS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {selectedSystem && (
                <div className="text-[10px] italic text-sky-800">
                  {selectedSystem.suitable_for.join(", ")}
                </div>
              )}
            </div>
            {selectedSystem && areaNum > 0 && calcItems.length > 0 && (
              <div className="rounded-md bg-white border border-sky-200 p-2 text-[11px] text-slate-700">
                <strong className="text-sky-900">
                  Auto-výpočet pre {areaNum} m²:
                </strong>
                <ul className="mt-1 space-y-0.5">
                  {calcItems.map((c) => (
                    <li key={c.sap_number} className="flex justify-between gap-2">
                      <span>
                        {COAT_LABELS[c.coat]} · {c.name}
                      </span>
                      <span className="tabular-nums font-bold text-sky-900">
                        {c.needed_kg} kg → <strong>{c.packages} ks</strong> ×{" "}
                        {c.packaging}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    const rows = calcItems.map((c) => ({
                      sap: c.sap_number,
                      name: c.name,
                      packaging: c.packaging,
                      qty: String(c.packages),
                    }));
                    setSkladPicks(rows);
                  }}
                  className="mt-2 w-full rounded bg-sky-600 hover:bg-sky-700 text-white px-2 py-1.5 text-xs font-bold"
                >
                  ↓ Nakopírovať do tabuľky nižšie
                </button>
              </div>
            )}
            {selectedSystem && areaNum <= 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-900">
                ⚠️ Plocha (m²) nie je vyplnená v leade — vyplň ju pre
                auto-výpočet.
              </div>
            )}
          </div>

          {/* Ručný výber zo Sika katalógu */}
          <div className="mb-4 no-print rounded-lg border-2 border-orange-200 bg-orange-50/40 p-3 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-orange-800">
              📦 Alebo ručný výber zo Sika katalógu — klikni pre pridanie
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SKLAD_DEFAULT_MATERIALS.map((p) => (
                <button
                  key={p.sap_number}
                  type="button"
                  onClick={() =>
                    addFromCatalog(p.sap_number, p.name, p.packaging)
                  }
                  className="text-left rounded border-2 border-orange-300 bg-white hover:bg-orange-50 p-2 text-xs"
                >
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    SAP {p.sap_number}
                  </div>
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-orange-200 grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Vlastný materiál"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="col-span-2 rounded border px-2 py-1 text-sm"
              />
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="ks"
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  className="w-16 rounded border px-2 py-1 text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={addCustom}
                  className="rounded bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 text-xs font-bold"
                >
                  + Pridať
                </button>
              </div>
            </div>
          </div>

          {/* Skutočná tabuľka (aj v printe) */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 border border-slate-300">
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-10">
                  #
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-24">
                  SAP #
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700">
                  Materiál
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-24">
                  Balenie
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-16">
                  Ks
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-16">
                  Vzal
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700 w-40">
                  Podpis
                </th>
              </tr>
            </thead>
            <tbody>
              {skladPicks.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-slate-300 px-2 py-6 text-center text-slate-500 italic"
                  >
                    Zatiaľ prázdny zoznam — klikni na produkt vyššie alebo pridaj vlastný
                  </td>
                </tr>
              ) : (
                skladPicks.map((p, i) => (
                  <tr key={p.sap + i} className="border border-slate-300">
                    <td className="border border-slate-300 px-2 py-2 text-center tabular-nums font-semibold">
                      {i + 1}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 tabular-nums font-mono text-xs">
                      {p.sap}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 font-semibold">
                      {p.name}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center text-xs">
                      {p.packaging}
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="text"
                        value={p.qty}
                        onChange={(e) => {
                          const copy = [...skladPicks];
                          copy[i] = { ...copy[i], qty: e.target.value };
                          setSkladPicks(copy);
                        }}
                        className="w-12 text-center text-sm font-bold tabular-nums border rounded px-1"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      <div className="w-6 h-6 border-2 border-slate-400 rounded mx-auto"></div>
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <div className="h-6 border-b border-dashed border-slate-300"></div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

        </>
      )}

      {activeView === "zodpovednost" && (
        // ═════════ PROTOKOL ZODPOVEDNOSTI ═════════
        <>
          <div className="mb-4 text-xs text-slate-700 leading-relaxed">
            Tento protokol zaznamenáva zodpovednosť za jednotlivé fázy zákazky.
            Každá strana potvrdzuje že prevzatím / odovzdaním časti sa
            zaväzuje k jej správnemu vykonaniu. V prípade reklamácie sa
            zodpovednosť určuje podľa tejto listiny.
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 border border-slate-300">
                <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700 w-40">
                  Rola
                </th>
                <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700">
                  Meno / Podpis
                </th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-28">
                  Dátum
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border border-slate-300">
                <td className="border border-slate-300 px-3 py-4">
                  <div className="font-black text-sky-900">💼 Obchodák</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Prevzatie leadu, odsúhlasenie ponuky, komunikácia so
                    zákazníkom
                  </div>
                </td>
                <td className="border border-slate-300 px-3 py-4">
                  {obchodakName && (
                    <div className="text-sm font-bold text-slate-800 mb-2">
                      {obchodakName}
                    </div>
                  )}
                  <div className="h-10 border-b border-slate-400"></div>
                </td>
                <td className="border border-slate-300 px-2 py-4">
                  <div className="h-10 border-b border-dashed border-slate-300"></div>
                </td>
              </tr>
              <tr className="border border-slate-300">
                <td className="border border-slate-300 px-3 py-4">
                  <div className="font-black text-violet-900">🔍 Obhliadkár</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Merania (m², vlhkosť, odtrhový test), fotky, technická
                    prípadnosť
                  </div>
                </td>
                <td className="border border-slate-300 px-3 py-4">
                  {obhliadkarName && (
                    <div className="text-sm font-bold text-slate-800 mb-2">
                      {obhliadkarName}
                    </div>
                  )}
                  <div className="h-10 border-b border-slate-400"></div>
                </td>
                <td className="border border-slate-300 px-2 py-4">
                  <div className="h-10 border-b border-dashed border-slate-300"></div>
                </td>
              </tr>
              <tr className="border border-slate-300">
                <td className="border border-slate-300 px-3 py-4">
                  <div className="font-black text-orange-900">📦 Skladník</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Výdaj materiálu podľa zoznamu — kvantita a kvalita
                  </div>
                </td>
                <td className="border border-slate-300 px-3 py-4">
                  <div className="h-10 border-b border-slate-400"></div>
                </td>
                <td className="border border-slate-300 px-2 py-4">
                  <div className="h-10 border-b border-dashed border-slate-300"></div>
                </td>
              </tr>
              <tr className="border border-slate-300">
                <td className="border border-slate-300 px-3 py-4">
                  <div className="font-black text-emerald-900">🔨 Realizator</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Príprava podkladu, aplikácia vrstvy, dodržanie technológie
                  </div>
                </td>
                <td className="border border-slate-300 px-3 py-4">
                  {teamName && (
                    <div className="text-sm font-bold text-slate-800 mb-2">
                      {teamName}
                    </div>
                  )}
                  <div className="h-10 border-b border-slate-400"></div>
                </td>
                <td className="border border-slate-300 px-2 py-4">
                  <div className="h-10 border-b border-dashed border-slate-300"></div>
                </td>
              </tr>
              <tr className="border border-slate-300 bg-amber-50/40">
                <td className="border border-slate-300 px-3 py-4">
                  <div className="font-black text-amber-900">👤 Zákazník</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Prevzatie hotovej realizácie, kvalitatívna kontrola na
                    mieste
                  </div>
                </td>
                <td className="border border-slate-300 px-3 py-4">
                  <div className="text-sm font-bold text-slate-800 mb-2">
                    {leadName}
                  </div>
                  <div className="h-10 border-b border-slate-400"></div>
                </td>
                <td className="border border-slate-300 px-2 py-4">
                  <div className="h-10 border-b border-dashed border-slate-300"></div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-6 rounded border-2 border-slate-200 bg-slate-50/60 p-3 text-[11px] text-slate-700 leading-relaxed">
            <strong>Poznámka:</strong> Reklamácie sa zaznamenávajú do CRM systému
            (najcrm.sk) s odkazom na túto zákazku. Zodpovedná osoba je určená
            podľa tejto listiny — obchodák za predaj a komunikáciu, obhliadkár
            za technické merania, skladník za materiál, realizator za samotnú
            aplikáciu.
          </div>
        </>
      )}

      {/* Print footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Epoxidovo s.r.o. · najcrm.sk</span>
        <span>{new Date().toLocaleString("sk-SK")}</span>
      </div>
    </div>
  );
}
