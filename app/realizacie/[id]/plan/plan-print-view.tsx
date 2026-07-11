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
    note?: string;
  }>;
  realizationSystemLabel?: string | null;
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
      ) : activeView === "sklad" ? (
        // ═════════ INVENTÚRA — READ-ONLY, čo obchodák pre-vybral ═════════
        // User 2026-07-11: "ten system vybera obchodak a ma mu to tam
        // vypisat iba ze co ma zobrat podla m2 a podla systemu ktory
        // vybral obchodak". Realizator NIČ nepicka, len škrtne "Vzal".
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
                  Odškrtávaj čo si vzal.
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
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 border border-slate-300">
                  <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-10">
                    #
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-slate-700">
                    Materiál
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-20">
                    Ks
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-20">
                    Balenie
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-16">
                    Vzal
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
                    <td className="border border-slate-300 px-2 py-3 text-center text-xs font-bold">
                      {p.unit}
                    </td>
                    <td className="border border-slate-300 px-2 py-3 text-center">
                      <div className="w-7 h-7 border-2 border-slate-400 rounded mx-auto"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        // ═════════ ZODPOVEDNOSŤ — v samostatnom bloku nižšie ═════════
        <div className="text-xs text-slate-500 italic">
          {/* Bude zrenderované v samostatnej sekcii pod tabuľkou */}
        </div>
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
