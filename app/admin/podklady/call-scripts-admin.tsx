"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Phone,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * CallScriptsAdmin — CRUD pre call scripty. Každý skript má:
 * - floor_type (nullable = univerzálny)
 * - space (nullable = akýkoľvek priestor)
 * - body (markdown/plain text)
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

const FLOOR_TYPES: Array<{ v: string | ""; label: string }> = [
  { v: "", label: "Všetky (univerzálny)" },
  { v: "jednofarebna", label: "Jednofarebná" },
  { v: "chipsova", label: "Chipsová" },
  { v: "mramorova", label: "Mramorová" },
  { v: "metalicka", label: "Metalická" },
];

const SPACES: Array<{ v: string | ""; label: string }> = [
  { v: "", label: "Akýkoľvek" },
  { v: "dom", label: "Dom / byt" },
  { v: "garaz", label: "Garáž" },
  { v: "exterier", label: "Exteriér" },
  { v: "firma", label: "Firma / kancelária" },
  { v: "sklad", label: "Sklad / hala" },
];

export function CallScriptsAdmin({
  initialScripts,
}: {
  initialScripts: Script[];
}) {
  const router = useRouter();
  const [scripts, setScripts] = React.useState<Script[]>(initialScripts);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function refresh() {
    try {
      const r = await fetch("/api/admin/call-scripts");
      const j = await r.json();
      if (j.ok) setScripts(j.scripts);
    } catch {
      /* ignore */
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {scripts.length} skript{scripts.length === 1 ? "" : "ov"} celkom
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-black shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nový skript
        </button>
      </div>

      <ul className="space-y-2">
        {scripts.map((s) => (
          <ScriptCard
            key={s.id}
            script={s}
            expanded={expanded === s.id}
            onToggle={() =>
              setExpanded((cur) => (cur === s.id ? null : s.id))
            }
            onChanged={refresh}
          />
        ))}
      </ul>

      {creating && (
        <NewScriptModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ScriptCard({
  script,
  expanded,
  onToggle,
  onChanged,
}: {
  script: Script;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [label, setLabel] = React.useState(script.label);
  const [description, setDescription] = React.useState(script.description ?? "");
  const [floorType, setFloorType] = React.useState(script.floor_type ?? "");
  const [space, setSpace] = React.useState(script.space ?? "");
  const [body, setBody] = React.useState(script.body);
  const [sortOrder, setSortOrder] = React.useState(String(script.sort_order));
  const [active, setActive] = React.useState(script.active);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/call-scripts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: script.id,
        label,
        description: description || null,
        floor_type: floorType || null,
        space: space || null,
        body,
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
    if (!confirm(`Zmazať skript „${script.label}"?`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/call-scripts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: script.id }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChanged();
  }

  return (
    <li
      className={cn(
        "rounded-xl border-2 bg-white transition-colors",
        script.active ? "border-slate-200" : "border-rose-200 bg-rose-50/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
          <Phone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base leading-tight">{script.label}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {script.floor_type ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                {FLOOR_TYPES.find((t) => t.v === script.floor_type)?.label ??
                  script.floor_type}
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                Univerzálny
              </span>
            )}
            {script.space && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">
                {SPACES.find((t) => t.v === script.space)?.label ?? script.space}
              </span>
            )}
            {!script.active && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                NEAKTÍVNY
              </span>
            )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
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
            <Field label="Typ podlahy">
              <select
                value={floorType}
                onChange={(e) => setFloorType(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                {FLOOR_TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priestor">
              <select
                value={space}
                onChange={(e) => setSpace(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                {SPACES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Popis (voliteľné)">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kedy tento skript použiť"
                className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              />
            </Field>
            <Field label="Aktívny">
              <label className="inline-flex items-center gap-2 h-9">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="text-sm font-bold">
                  {active ? "Dostupný obchodákom" : "Skrytý"}
                </span>
              </label>
            </Field>
          </div>

          <Field label="Telo skriptu (markdown / plain text)">
            <textarea
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="👋 Ahoj, tu XXX z Epoxidovo. …"
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm font-semibold font-mono leading-relaxed resize-y"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
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
              className="inline-flex items-center gap-2 rounded-lg border-2 border-rose-200 hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Zmazať
            </button>
            {msg && <span className="text-xs font-bold text-slate-600">{msg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

function NewScriptModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [floorType, setFloorType] = React.useState("");
  const [space, setSpace] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("100");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    if (!label.trim() || !body.trim()) {
      setErr("Label a telo skriptu sú povinné");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/call-scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        description: description || null,
        floor_type: floorType || null,
        space: space || null,
        body,
        sort_order: parseInt(sortOrder) || 100,
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
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[calc(100vh-4rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white px-5 py-3 flex items-center gap-3 shrink-0">
          <Phone className="w-5 h-5" />
          <div className="font-black text-lg">Nový call skript</div>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <Field label="Label (napr. „Mramorová — interiér dom")">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Typ podlahy">
              <select
                value={floorType}
                onChange={(e) => setFloorType(e.target.value)}
                className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                {FLOOR_TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priestor">
              <select
                value={space}
                onChange={(e) => setSpace(e.target.value)}
                className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
              >
                {SPACES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Popis (voliteľné)">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Krátky popis kedy použiť"
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            />
          </Field>
          <Field label="Poradie">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold tabular-nums"
            />
          </Field>
          <Field label="Telo skriptu (markdown/plain)">
            <textarea
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="👋 Ahoj, tu XXX z Epoxidovo. …"
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm font-mono font-semibold resize-y"
            />
          </Field>
          {err && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
              ⚠ {err}
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 bg-slate-50 flex items-center gap-2 shrink-0">
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
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Vytvoriť skript
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
