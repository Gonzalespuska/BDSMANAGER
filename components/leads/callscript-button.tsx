"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, Phone, X } from "lucide-react";

/**
 * CallscriptButton — malý „📞 Callscript" button na leade.
 *
 * User 2026-07-11:
 *   "obchodaci pri leade vzdy ze otvorit callscript a otvori im ten call
 *    script v takom okne, vzdy podla typu podlahy je call script su
 *    viazane cize mramorova interier dom ma iny call script ako
 *    mramorova garaz a podobne, to tlacidlo na otvorenie call scriptu
 *    nemusi byt velke".
 *
 * Fetchne z /api/admin/call-scripts a zvolí najlepšiu zhodu podľa
 * (floorType, space). Ak žiadna zhoda → univerzálny (floor_type=NULL).
 */

type Script = {
  id: string;
  label: string;
  description: string | null;
  floor_type: string | null;
  space: string | null;
  body: string;
  sort_order: number;
  active: boolean;
};

function normalizeFloorType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("chips")) return "chipsova";
  if (n.includes("mramor")) return "mramorova";
  if (n.includes("metal")) return "metalicka";
  if (n.includes("jedno") || n.includes("epoxid") || n.includes("polyuret"))
    return "jednofarebna";
  return null;
}

function normalizeSpace(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("garaz")) return "garaz";
  if (n.includes("dom") || n.includes("byt") || n.includes("interier"))
    return "dom";
  if (n.includes("exterier") || n.includes("vonk")) return "exterier";
  if (n.includes("firma") || n.includes("kancel") || n.includes("obchod"))
    return "firma";
  if (n.includes("sklad") || n.includes("hala") || n.includes("dielna"))
    return "sklad";
  return null;
}

function scoreScript(
  s: Script,
  floorType: string | null,
  space: string | null,
): number {
  let score = 0;
  if (s.floor_type && floorType && s.floor_type === floorType) score += 10;
  else if (!s.floor_type) score += 1; // fallback univerzálny
  if (s.space && space && s.space === space) score += 5;
  else if (!s.space) score += 0.5;
  // penalizuj mismatche
  if (s.floor_type && floorType && s.floor_type !== floorType) score -= 8;
  if (s.space && space && s.space !== space) score -= 3;
  return score;
}

export function CallscriptButton({
  floorType,
  space,
}: {
  floorType?: string | null;
  space?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [scripts, setScripts] = React.useState<Script[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const nFloor = normalizeFloorType(floorType);
  const nSpace = normalizeSpace(space);

  async function openModal() {
    setOpen(true);
    if (scripts !== null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/call-scripts");
      const j = await r.json();
      if (!j.ok) {
        const raw = String(j.error ?? "");
        // Preložime PostgREST schema-cache error na actionable správu.
        // Table 'call_scripts' existuje v DB (migrácia 31), len PostgREST
        // cache ho ešte nezachytila — admin musí spustiť NOTIFY pgrst.
        const friendly = /schema cache|not.*found.*table|call_scripts/i.test(raw)
          ? `PostgREST cache je stale. Otvor /admin a klikni „Reload PostgREST schema cache" — do 2s to bude fungovať.`
          : raw || "Nepodarilo sa načítať skripty";
        setError(friendly);
        setLoading(false);
        return;
      }
      const active = ((j.scripts ?? []) as Script[]).filter((s) => s.active);
      setScripts(active);
      // auto-pick best match
      if (active.length > 0) {
        const ranked = [...active].sort(
          (a, b) => scoreScript(b, nFloor, nSpace) - scoreScript(a, nFloor, nSpace),
        );
        setSelectedId(ranked[0].id);
      }
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setLoading(false);
    }
  }

  const selected = scripts?.find((s) => s.id === selectedId) ?? null;

  // User 2026-07-16: „ten callscript nech funguje ale s tym co proste
  // som ti posielal" — reaktivované, používa existujúce scripty v DB
  // (migrácia 31, tagované floor_type + space).
  const trigger = (
    <button
      type="button"
      onClick={openModal}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-black bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200 transition-colors"
      title="Otvoriť call skript pre tento typ podlahy + priestor"
    >
      <Phone className="w-3 h-3" />
      Callscript
    </button>
  );

  const modal = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white px-5 py-3 flex items-center gap-3 shrink-0">
          <Phone className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
              Call skript
            </div>
            <div className="font-black text-lg leading-tight truncate">
              {selected?.label ?? "Vyber skript"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="p-8 flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="text-sm font-bold">Načítavam skripty…</div>
          </div>
        )}
        {error && (
          <div className="p-5 text-sm text-rose-800 bg-rose-50 space-y-3">
            <div>⚠ {error}</div>
            {/schema cache|Reload PostgREST/i.test(error) && (
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setLoading(true);
                  try {
                    await fetch("/api/admin/reload-postgrest", { method: "POST" });
                    await new Promise((r) => setTimeout(r, 1500));
                    setScripts(null); // force re-fetch
                    openModal();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "reload failed");
                    setLoading(false);
                  }
                }}
                className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-black shadow-sm"
              >
                🔄 Reload cache teraz
              </button>
            )}
          </div>
        )}
        {scripts && scripts.length === 0 && !loading && (
          <div className="p-8 text-center text-slate-500">
            <div className="font-bold text-slate-700 mb-1">
              Zatiaľ žiadne skripty
            </div>
            <div className="text-sm">
              Admin ešte nevytvoril žiadny call skript v /admin/podklady.
            </div>
          </div>
        )}

        {scripts && scripts.length > 0 && (
          <>
            {/* Selector — ak je viac skriptov, dá sa prepnúť */}
            {scripts.length > 1 && (
              <div className="px-5 py-2 border-b bg-slate-50 flex items-center gap-2 overflow-x-auto shrink-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">
                  Iný:
                </div>
                {scripts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={
                      "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors " +
                      (s.id === selectedId
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-slate-700 border-slate-300 hover:border-rose-300")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="p-5 overflow-y-auto flex-1">
              {selected?.description && (
                <div className="text-xs italic text-slate-500 mb-3">
                  {selected.description}
                </div>
              )}
              <pre className="text-sm font-semibold text-slate-900 whitespace-pre-wrap font-sans leading-relaxed">
                {selected?.body ?? ""}
              </pre>
            </div>
          </>
        )}

        <div className="border-t px-5 py-3 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm font-black"
          >
            Zavrieť
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
