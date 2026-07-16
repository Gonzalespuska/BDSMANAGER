"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";

import { toast } from "@/components/ui/toast";

type Doc = {
  id?: string;
  title: string;
  body_md: string;
  target_role: "obchod" | "obhliadky" | "realizacie" | "admin" | "vsetci";
  category: string;
  sort_order: number;
  active: boolean;
};

const ROLE_OPTIONS: Array<{ value: Doc["target_role"]; label: string }> = [
  { value: "vsetci", label: "👥 Všetci (obchod + obhliadky + realizacie)" },
  { value: "obchod", label: "📞 Obchod (obchodáci)" },
  { value: "obhliadky", label: "🔍 Obhliadky (obhliadkári)" },
  { value: "realizacie", label: "🔨 Realizácie (realizátori)" },
  { value: "admin", label: "🛡 Admin (iba admini)" },
];

const CATEGORY_SUGGESTIONS = [
  "obecne",
  "sales-tips",
  "produkt-info",
  "protokol",
  "cennik",
  "faq",
  "postup",
  "zmluva",
  "prezentacia",
];

export function PodkladForm({ initial }: { initial: Doc }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Doc>(initial);
  const [saving, setSaving] = React.useState(false);
  const isEdit = Boolean(initial.id);

  function patch<K extends keyof Doc>(k: K, v: Doc[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    if (!form.title.trim()) return toast.error("Titul je povinný");
    setSaving(true);
    const payload = {
      ...(isEdit ? { id: form.id } : {}),
      title: form.title.trim(),
      body_md: form.body_md,
      target_role: form.target_role,
      category: (form.category || "obecne").trim(),
      sort_order: form.sort_order || 100,
      active: form.active,
    };
    try {
      const r = await fetch("/api/admin/training-docs", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      setSaving(false);
      if (!j.ok) return toast.error(`Chyba: ${j.error}`);
      toast.success(isEdit ? "✅ Uložené" : "✅ Vytvorené");
      setTimeout(() => {
        router.push("/admin/podklady");
        router.refresh();
      }, 900);
    } catch (e) {
      setSaving(false);
      toast.error(`Chyba: ${e instanceof Error ? e.message : "network"}`);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link
          href="/admin/podklady"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 dark:hover:bg-sky-950/40 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Podklady
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {isEdit ? "Upraviť podklad" : "Nový podklad"}
        </h1>
      </header>

      <section className="rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block md:col-span-2">
            <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">
              Titul
            </span>
            <input
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="Napr. Ako predávať chipsovú podlahu"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 mt-1 text-sm font-bold"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">
              Pre koho (rola)
            </span>
            <select
              value={form.target_role}
              onChange={(e) =>
                patch("target_role", e.target.value as Doc["target_role"])
              }
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 mt-1 text-sm font-bold"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">
              Kategória
            </span>
            <input
              list="cat-list"
              value={form.category}
              onChange={(e) => patch("category", e.target.value)}
              placeholder="obecne / sales-tips / protokol / …"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 mt-1 text-sm"
            />
            <datalist id="cat-list">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">
              Sort order
            </span>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => patch("sort_order", Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 mt-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => patch("active", e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-bold">Aktívny (viditeľný pre cieľovú rolu)</span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
        <div>
          <h2 className="font-black text-slate-900 dark:text-slate-100">Obsah</h2>
          <p className="text-[11px] text-muted-foreground">
            Markdown: <code># Nadpis</code>, <code>**tučné**</code>,{" "}
            <code>- zoznam</code>, <code>[link](url)</code>.
          </p>
        </div>
        <textarea
          value={form.body_md}
          onChange={(e) => patch("body_md", e.target.value)}
          rows={20}
          placeholder="# Ako predávať chipsovú&#10;&#10;## Zákazník sa pýta:&#10;- Prečo je drahšia než jednofarebná?&#10;- Odpoveď: …"
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono"
        />
      </section>

      <div className="flex justify-end gap-2 sticky bottom-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t p-3 rounded-lg">
        <Link
          href="/admin/podklady"
          className="inline-flex items-center rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-black px-4 py-2"
        >
          Zrušiť
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black px-4 py-2 disabled:opacity-50 shadow-md"
        >
          <Save className="w-4 h-4" />
          {saving ? "Ukladám…" : "Uložiť"}
        </button>
      </div>
    </div>
  );
}
