"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Edit, Eye, EyeOff, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/toast";

type Doc = {
  id: string;
  title: string;
  body_md: string;
  target_role: "obchod" | "obhliadky" | "realizacie" | "admin" | "vsetci";
  category: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

const ROLE_LABEL: Record<Doc["target_role"], string> = {
  obchod: "📞 Obchod",
  obhliadky: "🔍 Obhliadky",
  realizacie: "🔨 Realizácie",
  admin: "🛡 Admin",
  vsetci: "👥 Všetci",
};
const ROLE_COLOR: Record<Doc["target_role"], string> = {
  obchod: "bg-sky-100 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200",
  obhliadky: "bg-violet-100 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200",
  realizacie: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  admin: "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  vsetci: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

export function PodkladyTable({ initial }: { initial: Doc[] }) {
  const router = useRouter();
  const [docs, setDocs] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggleActive(d: Doc) {
    setBusy(d.id);
    const r = await fetch("/api/admin/training-docs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, active: !d.active }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setDocs((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, active: !d.active } : x)),
    );
    toast.success(!d.active ? "Aktivovaný" : "Deaktivovaný");
  }

  async function del(d: Doc) {
    if (!confirm(`Naozaj zmazať podklad „${d.title}"?`)) return;
    setBusy(d.id);
    const r = await fetch("/api/admin/training-docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
    toast.success("🗑 Zmazaný");
    setTimeout(() => router.refresh(), 900);
  }

  async function duplicate(d: Doc) {
    setBusy(d.id);
    const r = await fetch("/api/admin/training-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title + " (kópia)",
        body_md: d.body_md,
        target_role: d.target_role,
        category: d.category,
        sort_order: (d.sort_order ?? 100) + 1,
        active: false,
      }),
    });
    const j = await r.json();
    setBusy(null);
    if (!j.ok) return toast.error(`Chyba: ${j.error}`);
    setDocs((prev) => [...prev, j.doc]);
    toast.success("✅ Duplikát vytvorený");
    setTimeout(() => router.refresh(), 900);
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-10 text-center">
        <div className="font-black text-slate-700 dark:text-slate-300 text-lg mb-1">
          Zatiaľ žiadny podklad
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          Vytvor prvý dokument — sales tips, obhliadka protokol, product info,
          čokoľvek.
        </div>
        <Link
          href="/admin/podklady/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-black px-3 py-2"
        >
          + Nový podklad
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div
          key={d.id}
          className={
            "rounded-xl border-2 p-3 flex items-start gap-3 " +
            (d.active
              ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-70")
          }
        >
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 font-black">
            {d.sort_order}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-black text-slate-900 dark:text-slate-100 truncate">
                {d.title}
              </div>
              <span
                className={
                  "text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded " +
                  ROLE_COLOR[d.target_role]
                }
              >
                {ROLE_LABEL[d.target_role]}
              </span>
              {!d.active && (
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  Vypnutý
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {d.category ? `📁 ${d.category} · ` : ""}
              {d.body_md.length} znakov
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => toggleActive(d)}
              disabled={busy === d.id}
              className="w-8 h-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center disabled:opacity-40"
              title={d.active ? "Deaktivovať" : "Aktivovať"}
            >
              {d.active ? (
                <Eye className="w-4 h-4 text-emerald-600" />
              ) : (
                <EyeOff className="w-4 h-4 text-slate-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => duplicate(d)}
              disabled={busy === d.id}
              className="w-8 h-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center disabled:opacity-40"
              title="Duplikovať"
            >
              <Copy className="w-4 h-4 text-slate-600" />
            </button>
            <Link
              href={`/admin/podklady/${d.id}`}
              className="w-8 h-8 rounded-md hover:bg-sky-50 dark:hover:bg-sky-950/40 flex items-center justify-center"
              title="Upraviť"
            >
              <Edit className="w-4 h-4 text-sky-600" />
            </Link>
            <button
              type="button"
              onClick={() => del(d)}
              disabled={busy === d.id}
              className="w-8 h-8 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center disabled:opacity-40"
              title="Zmazať"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
