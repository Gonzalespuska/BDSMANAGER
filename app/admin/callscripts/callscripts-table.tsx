"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Edit, Eye, EyeOff, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/toast";

type Script = {
  id: string;
  label: string;
  description: string | null;
  floor_type: string | null;
  space: string | null;
  body: string;
  steps: Array<Record<string, unknown>> | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export function CallscriptsTable({
  initial,
  role = "obchod",
}: {
  initial: Script[];
  role?: "obchod" | "obhliadky";
}) {
  const router = useRouter();
  const [scripts, setScripts] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggleActive(s: Script) {
    setBusy(s.id);
    const r = await fetch("/api/admin/call-scripts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setScripts((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
    toast.success(!s.active ? "Aktivovaný" : "Deaktivovaný");
  }

  async function del(s: Script) {
    if (!confirm(`Naozaj natvrdo zmazať script "${s.label}"?`)) return;
    setBusy(s.id);
    const r = await fetch("/api/admin/call-scripts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, hard: true }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setScripts((prev) => prev.filter((x) => x.id !== s.id));
    toast.success("🗑 Zmazaný");
    setTimeout(() => router.refresh(), 900);
  }

  async function duplicate(s: Script) {
    setBusy(s.id);
    const r = await fetch("/api/admin/call-scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: s.label + " (kópia)",
        description: s.description,
        floor_type: s.floor_type,
        space: s.space,
        body: s.body,
        steps: s.steps,
        sort_order: (s.sort_order ?? 100) + 1,
        active: false,
        target_role: role,
      }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setScripts((prev) => [...prev, j.script]);
    toast.success("✅ Duplikát vytvorený");
    setTimeout(() => router.refresh(), 900);
  }

  if (scripts.length === 0) {
    const isObhliadky = role === "obhliadky";
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <div className="font-black text-slate-700 text-lg mb-1">
          Zatiaľ žiadny {isObhliadky ? "obhliadka postup" : "call script"}
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          {isObhliadky
            ? "Klikni „Nový obhliadka postup" a vytvor scenár pre obhliadkárov."
            : "Klikni „Nový script" a vytvor scenár pre obchodákov."}
        </div>
        <Link
          href={`/admin/callscripts/new?role=${role}`}
          className={
            "inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-black px-3 py-2 " +
            (isObhliadky
              ? "bg-violet-600 hover:bg-violet-700"
              : "bg-rose-600 hover:bg-rose-700")
          }
        >
          + Nový {isObhliadky ? "obhliadka postup" : "script"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scripts.map((s) => {
        const stepCount = Array.isArray(s.steps) ? s.steps.length : 0;
        return (
          <div
            key={s.id}
            className={
              "rounded-xl border-2 p-3 flex items-start gap-3 " +
              (s.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70")
            }
          >
            <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-black">
              {s.sort_order}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-black text-slate-900 truncate">{s.label}</div>
                {!s.active && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                    Vypnutý
                  </span>
                )}
                {stepCount > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                    {stepCount} krokov
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground flex gap-3 mt-0.5 flex-wrap">
                {s.floor_type && <span>🎨 {s.floor_type}</span>}
                {s.space && <span>📍 {s.space}</span>}
                {!s.floor_type && !s.space && <span className="italic">bez tagov (fallback)</span>}
                <span>· {s.body.length} znakov</span>
              </div>
              {s.description && (
                <div className="text-xs text-slate-500 italic mt-1 line-clamp-1">
                  {s.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => toggleActive(s)}
                disabled={busy === s.id}
                className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center disabled:opacity-40"
                title={s.active ? "Deaktivovať" : "Aktivovať"}
              >
                {s.active ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
              </button>
              <button
                type="button"
                onClick={() => duplicate(s)}
                disabled={busy === s.id}
                className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center disabled:opacity-40"
                title="Duplikovať"
              >
                <Copy className="w-4 h-4 text-slate-600" />
              </button>
              <Link
                href={`/admin/callscripts/${s.id}`}
                className="w-8 h-8 rounded-md hover:bg-sky-50 flex items-center justify-center"
                title="Upraviť"
              >
                <Edit className="w-4 h-4 text-sky-600" />
              </Link>
              <button
                type="button"
                onClick={() => del(s)}
                disabled={busy === s.id}
                className="w-8 h-8 rounded-md hover:bg-rose-50 flex items-center justify-center disabled:opacity-40"
                title="Zmazať"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
