"use client";

import * as React from "react";
import { Loader2, Trash2, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PHASE_LABELS,
  groupShotsByPhase,
  type ContentShot,
  type FloorTypeFilter,
  type ShotPhase,
} from "@/lib/data/content-shotlist";

/**
 * ContentShotlist — realizator vidí zoznam shots pre daný typ podlahy,
 * číta si inštrukcie, uploaduje video/foto priamo z mobilu.
 */

type Capture = {
  id: string;
  shot_id: string;
  phase: string;
  kind: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string;
  url: string | null;
};

export function ContentShotlist({
  leadId,
  shots,
  floorType,
  initialCaptures,
}: {
  leadId: string;
  shots: ContentShot[];
  floorType: FloorTypeFilter | null;
  initialCaptures: Capture[];
}) {
  const [captures, setCaptures] = React.useState<Capture[]>(initialCaptures);
  const grouped = groupShotsByPhase(shots);

  function addCapture(c: Capture) {
    setCaptures((prev) => [c, ...prev]);
  }
  function removeCapture(id: string) {
    setCaptures((prev) => prev.filter((c) => c.id !== id));
  }

  // Progress — koľko required shots je hotových
  const requiredShots = shots.filter((s) => s.required);
  const capturedShotIds = new Set(captures.map((c) => c.shot_id));
  const doneCount = requiredShots.filter((s) => capturedShotIds.has(s.id)).length;
  const totalRequired = requiredShots.length;
  const pct = totalRequired > 0 ? Math.round((doneCount / totalRequired) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress banner */}
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm">
            <span className="font-black text-emerald-900">{doneCount}</span>
            <span className="text-emerald-800"> / {totalRequired} povinných shots</span>
            {floorType && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-white text-slate-700 text-[10px] font-bold border">
                {floorType === "chipsova"
                  ? "Chipsová"
                  : floorType === "mramorova"
                    ? "Mramorová"
                    : floorType === "metalicka"
                      ? "Metalická"
                      : "Jednofarebná"}
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-emerald-700 tabular-nums">
            {pct} %
          </div>
        </div>
        <div className="h-2 bg-white rounded-full overflow-hidden border">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {(["pred", "pocas", "po"] as ShotPhase[]).map((phase) => {
        const phaseShots = grouped[phase];
        if (phaseShots.length === 0) return null;
        const info = PHASE_LABELS[phase];
        return (
          <section key={phase} className="space-y-3">
            <div
              className={cn(
                "flex items-center gap-2 pb-2 border-b-2",
                info.tint === "sky" && "border-sky-200",
                info.tint === "amber" && "border-amber-200",
                info.tint === "emerald" && "border-emerald-200",
              )}
            >
              <div className="text-2xl">{info.icon}</div>
              <h2 className="text-lg md:text-xl font-black tracking-tight">
                {info.label}
              </h2>
              <div className="ml-auto text-xs font-bold text-slate-500">
                {phaseShots.filter((s) => capturedShotIds.has(s.id)).length} /{" "}
                {phaseShots.length}
              </div>
            </div>

            <ul className="space-y-3">
              {phaseShots.map((shot) => {
                const captured = captures.filter((c) => c.shot_id === shot.id);
                return (
                  <ShotCard
                    key={shot.id}
                    shot={shot}
                    captured={captured}
                    leadId={leadId}
                    onCaptured={addCapture}
                    onRemoved={removeCapture}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ShotCard({
  shot,
  captured,
  leadId,
  onCaptured,
  onRemoved,
}: {
  shot: ContentShot;
  captured: Capture[];
  leadId: string;
  onCaptured: (c: Capture) => void;
  onRemoved: (id: string) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isDone = captured.length > 0;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("lead_id", leadId);
        form.append("shot_id", shot.id);
        form.append("phase", shot.phase);
        form.append("kind", shot.kind);
        const r = await fetch("/api/lead/content-upload", {
          method: "POST",
          body: form,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          setUploading(false);
          return;
        }
        onCaptured({
          id: j.capture_id,
          shot_id: shot.id,
          phase: shot.phase,
          kind: shot.kind,
          storage_path: j.storage_path,
          uploaded_at: new Date().toISOString(),
          uploaded_by: "",
          url: j.url ?? null,
        });
      }
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Zmazať upload?")) return;
    const r = await fetch("/api/lead/content-upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capture_id: id }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) onRemoved(id);
  }

  const accept =
    shot.kind === "photo"
      ? "image/*"
      : "video/*";

  return (
    <li
      className={cn(
        "rounded-xl border-2 bg-white overflow-hidden transition-colors",
        isDone ? "border-emerald-300" : "border-slate-200",
      )}
    >
      <div className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-2xl",
              isDone ? "bg-emerald-100" : "bg-slate-100",
            )}
          >
            {isDone ? "✅" : shot.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-base leading-tight">
                {shot.title}
              </h3>
              {shot.required && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-black uppercase tracking-widest">
                  Povinné
                </span>
              )}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[9px] font-black uppercase tracking-widest">
                {shot.kind === "photo" ? "Foto" : "Video"}
              </span>
              {shot.duration_sec && (
                <span className="text-[10px] text-slate-500 font-bold">
                  ~{shot.duration_sec}s
                </span>
              )}
              {shot.orientation === "portrait" && (
                <span className="text-[10px] text-slate-500">📱 na výšku</span>
              )}
              {shot.orientation === "landscape" && (
                <span className="text-[10px] text-slate-500">📺 na šírku</span>
              )}
            </div>
            <p className="text-sm text-slate-700 mt-1">{shot.description}</p>
          </div>
        </div>

        {/* Tips */}
        <ul className="text-[12px] text-slate-600 leading-relaxed pl-3 border-l-2 border-slate-200 space-y-0.5">
          {shot.tips.map((t, i) => (
            <li key={i}>• {t}</li>
          ))}
        </ul>

        {/* Uploaded previews */}
        {captured.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
            {captured.map((c) => (
              <div
                key={c.id}
                className="relative aspect-square rounded-lg overflow-hidden border-2 border-emerald-300 bg-slate-100 group"
              >
                {c.kind === "photo" ? (
                  c.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">
                      📷
                    </div>
                  )
                ) : c.url ? (
                  <video
                    src={c.url}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">
                    🎬
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  title="Zmazať"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <div className="pt-1">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            capture={shot.kind === "photo" ? "environment" : undefined}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-colors disabled:opacity-50",
              isDone
                ? "bg-white border-2 border-emerald-500 text-emerald-800 hover:bg-emerald-50"
                : "bg-sky-600 hover:bg-sky-700 text-white shadow-sm",
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Nahrávam…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {isDone ? "Nahrať ďalší" : `Nahrať ${shot.kind === "photo" ? "fotku" : "video"}`}
              </>
            )}
          </button>
          {error && (
            <div className="mt-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
