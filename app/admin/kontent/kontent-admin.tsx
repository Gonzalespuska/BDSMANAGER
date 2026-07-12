"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * KontentAdmin — CRUD pre shotlist templates.
 */

type Phase = "pred" | "pocas" | "po";
type Shot = {
  id: string;
  shot_key: string;
  phase: Phase;
  title: string;
  description: string;
  tips: string[];
  kind: "photo" | "video";
  orientation: "portrait" | "landscape" | "any";
  duration_sec: number | null;
  required: boolean;
  floor_types: string[] | null;
  icon: string;
  sort_order: number;
  active: boolean;
};

const PHASE_LABEL: Record<Phase, { label: string; icon: string; tint: string }> = {
  pred: { label: "Pred prácou", icon: "🌅", tint: "sky" },
  pocas: { label: "Počas práce", icon: "🔨", tint: "amber" },
  po: { label: "Po práci", icon: "✨", tint: "emerald" },
};

export function KontentAdmin({ initialShots }: { initialShots: Shot[] }) {
  const router = useRouter();
  const [shots, setShots] = React.useState<Shot[]>(initialShots);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState<Phase | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/admin/kontent");
      const j = await r.json();
      if (j.ok) setShots(j.shots);
    } catch {
      /* ignore */
    }
    router.refresh();
  }

  const grouped: Record<Phase, Shot[]> = {
    pred: shots.filter((s) => s.phase === "pred"),
    pocas: shots.filter((s) => s.phase === "pocas"),
    po: shots.filter((s) => s.phase === "po"),
  };

  return (
    <div className="space-y-4">
      {(Object.keys(grouped) as Phase[]).map((phase) => {
        const info = PHASE_LABEL[phase];
        const list = grouped[phase];
        return (
          <section key={phase} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black inline-flex items-center gap-2">
                <span>{info.icon}</span>
                {info.label}
                <span className="text-xs text-slate-500 font-bold">
                  ({list.length})
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setCreating(phase)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg text-white px-3 py-1.5 text-xs font-black shadow-sm",
                  info.tint === "sky" && "bg-sky-600 hover:bg-sky-700",
                  info.tint === "amber" && "bg-amber-600 hover:bg-amber-700",
                  info.tint === "emerald" && "bg-emerald-600 hover:bg-emerald-700",
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                Pridať shot
              </button>
            </div>
            {list.length === 0 && (
              <div className="text-xs text-slate-500 italic px-3 py-2 rounded border border-dashed">
                Žiadne shoty v tejto fáze.
              </div>
            )}
            <ul className="space-y-2">
              {list.map((shot) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  expanded={expanded === shot.id}
                  onToggle={() =>
                    setExpanded((cur) => (cur === shot.id ? null : shot.id))
                  }
                  onChanged={refresh}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {creating && (
        <NewShotModal
          phase={creating}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShotCard({
  shot,
  expanded,
  onToggle,
  onChanged,
}: {
  shot: Shot;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = React.useState(shot.title);
  const [description, setDescription] = React.useState(shot.description);
  const [tips, setTips] = React.useState(shot.tips.join("\n"));
  const [kind, setKind] = React.useState(shot.kind);
  const [orientation, setOrientation] = React.useState(shot.orientation);
  const [durationSec, setDurationSec] = React.useState(
    shot.duration_sec != null ? String(shot.duration_sec) : "",
  );
  const [required, setRequired] = React.useState(shot.required);
  const [floorTypes, setFloorTypes] = React.useState(
    shot.floor_types ? shot.floor_types.join(",") : "",
  );
  const [icon, setIcon] = React.useState(shot.icon);
  const [sortOrder, setSortOrder] = React.useState(String(shot.sort_order));
  const [active, setActive] = React.useState(shot.active);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/kontent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: shot.id,
        title,
        description,
        tips: tips
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        kind,
        orientation,
        duration_sec: durationSec ? parseInt(durationSec) : null,
        required,
        floor_types: floorTypes
          ? floorTypes
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        icon,
        sort_order: parseInt(sortOrder) || 100,
        active,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setMsg(`⚠ ${j.error}`);
      return;
    }
    setMsg("✓ Uložené");
    setTimeout(() => setMsg(null), 1500);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Deaktivovať shot „${shot.title}"?`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/kontent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shot.id }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChanged();
  }

  return (
    <li
      className={cn(
        "rounded-xl border-2 bg-white transition-colors",
        shot.active ? "border-slate-200" : "border-rose-200 bg-rose-50/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="w-10 h-10 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-xl">
          {shot.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base leading-tight">{shot.title}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-black uppercase">
              {shot.kind === "photo" ? "Foto" : "Video"}
            </span>
            {shot.required && (
              <span className="inline-flex px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                Povinné
              </span>
            )}
            {shot.duration_sec && (
              <span className="text-[10px] font-bold">
                ~{shot.duration_sec}s
              </span>
            )}
            {shot.floor_types && (
              <span className="text-[10px] font-bold text-slate-600">
                Iba: {shot.floor_types.join(", ")}
              </span>
            )}
            <span className="text-[10px] font-mono text-slate-400">
              {shot.shot_key}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-3 bg-slate-50/40">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Ikona (emoji)">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-black"
              />
            </Field>
            <Field label="Poradie">
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold tabular-nums"
              />
            </Field>
            <Field label="Titulok">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-black"
              />
            </Field>
            <Field label="Trvanie (sekundy, iba video)">
              <input
                type="number"
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold tabular-nums"
              />
            </Field>
            <Field label="Typ">
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "photo" | "video")
                }
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                <option value="video">Video</option>
                <option value="photo">Foto</option>
              </select>
            </Field>
            <Field label="Orientácia">
              <select
                value={orientation}
                onChange={(e) =>
                  setOrientation(
                    e.target.value as "portrait" | "landscape" | "any",
                  )
                }
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                <option value="portrait">📱 Portrait (na výšku)</option>
                <option value="landscape">📺 Landscape (na šírku)</option>
                <option value="any">Ľubovoľná</option>
              </select>
            </Field>
            <Field label="Filter typ podlahy (voliteľné, comma-separated)">
              <input
                value={floorTypes}
                onChange={(e) => setFloorTypes(e.target.value)}
                placeholder="napr. chipsova alebo prázdne = všetky"
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              />
            </Field>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="w-5 h-5"
                />
                Povinný shot
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-5 h-5"
                />
                Aktívny
              </label>
            </div>
          </div>

          <Field label="Popis (čo realizator má natočiť)">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm font-semibold resize-none"
            />
          </Field>

          <Field label="Tipy (každý riadok = jeden bullet)">
            <textarea
              rows={5}
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              placeholder={"Napr.\nTelefón NA VÝŠKU (9:16)\nZapaľ všetky svetlá\nOstrý fókus"}
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm font-semibold font-mono"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Uložiť
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-rose-200 hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold"
            >
              <Trash2 className="w-4 h-4" />
              Deaktivovať
            </button>
            {msg && <span className="text-xs font-bold text-slate-600">{msg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

function NewShotModal({
  phase,
  onClose,
  onCreated,
}: {
  phase: Phase;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [shotKey, setShotKey] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState<"photo" | "video">("video");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    if (!shotKey.trim() || !title.trim()) {
      setErr("shot_key a titulok sú povinné");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/kontent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shot_key: shotKey.trim(),
        phase,
        title: title.trim(),
        description,
        kind,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      setErr(j.error);
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 text-white px-5 py-3 flex items-center gap-3">
          <div className="font-black text-lg">Nový shot ({PHASE_LABEL[phase].label})</div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Shot key (uniq, používa sa v content_captures)">
            <input
              value={shotKey}
              onChange={(e) => setShotKey(e.target.value)}
              autoFocus
              placeholder="napr. pocas-vrchny-lak"
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-mono"
            />
          </Field>
          <Field label="Titulok">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="napr. Aplikácia vrchného laku"
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            />
          </Field>
          <Field label="Popis">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm font-semibold resize-none"
            />
          </Field>
          <Field label="Typ">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "photo" | "video")}
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            >
              <option value="video">Video</option>
              <option value="photo">Foto</option>
            </select>
          </Field>
          {err && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
              ⚠ {err}
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 bg-slate-50 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2 text-sm font-bold"
          >
            Zrušiť
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-2 text-sm font-black"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Vytvoriť
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
