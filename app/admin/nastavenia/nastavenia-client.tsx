"use client";

import * as React from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { saveSettingV2 } from "@/app/admin/settings/actions";

type Setting = { key: string; value: unknown; label: string; description: string };
type City = { slug: string; label: string; km_from_hq: number; active: boolean };
type Sika = {
  sap_number: string;
  name: string;
  packaging: string;
  packaging_kg: number | null;
  category: string | null;
  active: boolean;
};
type Training = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  media_url: string | null;
  duration_min: number | null;
  role_target: string[];
  required: boolean;
  active: boolean;
};
type CustomMaterial = {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  price_per_sqm: number | null;
  price_per_unit: number | null;
  unit_label: string | null;
  active: boolean;
};

export function NastaveniaClient({
  settings,
  cities,
  sika,
  training,
  materials,
}: {
  settings: Setting[];
  cities: City[];
  sika: Sika[];
  training: Training[];
  materials: CustomMaterial[];
}) {
  // User 2026-07-12: „nechapem toto je tu tuplne na nic daj to prec a tie
  // ostatne nastavenia crm daj asi postupne od hora dole ale na jednu stranu".
  // Odstranené tabs (Firma/Doprava/Mestá/Sika/Materiály/Zľavy/Skolenie) —
  // všetko sa vykresľuje stacked, admin len skroluje.
  const firmaSet = settings.filter(
    (s) =>
      s.key.startsWith("company.") ||
      s.key.startsWith("pdf.") ||
      s.key.startsWith("email."),
  );
  const dopravaSet = settings.filter(
    (s) => s.key.startsWith("transport.") || s.key.startsWith("delivery."),
  );
  const zlavySet = settings.filter((s) => s.key.startsWith("discounts."));
  // Legacy — všetko čo nespadá do firma/doprava/zľavy (napr. dph.rate,
  // markup.*, margin.*, order.*). User vidí čo v DB naozaj má aj bez
  // migrácie 39, a vie tú hodnotu editovať priamo.
  const legacySet = settings.filter(
    (s) =>
      !s.key.startsWith("company.") &&
      !s.key.startsWith("pdf.") &&
      !s.key.startsWith("email.") &&
      !s.key.startsWith("transport.") &&
      !s.key.startsWith("delivery.") &&
      !s.key.startsWith("discounts."),
  );

  // User 2026-07-12: „od doprava dole vsetko prec … mesta sa budu
  // nastavovat v sadzbi materialu". Ostáva iba Firma + Doprava; Mestá
  // sa presúvajú do editora materiálových sadzieb, ostatné sekcie prec.
  void cities;
  void sika;
  void training;
  void zlavySet;

  return (
    <div className="space-y-6">
      <SectionBlock title="🏢 Firma" desc="Firemné údaje, PDF footer, email brand.">
        <SettingsList settings={firmaSet} />
      </SectionBlock>

      <SectionBlock
        title="🧪 Extra materiály (custom_materials)"
        desc="Custom materiály/položky s cenou za m² alebo za kus — legacy tabuľka, momentálne sa v generátore nepoužíva. (Cenník materiálov pre Generátor CP je samostatný sub-modul „Cenník materiálov“ hore.)"
      >
        <MaterialsTab initial={materials} />
      </SectionBlock>

      <SectionBlock title="🚗 Doprava" desc="Sadzby km + rezerva + rýchlosť.">
        <SettingsList settings={dopravaSet} />
      </SectionBlock>

      {legacySet.length > 0 && (
        <SectionBlock
          title="⚙️ Ostatné (marže, DPH, min. objednávka)"
          desc="Kľúče uložené v DB ktoré nespadajú do Firma/Doprava. Používajú sa generatorom."
        >
          <SettingsList settings={legacySet} />
        </SectionBlock>
      )}
    </div>
  );
}

/**
 * Preloží raw DB error message do zrozumiteľnej správy pre admina.
 * Ak sa v texte vyskytne názov chýbajúcej tabuľky, ukáže presnú migráciu
 * ktorú má spustiť. Iné errory nechá tak.
 */
function explainDbError(
  raw: string | undefined,
  migrationNum: number,
  expectedTable: string,
): string {
  const s = String(raw ?? "");
  if (
    s.includes("does not exist") ||
    s.includes("relation") ||
    s.includes(expectedTable) ||
    s === "invalid_field"
  ) {
    return `⚠ Tabuľka „${expectedTable}" neexistuje. Spusti supabase/${String(
      migrationNum,
    ).padStart(2, "0")}_*.sql v Supabase SQL editore.`;
  }
  return s || "unknown_error";
}

function InlineBanner({
  err,
  msg,
}: {
  err: string | null;
  msg?: string | null;
}) {
  if (err) {
    return (
      <div className="rounded-lg border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">
        {err}
      </div>
    );
  }
  if (msg) {
    return (
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
        {msg}
      </div>
    );
  }
  return null;
}

function SectionBlock({
  title,
  desc,
  children,
  id,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3 scroll-mt-24"
    >
      <header>
        <h3 className="text-lg font-black">{title}</h3>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </header>
      {children}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SettingsList — pre firma/doprava/zľavy taby (kľúč-hodnota)
function SettingsList({ settings }: { settings: Setting[] }) {
  if (settings.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed bg-amber-50 border-amber-200 p-6 text-center text-sm text-amber-900">
        Žiadne nastavenia v tomto tabe. Spusti{" "}
        <code className="bg-amber-100 px-1">supabase/39_admin_full_control.sql</code>.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {settings.map((s) => (
        <SettingRow key={s.key} setting={s} />
      ))}
    </ul>
  );
}

function SettingRow({ setting }: { setting: Setting }) {
  const initial =
    typeof setting.value === "string"
      ? setting.value
      : setting.value == null
        ? ""
        : JSON.stringify(setting.value);
  const [val, setVal] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveSettingV2(setting.key, val);
      if (!res.ok) {
        setMsg(`⚠ ${explainDbError(res.error, 39, "app_settings")}`);
      } else {
        setMsg("✓ Uložené");
        setTimeout(() => setMsg(null), 1500);
      }
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : "unknown"}`);
    }
    setBusy(false);
  }

  return (
    <li className="rounded-xl border-2 bg-white p-3 flex items-start gap-3 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <div className="font-black text-sm">{setting.label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{setting.description}</div>
        <div className="text-[10px] font-mono text-slate-400 mt-1">{setting.key}</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-64 h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-black"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Uložiť
        </button>
        {msg && <span className="text-xs font-bold text-slate-600">{msg}</span>}
      </div>
    </li>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Cities tab
function CitiesTab({ initial }: { initial: City[] }) {
  const [items, setItems] = React.useState(initial);
  const [newLabel, setNewLabel] = React.useState("");
  const [newKm, setNewKm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/admin/cities");
      const j = await r.json();
      if (j.ok) setItems(j.cities);
      else setErr(explainDbError(j.error, 39, "city_distances"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }

  async function add() {
    if (!newLabel.trim() || !newKm) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          km_from_hq: Number(newKm),
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErr(explainDbError(j.error, 39, "city_distances"));
        setBusy(false);
        return;
      }
      setNewLabel("");
      setNewKm("");
      setMsg(`✓ ${newLabel.trim()} pridané`);
      setTimeout(() => setMsg(null), 2000);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
    setBusy(false);
  }

  async function updateKm(slug: string, km: number) {
    setErr(null);
    try {
      const r = await fetch("/api/admin/cities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, km_from_hq: km }),
      });
      const j = await r.json();
      if (!j.ok) setErr(j.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }

  async function remove(slug: string) {
    if (!confirm("Zmazať mesto?")) return;
    setErr(null);
    try {
      const r = await fetch("/api/admin/cities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErr(j.error);
        return;
      }
      setItems((prev) => prev.filter((i) => i.slug !== slug));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 bg-slate-50 p-3 flex flex-wrap gap-2 items-center">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Mesto (napr. Žilina)"
          className="h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold flex-1 min-w-[160px]"
        />
        <input
          value={newKm}
          onChange={(e) => setNewKm(e.target.value)}
          placeholder="km od HQ"
          type="number"
          className="h-9 w-28 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold tabular-nums"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-black"
        >
          <Plus className="w-3.5 h-3.5" /> Pridať
        </button>
      </div>

      <InlineBanner err={err} msg={msg} />

      <div className="text-xs text-muted-foreground">{items.length} miest</div>
      <ul className="space-y-1">
        {items.map((c) => (
          <CityRow key={c.slug} city={c} onUpdate={updateKm} onRemove={remove} />
        ))}
      </ul>
    </div>
  );
}

function CityRow({
  city,
  onUpdate,
  onRemove,
}: {
  city: City;
  onUpdate: (slug: string, km: number) => Promise<void>;
  onRemove: (slug: string) => Promise<void>;
}) {
  const [km, setKm] = React.useState(String(city.km_from_hq));
  return (
    <li className="rounded-lg border bg-white px-3 py-1.5 flex items-center gap-2">
      <div className="flex-1 font-bold text-sm">{city.label}</div>
      <input
        value={km}
        onChange={(e) => setKm(e.target.value)}
        onBlur={() => {
          const n = Number(km);
          if (isFinite(n) && n !== city.km_from_hq) onUpdate(city.slug, n);
        }}
        type="number"
        className="w-24 h-8 px-2 rounded border text-sm tabular-nums"
      />
      <span className="text-xs text-slate-500">km</span>
      <button
        type="button"
        onClick={() => onRemove(city.slug)}
        className="text-rose-600 hover:text-rose-800"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Sika Catalog tab
function SikaTab({ initial }: { initial: Sika[] }) {
  const [items, setItems] = React.useState(initial);
  const [creating, setCreating] = React.useState(false);
  const [newSap, setNewSap] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newPack, setNewPack] = React.useState("");
  const [newKg, setNewKg] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function add() {
    if (!newSap || !newName) return;
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/sika-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sap_number: newSap,
          name: newName,
          packaging: newPack,
          packaging_kg: newKg ? Number(newKg) : null,
        }),
      });
      const jj = await r.json();
      if (!jj.ok) {
        setErr(explainDbError(jj.error, 39, "sika_catalog"));
        return;
      }
      const r2 = await fetch("/api/admin/sika-catalog");
      const j = await r2.json();
      if (j.ok) setItems(j.items);
      setCreating(false);
      setNewSap("");
      setNewName("");
      setNewPack("");
      setNewKg("");
      setMsg("✓ Produkt pridaný");
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }

  async function remove(sap: string) {
    if (!confirm(`Zmazať ${sap}?`)) return;
    setErr(null);
    try {
      const r = await fetch("/api/admin/sika-catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sap_number: sap }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErr(j.error);
        return;
      }
      setItems((prev) => prev.filter((i) => i.sap_number !== sap));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }

  return (
    <div className="space-y-3">
      <InlineBanner err={err} msg={msg} />
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{items.length} produktov</div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-black"
        >
          <Plus className="w-3.5 h-3.5" /> Pridať produkt
        </button>
      </div>
      {creating && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={newSap} onChange={(e) => setNewSap(e.target.value)} placeholder="SAP #" className="h-9 px-2 rounded-lg border text-sm font-mono" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Názov" className="h-9 px-2 rounded-lg border text-sm font-bold" />
          <input value={newPack} onChange={(e) => setNewPack(e.target.value)} placeholder="Balenie (napr. 10 kg vedro)" className="h-9 px-2 rounded-lg border text-sm" />
          <div className="flex gap-2">
            <input value={newKg} onChange={(e) => setNewKg(e.target.value)} placeholder="kg" type="number" className="h-9 w-16 px-2 rounded-lg border text-sm tabular-nums" />
            <button type="button" onClick={add} className="flex-1 rounded bg-emerald-600 text-white px-3 py-1.5 text-xs font-black">Pridať</button>
            <button type="button" onClick={() => setCreating(false)} className="rounded border px-3 py-1.5 text-xs">×</button>
          </div>
        </div>
      )}
      <ul className="space-y-1">
        {items.map((s) => (
          <li key={s.sap_number} className="rounded-lg border bg-white px-3 py-2 flex items-center gap-3 flex-wrap">
            <div className="font-mono text-xs w-24 text-slate-500">{s.sap_number}</div>
            <div className="flex-1 min-w-[180px] font-bold text-sm">{s.name}</div>
            <div className="text-xs text-slate-600">{s.packaging}</div>
            {s.category && <span className="text-[10px] uppercase font-bold text-slate-500">{s.category}</span>}
            <button type="button" onClick={() => remove(s.sap_number)} className="text-rose-600 hover:text-rose-800">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Materials tab
// (Cenník materiálov pre generator CP bol presunutý do samostatného
//  modulu /admin/cennik-materialov — user 2026-07-18: „chcem aby to bol
//  samostatny button ako hore".)
// ══════════════════════════════════════════════════════════════════════

function MaterialsTab({ initial }: { initial: CustomMaterial[] }) {
  const [items, setItems] = React.useState(initial);
  const [newSlug, setNewSlug] = React.useState("");
  const [newLabel, setNewLabel] = React.useState("");
  const [newPricePerSqm, setNewPricePerSqm] = React.useState("");
  async function add() {
    if (!newSlug.trim() || !newLabel.trim()) return;
    await fetch("/api/admin/custom-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: newSlug.trim(),
        label: newLabel.trim(),
        price_per_sqm: newPricePerSqm ? Number(newPricePerSqm) : null,
      }),
    });
    const r = await fetch("/api/admin/custom-materials");
    const j = await r.json();
    if (j.ok) setItems(j.items);
    setNewSlug("");
    setNewLabel("");
    setNewPricePerSqm("");
  }
  async function remove(id: string) {
    if (!confirm("Zmazať materiál?")) return;
    await fetch("/api/admin/custom-materials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 bg-slate-50 p-3 flex flex-wrap gap-2">
        <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="slug (napr. epoxy-primer-x)" className="h-9 px-2 rounded-lg border text-sm font-mono flex-1 min-w-[140px]" />
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label" className="h-9 px-2 rounded-lg border text-sm font-bold flex-1 min-w-[140px]" />
        <input value={newPricePerSqm} onChange={(e) => setNewPricePerSqm(e.target.value)} placeholder="€/m²" type="number" step="0.01" className="h-9 w-24 px-2 rounded-lg border text-sm tabular-nums" />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-3 py-1.5 text-xs font-black">
          <Plus className="w-3.5 h-3.5" /> Pridať
        </button>
      </div>
      <div className="text-xs text-muted-foreground">{items.length} vlastných materiálov</div>
      <ul className="space-y-1">
        {items.map((m) => (
          <li key={m.id} className="rounded-lg border bg-white px-3 py-2 flex items-center gap-3 flex-wrap">
            <div className="font-mono text-xs w-32 text-slate-500">{m.slug}</div>
            <div className="flex-1 min-w-[160px] font-bold text-sm">{m.label}</div>
            <div className="text-xs">
              {m.price_per_sqm != null && <span>{m.price_per_sqm} €/m²</span>}
              {m.price_per_unit != null && <span> {m.price_per_unit} €/{m.unit_label ?? "ks"}</span>}
            </div>
            <button type="button" onClick={() => remove(m.id)} className="text-rose-600 hover:text-rose-800">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Training tab
function TrainingTab({ initial }: { initial: Training[] }) {
  const [items, setItems] = React.useState(initial);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<"video" | "pdf" | "text" | "quiz">("video");
  const [url, setUrl] = React.useState("");
  const [roleTarget, setRoleTarget] = React.useState("");
  async function add() {
    if (!title.trim()) return;
    await fetch("/api/admin/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        kind,
        media_url: url || null,
        role_target: roleTarget
          ? roleTarget.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      }),
    });
    const r = await fetch("/api/admin/training");
    const j = await r.json();
    if (j.ok) setItems(j.modules);
    setTitle("");
    setUrl("");
    setRoleTarget("");
  }
  async function remove(id: string) {
    if (!confirm("Deaktivovať modul?")) return;
    await fetch("/api/admin/training", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 bg-slate-50 p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titulok modulu" className="h-9 px-2 rounded-lg border text-sm font-bold flex-1 min-w-[180px]" />
          <select value={kind} onChange={(e) => setKind(e.target.value as "video" | "pdf" | "text" | "quiz")} className="h-9 px-2 rounded-lg border text-sm font-bold">
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="text">Text</option>
            <option value="quiz">Quiz</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (YouTube / Vimeo / PDF)" className="h-9 px-2 rounded-lg border text-sm flex-1 min-w-[240px]" />
          <input value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} placeholder="role (comma: obchod,obhliadky…)" className="h-9 px-2 rounded-lg border text-sm w-64" />
          <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-3 py-1.5 text-xs font-black">
            <Plus className="w-3.5 h-3.5" /> Pridať
          </button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{items.length} modulov</div>
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t.id} className="rounded-lg border bg-white px-3 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-slate-500 w-14">{t.kind}</span>
            <div className="flex-1 font-bold text-sm">{t.title}</div>
            {t.media_url && (
              <a href={t.media_url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline">Otvor</a>
            )}
            {t.role_target.length > 0 && (
              <span className="text-[10px] text-slate-500">{t.role_target.join(", ")}</span>
            )}
            <button type="button" onClick={() => remove(t.id)} className="text-rose-600 hover:text-rose-800">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
