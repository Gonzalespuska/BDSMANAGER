import { Beaker, Camera, CheckCircle2, Droplets, Ruler, Zap } from "lucide-react";

import { SafePhoto } from "@/components/safe-photo";

/**
 * InspectionReview — read-only zobrazenie hotovej obhliadky.
 *
 * Používa sa v /obhliadky/[id] keď je status = 'inspected' (alebo neskôr).
 * Zobrazuje čo obhliadkár vyplnil v InspectionWizard:
 *   - Testy (vlhkosť + odtrh) s verdicom
 *   - Rozmery (shapes + total m²)
 *   - Fotky rozdelené podľa kategórie (podlaha z hora / defekty / iné)
 *   - Poznámka pre obchodníka
 */

interface Shape {
  label: string;
  length_m: number;
  width_m: number;
}
interface InspectionResult {
  measured_m2?: number;
  moisture_pct?: number;
  moisture_pct_2?: number;
  adhesion_mpa?: number;
  shapes?: Shape[];
  agent_note?: string;
  feasible?: boolean;
}

interface PhotoItem {
  id: string;
  url: string;
  checklist_key: string | null;
}

export function InspectionReview({
  result,
  photos,
}: {
  result: InspectionResult;
  photos: PhotoItem[];
}) {
  const m1 = result.moisture_pct;
  const m2 = result.moisture_pct_2;
  const adh = result.adhesion_mpa;

  const moistureMax = Math.max(m1 ?? 0, m2 ?? 0);
  const moistureVerdict =
    moistureMax === 0 ? null : moistureMax <= 4 ? "ok" : moistureMax <= 5 ? "warn" : "bad";
  const adhVerdict =
    adh === undefined || adh <= 0
      ? null
      : adh >= 1.5
        ? "ok"
        : adh >= 1.0
          ? "warn"
          : "bad";

  const shapes = result.shapes ?? [];

  const photoGroups = {
    floor_top: photos.filter((p) => p.checklist_key === "floor_top"),
    defects: photos.filter((p) => p.checklist_key === "defects"),
    other: photos.filter((p) => p.checklist_key === "other" || !p.checklist_key),
  };

  return (
    <div className="space-y-4">
      {/* Header — verdict banner */}
      <div
        className={
          result.feasible !== false
            ? "rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 flex items-center gap-3"
            : "rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 flex items-center gap-3"
        }
      >
        <CheckCircle2
          className={
            result.feasible !== false
              ? "w-8 h-8 text-emerald-600 shrink-0"
              : "w-8 h-8 text-rose-600 shrink-0"
          }
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-base">
            {result.feasible !== false
              ? "Obhliadka HOTOVÁ — realizovateľné"
              : "Obhliadka HOTOVÁ — nerealizovateľné"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Obchodník si teraz pozrie výsledky, pošle finálnu cenovú ponuku a
            zavolá klientovi kvôli termínu realizácie.
          </div>
        </div>
      </div>

      {/* 3 mini karty — Testy · Zameranie · Fotky */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Testy */}
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Beaker className="w-5 h-5 text-rose-500" aria-hidden />
            <h4 className="font-extrabold">Testy</h4>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
                Vlhkosť (2 merače)
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-black tabular-nums">
                  {m1?.toFixed(1) ?? "—"}
                  <span className="text-sm ml-0.5">%</span>
                </div>
                <div className="text-xl text-muted-foreground">/</div>
                <div className="text-2xl font-black tabular-nums">
                  {m2?.toFixed(1) ?? "—"}
                  <span className="text-sm ml-0.5">%</span>
                </div>
              </div>
              {moistureVerdict && (
                <VerdictPill
                  variant={moistureVerdict}
                  label={
                    moistureVerdict === "ok"
                      ? "V norme"
                      : moistureVerdict === "warn"
                        ? "Hraničná — parobrzda odporúčaná"
                        : "Vysoká — parobrzda povinná"
                  }
                />
              )}
            </div>
            <div className="border-t pt-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1 inline-flex items-center gap-1">
                <Zap className="w-3 h-3" aria-hidden />
                Odtrh (pull-off)
              </div>
              <div className="flex items-baseline gap-1">
                <div className="text-2xl font-black tabular-nums">
                  {adh?.toFixed(2) ?? "—"}
                </div>
                <div className="text-sm font-bold text-muted-foreground">
                  MPa
                </div>
              </div>
              {adhVerdict && (
                <VerdictPill
                  variant={adhVerdict}
                  label={
                    adhVerdict === "ok"
                      ? "Podklad drží"
                      : adhVerdict === "warn"
                        ? "Hraničná — riziko odlupnutia"
                        : "Slabý — treba brúsenie + primer 151"
                  }
                />
              )}
            </div>
          </div>
        </div>

        {/* Zameranie */}
        <div className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Ruler className="w-5 h-5 text-sky-500" aria-hidden />
            <h4 className="font-extrabold">Zameranie</h4>
          </div>
          <div className="mb-2">
            <div className="text-4xl font-black tabular-nums text-sky-700">
              {result.measured_m2?.toFixed(2) ?? "—"}
              <span className="text-lg opacity-70 ml-1">m²</span>
            </div>
          </div>
          {shapes.length > 0 && (
            <div className="space-y-1 text-xs">
              {shapes.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-sky-200 pb-1 last:border-0"
                >
                  <span className="font-semibold truncate">{s.label}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0 ml-2">
                    {s.length_m} × {s.width_m} m
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fotky count */}
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-5 h-5 text-emerald-500" aria-hidden />
            <h4 className="font-extrabold">Fotky</h4>
          </div>
          <div className="text-4xl font-black tabular-nums text-emerald-700 mb-2">
            {photos.length}
          </div>
          <div className="text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span>🏢 Podlaha z hora</span>
              <span className="font-bold tabular-nums">
                {photoGroups.floor_top.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>🔍 Defekty</span>
              <span className="font-bold tabular-nums">
                {photoGroups.defects.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>💡 Iné</span>
              <span className="font-bold tabular-nums">
                {photoGroups.other.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Poznámka */}
      {result.agent_note && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700 mb-1">
            Poznámka od obhliadkára
          </div>
          <div className="text-sm font-semibold text-amber-900 whitespace-pre-wrap">
            {result.agent_note}
          </div>
        </div>
      )}

      {/* Photo galleries per kategória */}
      {photoGroups.floor_top.length > 0 && (
        <PhotoGrid
          title="🏢 Podlaha z hora"
          count={photoGroups.floor_top.length}
          photos={photoGroups.floor_top}
        />
      )}
      {photoGroups.defects.length > 0 && (
        <PhotoGrid
          title="🔍 Nerovnosti, defekty, praskliny"
          count={photoGroups.defects.length}
          photos={photoGroups.defects}
        />
      )}
      {photoGroups.other.length > 0 && (
        <PhotoGrid
          title="💡 Iné detaily"
          count={photoGroups.other.length}
          photos={photoGroups.other}
        />
      )}
    </div>
  );
}

function PhotoGrid({
  title,
  count,
  photos,
}: {
  title: string;
  count: number;
  photos: PhotoItem[];
}) {
  return (
    <div className="rounded-xl border-2 bg-background p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h4 className="font-extrabold text-sm">{title}</h4>
        <span className="text-xs text-muted-foreground tabular-nums">
          ({count})
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {photos.map((p) => (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-square rounded-lg overflow-hidden border-2 border-slate-200 hover:border-sky-400 transition-colors block"
          >
            <SafePhoto
              url={p.url}
              alt="Foto z obhliadky"
              className="w-full h-full object-cover hover:scale-105 transition-transform"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VerdictPill — farebná bublina s verdiktom pre vlhkosť / odtrh.
// OK  → emerald tint, ✓
// Warn → amber   tint, ⚠  (predtým malý text — user "nech je v bubline")
// Bad → rose    tint, ⛔ (výrazný červený pruh)
// ═══════════════════════════════════════════════════════════════════════
function VerdictPill({
  variant,
  label,
}: {
  variant: "ok" | "warn" | "bad";
  label: string;
}) {
  const cls =
    variant === "ok"
      ? "bg-emerald-100 border-emerald-300 text-emerald-900"
      : variant === "warn"
        ? "bg-amber-100 border-amber-400 text-amber-900"
        : "bg-rose-100 border-rose-400 text-rose-900 shadow-sm shadow-rose-200";
  const icon = variant === "ok" ? "✓" : variant === "warn" ? "⚠" : "⛔";
  return (
    <div
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-black tracking-tight ${cls}`}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
