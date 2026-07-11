"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  systemsFor,
  type Binder,
  type FloorType,
  type SystemCode,
} from "@/lib/data/realization-systems";

/**
 * Modal ktorý sa otvorí keď obchodák klikne "Poslať na realizáciu"
 * z Finálna CP karty. Krok:
 *   1. (auto) Typ podlahy detekovaný z lead.data.typ_podlahy
 *      (obchodák prepne ak treba)
 *   2. Ak jednofarebna → prepínač Epoxid / Polyuretan
 *   3. Systém dropdown (možnosti podľa typu+binder)
 *   4. Náhľad auto-inventúry na základe m² (z inspection_result.measured_m2)
 *   5. Klik "Pokračovať v kalendári" → uloží data.realization_system +
 *      inventory + redirect na /calendar?assign=realization&lead=<id>
 *
 * User (2026-07-11):
 *  "obchodak vybere system po obhliadke pred tym ako sa da realizacia,
 *   na zaklade toho automaticky podla m2 urobi inventuru".
 */
export function SystemPickerButton({
  leadId,
  leadName,
  initialType,
  m2,
  city,
  priestor,
}: {
  leadId: string;
  leadName: string;
  initialType: string | null;
  m2: number | null;
  city: string | null;
  priestor?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<FloorType>(() =>
    normalizeType(initialType) ?? "jednofarebna",
  );

  // User 2026-07-11: "pre garaz nech neponuka polyuretan iba epoxid
  //  takze ta moznost vyberu ju tam ani netreba ak je to garaz ta je
  //  vzdy epoxy". → ak je priestor garáž, binder je vždy 'epoxid'
  //  a toggle sa nezobrazí.
  const isGarage = React.useMemo(() => {
    if (!priestor) return false;
    const n = priestor
      .normalize("NFD")
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    return n.includes("garaz");
  }, [priestor]);

  const [binder, setBinder] = React.useState<Binder>("epoxid");

  // Ak sa priestor zmení na garáž (alebo štartuje ako garáž), force binder=epoxid
  React.useEffect(() => {
    if (isGarage && binder !== "epoxid") {
      setBinder("epoxid");
    }
  }, [isGarage, binder]);

  const [system, setSystem] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const availableSystems = React.useMemo<SystemCode[]>(
    () => systemsFor(type, type === "jednofarebna" ? binder : null),
    [type, binder],
  );

  // Ak sa zmení type/binder a aktuálny systém tam nie je, prepni na prvý
  React.useEffect(() => {
    if (
      !availableSystems.find((s) => s.code === system) &&
      availableSystems.length > 0
    ) {
      setSystem(availableSystems[0].code);
    }
  }, [availableSystems, system]);

  // User (2026-07-11): "to auto inventura obchodak nemusi vidiet to si
  //   potvrdime my ci to dobre pocita" → inventúru vypočítame na
  //   backende (POST /api/lead/set-system), ale v UI ju neukazujeme
  //   obchodákovi.

  async function confirm() {
    if (!system) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/lead/set-system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          system,
          binder: type === "jednofarebna" ? binder : null,
          type,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setError(j.error ?? "Uloženie zlyhalo");
        setSaving(false);
        return;
      }
      // Redirect na calendar assign flow
      const params = new URLSearchParams({
        assign: "realization",
        lead: leadId,
      });
      if (city) params.set("city", city);
      window.location.href = `/calendar?${params.toString()}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setSaving(false);
    }
  }

  // Portal support — bez portalu môže mať modal zlú pozíciu ak niekde
  // vyššie v DOM je `transform` alebo `overflow:hidden` (Next.js layout
  // wrapper). User 2026-07-11: "toto ked som klikol poslat na realizaciu
  // tak sa mi takto divne loadlo". createPortal ho vypichne na body.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black transition-colors shadow-sm"
    >
      <span>🔨</span>
      Poslať na realizáciu
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );

  const modal = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[calc(100vh-4rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white px-5 py-4 flex items-start gap-3">
              <div className="text-2xl">🔨</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
                  Krok pred realizáciou
                </div>
                <div className="text-lg font-black leading-tight">
                  Vyber systém pre „{leadName}"
                </div>
                <div className="text-xs opacity-90 mt-0.5">
                  Podľa výberu sa vygeneruje inventúra pre realizatora.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* TYP */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Typ podlahy
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "jednofarebna", label: "Jednofarebná" },
                      { v: "chipsova", label: "Chipsová" },
                      { v: "mramorova", label: "Mramorová" },
                      { v: "metalicka", label: "Metalická" },
                    ] as Array<{ v: FloorType; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setType(opt.v)}
                      className={cn(
                        "rounded-lg border-2 px-3 py-2.5 text-sm font-black transition-colors",
                        type === opt.v
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* BINDER — iba pre jednofarebnu A NIE pre garáž.
                  User 2026-07-11: "pre garaz nech neponuka polyuretan iba
                  epoxid takze ta moznost vyberu ju tam ani netreba ak je
                  to garaz ta je vzdy epoxy". */}
              {type === "jednofarebna" && !isGarage && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    Živica
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["epoxid", "polyuretan"] as Binder[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBinder(b)}
                        className={cn(
                          "rounded-lg border-2 px-3 py-2.5 text-sm font-black transition-colors capitalize",
                          binder === b
                            ? "border-sky-500 bg-sky-50 text-sky-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Info riadok pri garáži — vysvetli obchodákovi prečo
                  nemá výber. */}
              {type === "jednofarebna" && isGarage && (
                <div className="text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  🏠 Garáž → automaticky epoxid (polyuretán sa do garáže
                  neaplikuje).
                </div>
              )}

              {/* SYSTEM */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Systém
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {availableSystems.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSystem(s.code)}
                      className={cn(
                        "rounded-lg border-2 px-3 py-2.5 text-left transition-colors",
                        system === s.code
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                    >
                      <div
                        className={cn(
                          "font-black text-sm",
                          system === s.code
                            ? "text-emerald-900"
                            : "text-slate-800",
                        )}
                      >
                        {s.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info riadok — obchodák nevidí inventúru, len info že
                  sa vypočíta automaticky. User 2026-07-11:
                  "to auto inventura obchodak nemusi vidiet". */}
              {system && m2 && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-900">
                  ✓ Systém uložený — realizator dostane pripravenú inventúru
                  pre {m2.toFixed(0)} m² podľa systému.
                </div>
              )}

              {!m2 && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  ⚠ Obhliadkár nezameral m² — inventúra sa nedá spočítať.
                  Doplň m² v /obhliadky/{leadId} alebo pokračuj bez inventúry.
                </div>
              )}

              {error && (
                <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="border-t px-5 py-3 bg-slate-50 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2.5 text-sm font-bold"
              >
                Zrušiť
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!system || saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-black shadow-sm disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ukladám…
                  </>
                ) : (
                  <>
                    Pokračovať v kalendári <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
  ) : null;

  return (
    <>
      {trigger}
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}

function normalizeType(raw: string | null): FloorType | null {
  if (!raw) return null;
  const n = raw
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (n.includes("chips")) return "chipsova";
  if (n.includes("mramor")) return "mramorova";
  if (n.includes("metal")) return "metalicka";
  if (n.includes("jedno") || n.includes("polyurethan") || n.includes("epoxid"))
    return "jednofarebna";
  return null;
}
