"use client";

import * as React from "react";

/**
 * OrderPrintView — presne formát objednávkovej tabuľky ako v Excel/screenshote:
 *  | # | SAP číslo | Názov produktu | Balenie | Ks |
 *
 * Optimalizované pre print (window.print → PDF). Vlastný CSS pre print media.
 */
export function OrderPrintView({
  title,
  description,
  areaM2,
  supplier,
  items,
}: {
  title: string;
  description: string | null;
  areaM2: number | null;
  supplier: string;
  items: Array<{
    sap_number: string;
    name: string;
    packaging: string;
    quantity: number;
  }>;
}) {
  return (
    <div id="print" className="bg-white border-2 border-slate-200 rounded-2xl p-8 print:border-0 print:p-4 print:rounded-none">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body * { visibility: hidden; }
          #print, #print * { visibility: visible; }
          #print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-6 pb-4 border-b-2 border-slate-300">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
              Objednávka materiálu
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
            {areaM2 && (
              <div className="text-sm text-slate-600 mt-1">
                Plocha: <strong>{areaM2} m²</strong>
              </div>
            )}
          </div>
          <div className="text-right text-xs text-slate-600">
            <div>
              <strong className="text-slate-900">Odberateľ:</strong> Epoxidovo s.r.o.
            </div>
            <div>
              <strong className="text-slate-900">Dodávateľ:</strong> {supplier}
            </div>
            <div>
              <strong className="text-slate-900">Dátum:</strong>{" "}
              {new Date().toLocaleDateString("sk-SK")}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 border border-slate-300">
            <th className="border border-slate-300 px-2 py-1.5 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-16">
              <div>number</div>
              <div>poradové číslo</div>
            </th>
            <th className="border border-slate-300 px-2 py-1.5 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-28">
              <div>SAP number</div>
              <div>Číslo produktu</div>
            </th>
            <th className="border border-slate-300 px-2 py-1.5 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700">
              <div>Name of product</div>
              <div>Názov produktu</div>
            </th>
            <th className="border border-slate-300 px-2 py-1.5 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-28">
              <div>Packaging</div>
              <div>Veľkosť balenia</div>
            </th>
            <th className="border border-slate-300 px-2 py-1.5 text-center text-[10px] uppercase tracking-wider font-bold text-slate-700 w-24">
              <div>Order quantity</div>
              <div>Objednávané množstvo (ks)</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border border-slate-300">
              <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums font-semibold">
                {i + 1}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 tabular-nums font-mono text-xs">
                {it.sap_number}
              </td>
              <td className="border border-slate-300 px-2 py-1.5">{it.name}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-center">
                {it.packaging}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums font-bold">
                {it.quantity}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="border border-slate-300 px-2 py-6 text-center text-slate-500 italic"
              >
                Žiadne položky
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Skladba / poznámka */}
      {description && (
        <div className="mt-4 text-xs text-slate-700 leading-relaxed">
          {description.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Print footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between print:mt-16">
        <span>Epoxidovo s.r.o. · najcrm.sk</span>
        <span>{new Date().toLocaleString("sk-SK")}</span>
      </div>
    </div>
  );
}
