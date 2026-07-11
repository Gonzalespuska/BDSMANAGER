"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Beaker,
  Camera,
  Check,
  ChevronRight,
  Droplets,
  Loader2,
  Pencil,
  Plus,
  Ruler,
  Send,
  Trash2,
  Zap,
  X,
} from "lucide-react";

import {
  completeInspectionAction,
  saveInspectionDraftAction,
} from "@/app/agent/actions";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

interface Shape {
  id: string;
  label: string;
  length_m: number;
  width_m: number;
}

interface TestsResult {
  moisture_1_pct?: number;
  moisture_2_pct?: number;
  adhesion_mpa?: number;
}

interface MeasurementResult {
  shapes: Shape[];
  total_m2: number;
}

interface PhotoItem {
  id: string;
  url: string;
  tag: "floor_top" | "defects" | "other";
}

interface WizardExistingResult {
  measured_m2?: number;
  moisture_pct?: number;
  moisture_pct_2?: number;
  adhesion_mpa?: number;
  shapes?: Shape[];
  agent_note?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Main InspectionWizard
// ═══════════════════════════════════════════════════════════════════════

export function InspectionWizard({
  leadId,
  existingResult,
  existingPhotos,
}: {
  leadId: string;
  existingResult: Record<string, unknown> | null;
  existingPhotos: PhotoItem[];
}) {
  const router = useRouter();

  // Existujúce dáta hydrátujeme, aby obhliadkár videl že už niečo vyplnil
  const ex = (existingResult ?? {}) as WizardExistingResult;

  const [tests, setTests] = React.useState<TestsResult>({
    moisture_1_pct: ex.moisture_pct,
    moisture_2_pct: ex.moisture_pct_2,
    adhesion_mpa: ex.adhesion_mpa,
  });
  const [measurement, setMeasurement] = React.useState<MeasurementResult>(() => {
    if (Array.isArray(ex.shapes) && ex.shapes.length > 0) {
      const total = ex.shapes.reduce(
        (s, sh) => s + sh.length_m * sh.width_m,
        0,
      );
      return { shapes: ex.shapes, total_m2: total };
    }
    if (typeof ex.measured_m2 === "number" && ex.measured_m2 > 0) {
      return {
        shapes: [{ id: "main", label: "Hlavná miestnosť", length_m: 0, width_m: 0 }],
        total_m2: ex.measured_m2,
      };
    }
    return { shapes: [], total_m2: 0 };
  });
  const [photos, setPhotos] = React.useState<PhotoItem[]>(existingPhotos);
  const [note, setNote] = React.useState(ex.agent_note ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  // ─── Modaly (open state) ───
  const [testsOpen, setTestsOpen] = React.useState(false);
  const [measurementOpen, setMeasurementOpen] = React.useState(false);
  const [photosOpen, setPhotosOpen] = React.useState(false);

  const testsDone =
    typeof tests.moisture_1_pct === "number" &&
    typeof tests.moisture_2_pct === "number" &&
    typeof tests.adhesion_mpa === "number";
  const measurementDone = measurement.total_m2 > 0;
  const photosDone = photos.length > 0;

  const allDone = testsDone && measurementDone && photosDone;

  async function submitAll() {
    if (!allDone) {
      toast.error("Najprv doplň všetky 3 sekcie: Testy · Zameranie · Nafotenie");
      return;
    }
    setSubmitting(true);
    const result = {
      measured_m2: measurement.total_m2,
      shapes: measurement.shapes,
      moisture_pct: tests.moisture_1_pct,
      moisture_pct_2: tests.moisture_2_pct,
      adhesion_mpa: tests.adhesion_mpa,
      agent_note: note.trim() || "OK — pripravené na CP.",
      feasible:
        (tests.adhesion_mpa ?? 0) >= 1.0 &&
        ((tests.moisture_1_pct ?? 0) + (tests.moisture_2_pct ?? 0)) / 2 <= 5,
    };
    const res = await completeInspectionAction(
      leadId,
      result as unknown as Record<string, unknown>,
    );
    setSubmitting(false);
    if (!res.ok) {
      toast.error(`Chyba: ${res.error}`);
      return;
    }
    toast.success("Obhliadka odoslaná — obchodník dostal notifikáciu.");
    setTimeout(() => router.push("/obhliadky"), 800);
  }

  return (
    <section className="space-y-3">
      {/* ─── 3 karty vedľa seba ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <WizardCard
          icon={<Beaker className="w-8 h-8" />}
          title="Testy"
          subtitle="Vlhkosť + odtrh"
          done={testsDone}
          summary={
            testsDone
              ? `Vlhkosť ${tests.moisture_1_pct}%/${tests.moisture_2_pct}% · Odtrh ${tests.adhesion_mpa} MPa`
              : "Klik pre otvorenie testov"
          }
          onOpen={() => setTestsOpen(true)}
          accent="rose"
        />
        <WizardCard
          icon={<Ruler className="w-8 h-8" />}
          title="Zameranie"
          subtitle="Rozmery + atypické"
          done={measurementDone}
          summary={
            measurementDone
              ? `${measurement.total_m2.toFixed(2)} m² · ${measurement.shapes.length} ${measurement.shapes.length === 1 ? "tvar" : "tvary"}`
              : "Klik pre zadanie rozmerov"
          }
          onOpen={() => setMeasurementOpen(true)}
          accent="sky"
        />
        <WizardCard
          icon={<Camera className="w-8 h-8" />}
          title="Nafotenie"
          subtitle="Podlaha + defekty"
          done={photosDone}
          summary={
            photosDone
              ? `${photos.length} ${photos.length === 1 ? "fotka" : photos.length < 5 ? "fotky" : "fotiek"} nahratých`
              : "Klik pre foto-guide"
          }
          onOpen={() => setPhotosOpen(true)}
          accent="emerald"
        />
      </div>

      {/* ─── Voliteľná poznámka obhliadkára ─── */}
      <div className="rounded-xl border-2 bg-background p-4">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
          Voliteľná poznámka pre obchodníka (nepovinné)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={`Napr. „prístup zo dvora OK", „klient chce začať v septembri"...`}
          className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none resize-none"
        />
      </div>

      {/* ─── ODOSLAŤ button ─── */}
      <button
        type="button"
        onClick={submitAll}
        disabled={!allDone || submitting}
        className={cn(
          "w-full rounded-2xl py-4 text-base font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2",
          allDone
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/30"
            : "bg-slate-100 text-slate-400 cursor-not-allowed",
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            Odosielam…
          </>
        ) : allDone ? (
          <>
            <Send className="w-5 h-5" aria-hidden />
            Odoslať obhliadku
          </>
        ) : (
          <>Doplň všetky 3 sekcie hore ↑</>
        )}
      </button>

      {/* ─── Modals ─── */}
      {testsOpen && (
        <TestsModal
          initial={tests}
          onClose={() => setTestsOpen(false)}
          onSave={async (r) => {
            setTests(r);
            setTestsOpen(false);
            // Persist do DB (draft) — refresh nezmaže
            const res = await saveInspectionDraftAction(leadId, {
              moisture_pct: r.moisture_1_pct,
              moisture_pct_2: r.moisture_2_pct,
              adhesion_mpa: r.adhesion_mpa,
            });
            if (!res.ok) {
              toast.error(`Testy neuložené: ${res.error}`);
            } else {
              toast.success("Testy uložené");
            }
          }}
        />
      )}
      {measurementOpen && (
        <MeasurementModal
          initial={measurement}
          onClose={() => setMeasurementOpen(false)}
          onSave={async (r) => {
            setMeasurement(r);
            setMeasurementOpen(false);
            // Persist do DB (draft) — refresh nezmaže
            const res = await saveInspectionDraftAction(leadId, {
              measured_m2: r.total_m2,
              shapes: r.shapes,
            });
            if (!res.ok) {
              toast.error(`Zameranie neuložené: ${res.error}`);
            } else {
              toast.success(`Plocha ${r.total_m2.toFixed(2)} m² uložená`);
            }
          }}
        />
      )}
      {photosOpen && (
        <PhotosModal
          leadId={leadId}
          existing={photos}
          onClose={() => setPhotosOpen(false)}
          onSave={(p) => {
            setPhotos(p);
            setPhotosOpen(false);
            toast.success(`${p.length} fotiek nahratých`);
          }}
        />
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WizardCard — pekná karta ktorá otvára modal
// ═══════════════════════════════════════════════════════════════════════

function WizardCard({
  icon,
  title,
  subtitle,
  done,
  summary,
  onOpen,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  done: boolean;
  summary: string;
  onOpen: () => void;
  accent: "rose" | "sky" | "emerald";
}) {
  const accentClasses = {
    rose: {
      idle: "border-rose-200 bg-rose-50/50 hover:border-rose-400 hover:bg-rose-50 text-rose-700",
      done: "border-emerald-400 bg-emerald-50 text-emerald-800",
      iconIdle: "text-rose-500",
    },
    sky: {
      idle: "border-sky-200 bg-sky-50/50 hover:border-sky-400 hover:bg-sky-50 text-sky-700",
      done: "border-emerald-400 bg-emerald-50 text-emerald-800",
      iconIdle: "text-sky-500",
    },
    emerald: {
      idle: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-700",
      done: "border-emerald-400 bg-emerald-50 text-emerald-800",
      iconIdle: "text-emerald-500",
    },
  }[accent];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative rounded-2xl border-2 p-5 transition-all text-left group shadow-sm hover:shadow-md",
        done ? accentClasses.done : accentClasses.idle,
      )}
    >
      {/* Edit pastelka vpravo hore ak DONE */}
      {done && (
        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white border-2 border-emerald-300 flex items-center justify-center group-hover:border-emerald-500 transition-colors">
          <Pencil className="w-3.5 h-3.5 text-emerald-700" aria-hidden />
        </div>
      )}
      {/* Big check circle vľavo hore ak DONE */}
      {done && (
        <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
          <Check className="w-5 h-5 text-white stroke-[3]" aria-hidden />
        </div>
      )}
      <div className={cn("flex items-start gap-3", done && "pl-8")}>
        <div className={cn(done ? "text-emerald-600" : accentClasses.iconIdle)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn("font-extrabold text-lg leading-tight", done && "text-emerald-900")}>
            {title}
          </div>
          <div className={cn("text-xs opacity-80 mt-0.5", done && "text-emerald-700")}>
            {subtitle}
          </div>
          <div className={cn("text-sm font-semibold mt-2 leading-snug", done && "text-emerald-800")}>
            {summary}
          </div>
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS MODAL — 2-step wizard: vlhkosť → odtrh
// ═══════════════════════════════════════════════════════════════════════

function TestsModal({
  initial,
  onClose,
  onSave,
}: {
  initial: TestsResult;
  onClose: () => void;
  onSave: (r: TestsResult) => void;
}) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [m1, setM1] = React.useState<string>(
    initial.moisture_1_pct !== undefined ? String(initial.moisture_1_pct) : "",
  );
  const [m2, setM2] = React.useState<string>(
    initial.moisture_2_pct !== undefined ? String(initial.moisture_2_pct) : "",
  );
  const [adhesion, setAdhesion] = React.useState<string>(
    initial.adhesion_mpa !== undefined ? String(initial.adhesion_mpa) : "",
  );

  const m1Num = parseFloat(m1);
  const m2Num = parseFloat(m2);
  const adhesionNum = parseFloat(adhesion);
  const step1Valid = m1Num > 0 && m2Num > 0;
  const step2Valid = adhesionNum > 0;

  function next() {
    if (step === 1 && step1Valid) {
      setStep(2);
    } else if (step === 2 && step2Valid) {
      onSave({
        moisture_1_pct: m1Num,
        moisture_2_pct: m2Num,
        adhesion_mpa: adhesionNum,
      });
    }
  }

  return (
    <ModalShell onClose={onClose} title="🧪 Testy" step={step} totalSteps={2}>
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center">
            <Droplets className="w-14 h-14 mx-auto text-sky-500 mb-2" aria-hidden />
            <h3 className="text-xl font-extrabold">Test vlhkosti podkladu</h3>
          </div>

          <BigInput
            label="Merač 1 — vlhkosť (%)"
            value={m1}
            onChange={setM1}
            unit="%"
            hint="Napr. 3.2"
            autoFocus
          />
          <BigInput
            label="Merač 2 — vlhkosť (%)"
            value={m2}
            onChange={setM2}
            unit="%"
            hint="Napr. 3.5"
          />

          {step1Valid && (
            <VerdictBanner
              variant={
                Math.max(m1Num, m2Num) <= 4
                  ? "ok"
                  : Math.max(m1Num, m2Num) <= 5
                    ? "warn"
                    : "bad"
              }
              label={
                Math.max(m1Num, m2Num) <= 4
                  ? "✅ V norme — pod 4 % je OK pre epoxid"
                  : Math.max(m1Num, m2Num) <= 5
                    ? "⚠ Hraničná hodnota — treba parobrzdu"
                    : "⛔ Vysoká vlhkosť — nutná parobrzda alebo počkať"
              }
            />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center">
            <Zap className="w-14 h-14 mx-auto text-amber-500 mb-2" aria-hidden />
            <h3 className="text-xl font-extrabold">Test odtrhu (pull-off)</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-snug">
              Nalep terč, vytiahni odtrhovým prístrojom.
              Hodnota v MPa (megapascal).
            </p>
          </div>

          <BigInput
            label="Sila odtrhu (MPa)"
            value={adhesion}
            onChange={setAdhesion}
            unit="MPa"
            hint="Napr. 1.8"
            autoFocus
          />

          {step2Valid && (
            <VerdictBanner
              variant={
                adhesionNum >= 1.5 ? "ok" : adhesionNum >= 1.0 ? "warn" : "bad"
              }
              label={
                adhesionNum >= 1.5
                  ? "✅ Podklad drží — nad 1.5 MPa je štandard"
                  : adhesionNum >= 1.0
                    ? "⚠ Hraničná — 1.0-1.5 MPa. Riziko odlupnutia."
                    : "⛔ Slabý podklad — pod 1.0 MPa. Treba diamantové brúsenie + primer 151."
              }
            />
          )}
        </div>
      )}

      <ModalFooter
        onBack={step === 2 ? () => setStep(1) : undefined}
        onNext={next}
        nextLabel={step === 1 ? "Ďalej — Odtrh" : "Potvrdiť testy"}
        nextDisabled={step === 1 ? !step1Valid : !step2Valid}
      />
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MEASUREMENT MODAL — dĺžka × šírka + atypické tvary
// ═══════════════════════════════════════════════════════════════════════

function MeasurementModal({
  initial,
  onClose,
  onSave,
}: {
  initial: MeasurementResult;
  onClose: () => void;
  onSave: (r: MeasurementResult) => void;
}) {
  const [shapes, setShapes] = React.useState<Shape[]>(
    initial.shapes.length > 0
      ? initial.shapes
      : [
          {
            id: "main-" + Math.random().toString(36).slice(2, 8),
            label: "Hlavná miestnosť",
            length_m: 0,
            width_m: 0,
          },
        ],
  );

  const total = shapes.reduce((s, sh) => s + (sh.length_m * sh.width_m || 0), 0);

  function update(id: string, patch: Partial<Shape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function add() {
    setShapes((prev) => [
      ...prev,
      {
        id: "shape-" + Math.random().toString(36).slice(2, 8),
        label: `Atypický tvar ${prev.length}`,
        length_m: 0,
        width_m: 0,
      },
    ]);
  }
  function remove(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
  }

  const canSave = shapes.length > 0 && total > 0;

  return (
    <ModalShell onClose={onClose} title="📏 Zameranie plochy">
      <div className="space-y-4">
        <div className="text-center">
          <Ruler className="w-14 h-14 mx-auto text-sky-500 mb-2" aria-hidden />
          <h3 className="text-xl font-extrabold">Zameranie laserom</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-snug">
            Zmeraj <strong>dĺžku × šírku</strong> miestnosti.
            Ak nie je štvorec, pridaj samostatné tvary (výklenok, chodba, …).
          </p>
        </div>

        <div className="space-y-2">
          {shapes.map((s, idx) => (
            <ShapeRow
              key={s.id}
              shape={s}
              canRemove={idx > 0}
              onChange={(p) => update(s.id, p)}
              onRemove={() => remove(s.id)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="w-full rounded-lg border-2 border-dashed border-sky-300 bg-sky-50/50 hover:bg-sky-50 hover:border-sky-400 text-sky-700 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Pridať výklenok / atypický tvar
        </button>

        <div className="rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white p-4 shadow-md">
          <div className="text-xs uppercase tracking-wider font-bold opacity-80">
            Celková plocha
          </div>
          <div className="text-4xl font-black tabular-nums mt-1">
            {total.toFixed(2)} <span className="text-2xl opacity-80">m²</span>
          </div>
        </div>
      </div>

      <ModalFooter
        onNext={() => canSave && onSave({ shapes, total_m2: total })}
        nextLabel="Potvrdiť plochu"
        nextDisabled={!canSave}
      />
    </ModalShell>
  );
}

function ShapeRow({
  shape,
  canRemove,
  onChange,
  onRemove,
}: {
  shape: Shape;
  canRemove: boolean;
  onChange: (p: Partial<Shape>) => void;
  onRemove: () => void;
}) {
  const area = shape.length_m * shape.width_m;
  return (
    <div className="rounded-xl border-2 bg-background p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={shape.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 rounded-md border-2 bg-background px-2 py-1 text-sm font-bold focus:border-sky-500 focus:outline-none"
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-md hover:bg-rose-100 text-rose-600 transition-colors"
            aria-label="Odstrániť tvar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <NumInput
          label="Dĺžka (m)"
          value={shape.length_m}
          onChange={(v) => onChange({ length_m: v })}
        />
        <div className="text-center text-2xl font-bold text-muted-foreground pb-1">
          ×
        </div>
        <NumInput
          label="Šírka (m)"
          value={shape.width_m}
          onChange={(v) => onChange({ width_m: v })}
        />
      </div>
      {area > 0 && (
        <div className="text-right text-xs font-bold text-sky-700 tabular-nums">
          = {area.toFixed(2)} m²
        </div>
      )}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">
        {label}
      </div>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-md border-2 bg-background px-2 py-1.5 text-lg font-bold tabular-nums text-center focus:border-sky-500 focus:outline-none"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PHOTOS MODAL — 3-step guide (podlaha z hora → defekty → optional)
// ═══════════════════════════════════════════════════════════════════════

interface PhotoStep {
  key: "floor_top" | "defects" | "other";
  title: string;
  description: string;
  guideText: string;
  minPhotos: number;
  optional: boolean;
  emoji: string;
}

const PHOTO_STEPS: PhotoStep[] = [
  {
    key: "floor_top",
    title: "Podlaha z hora",
    description: "Celý pohľad z výšky ~2 m",
    guideText:
      "Postav sa ku stene, zdvihni telefón nad hlavu a odfoť celú podlahu tak, aby bola vidieť celá plocha ktorá sa bude realizovať. Ideálne 1 fotka.",
    minPhotos: 1,
    optional: false,
    emoji: "🏢",
  },
  {
    key: "defects",
    title: "Nerovnosti, chyby, praskliny, dilatácie",
    description: "Všetky defekty zvlášť",
    guideText:
      "Odfoť VŠETKY praskliny, dilatácie, výliky, vyliate miesta. Každú zvlášť z blízka (10-30 cm). Ak nie sú žiadne, odfoť aspoň 1 hladkú vzorku.",
    minPhotos: 1,
    optional: false,
    emoji: "🔍",
  },
  {
    key: "other",
    title: "Chceš pridať ešte niečo?",
    description: "Voliteľné — ostatné dôležité detaily",
    guideText:
      `Napr. špeciálne miesta (kúpeľňa, garáž vjazd, radiátor), miesto pre elektrické zásuvky, alebo cokoľvek iné. Ak nič, klikni „Preskočiť".`,
    minPhotos: 0,
    optional: true,
    emoji: "💡",
  },
];

function PhotosModal({
  leadId,
  existing,
  onClose,
  onSave,
}: {
  leadId: string;
  existing: PhotoItem[];
  onClose: () => void;
  onSave: (photos: PhotoItem[]) => void;
}) {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [photos, setPhotos] = React.useState<PhotoItem[]>(existing);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const step = PHOTO_STEPS[stepIdx];
  const stepPhotos = photos.filter((p) => p.tag === step.key);
  const stepDone = step.optional || stepPhotos.length >= step.minPhotos;
  const isLast = stepIdx === PHOTO_STEPS.length - 1;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("lead_id", leadId);
        form.append("checklist_key", step.key);
        form.append("file", file);
        const r = await fetch("/api/inspection/upload", {
          method: "POST",
          body: form,
        });
        const json = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          url?: string;
          id?: string;
          error?: string;
        };
        if (!r.ok || !json.ok || !json.url) {
          toast.error(`Upload zlyhal: ${json.error ?? "unknown"}`);
          continue;
        }
        setPhotos((prev) => [
          ...prev,
          {
            id: json.id ?? Math.random().toString(36).slice(2),
            url: json.url,
            tag: step.key,
          },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  function next() {
    if (isLast) {
      onSave(photos);
    } else {
      setStepIdx(stepIdx + 1);
    }
  }
  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }

  return (
    <ModalShell
      onClose={onClose}
      title="📷 Foto-guide"
      step={stepIdx + 1}
      totalSteps={PHOTO_STEPS.length}
    >
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-6xl mb-2">{step.emoji}</div>
          <h3 className="text-xl font-extrabold">{step.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {step.description}
          </p>
        </div>

        {/* Guide */}
        <div className="rounded-xl bg-gradient-to-br from-sky-50 to-sky-100 border-2 border-sky-200 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-700 mb-1">
            Ako fotiť
          </div>
          <div className="text-sm text-sky-900 leading-snug">
            {step.guideText}
          </div>
        </div>

        {/* Uploaded photos preview */}
        {stepPhotos.length > 0 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1.5">
              Nahraté ({stepPhotos.length})
            </div>
            <div className="grid grid-cols-3 gap-2">
              {stepPhotos.map((p) => (
                <div
                  key={p.id}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-emerald-300 group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt="Nahratá fotka"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Odstrániť"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Camera button */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={cn(
            "w-full rounded-2xl border-4 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 hover:border-sky-400 py-8 text-sky-700 font-black text-lg inline-flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="w-10 h-10 animate-spin" aria-hidden />
              Nahrávam…
            </>
          ) : (
            <>
              <Camera className="w-10 h-10" aria-hidden />
              {stepPhotos.length > 0 ? "Pridať ďalšiu fotku" : "Odfotiť"}
            </>
          )}
        </button>
      </div>

      <ModalFooter
        onBack={stepIdx > 0 ? back : undefined}
        onNext={next}
        nextLabel={
          isLast
            ? "Hotovo — uložiť fotky"
            : step.optional && stepPhotos.length === 0
              ? "Preskočiť"
              : "Ďalej"
        }
        nextDisabled={!stepDone && !step.optional}
      />
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════════════

function ModalShell({
  onClose,
  title,
  step,
  totalSteps,
  children,
}: {
  onClose: () => void;
  title: string;
  step?: number;
  totalSteps?: number;
  children: React.ReactNode;
}) {
  // Zablokuj scroll pod modalom
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2 className="font-extrabold">{title}</h2>
            {typeof step === "number" && typeof totalSteps === "number" && (
              <div className="text-xs font-bold text-muted-foreground tabular-nums">
                {step} / {totalSteps}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Zavrieť"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        {typeof step === "number" && typeof totalSteps === "number" && (
          <div className="h-1 bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        )}

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-6 pt-4 border-t flex items-center gap-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border-2 bg-background hover:bg-muted px-4 py-3 text-sm font-bold text-muted-foreground transition-colors"
        >
          ← Späť
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className={cn(
          "flex-1 rounded-xl py-3 text-sm font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2",
          nextDisabled
            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
            : "bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white shadow-md",
        )}
      >
        {nextLabel}
        <ChevronRight className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

function BigInput({
  label,
  value,
  onChange,
  unit,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border-2 border-slate-200 p-4">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
        {label}
      </label>
      <div className="flex items-baseline gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
          autoFocus={autoFocus}
          className="flex-1 min-w-0 bg-transparent text-4xl font-black tabular-nums focus:outline-none placeholder:text-slate-300"
        />
        <span className="text-2xl font-bold text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function VerdictBanner({
  variant,
  label,
}: {
  variant: "ok" | "warn" | "bad";
  label: string;
}) {
  const c = {
    ok: "bg-emerald-50 border-emerald-300 text-emerald-900",
    warn: "bg-amber-50 border-amber-300 text-amber-900",
    bad: "bg-rose-50 border-rose-300 text-rose-900",
  }[variant];
  return (
    <div className={cn("rounded-lg border-2 px-3 py-2 text-sm font-semibold", c)}>
      {label}
    </div>
  );
}
