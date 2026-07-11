"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  ClipboardList,
  Hammer,
  Loader2,
  MapPin,
  Phone,
  User,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
import {
  calcInventory,
  systemsFor,
  type Binder,
  type FloorType,
  type InventoryLine,
} from "@/lib/data/realization-systems";

/**
 * ManualAssignModal — modal ktorý sa otvorí keď obchodák klikne
 * „+ Nová obhliadka" / „+ Nová realizácia" v hlavičke kalendára (bez
 * konkrétneho leadu).
 *
 * User: "manualne pridanie oblhiaky znamena ze nemas udaje v softwarei
 * a davas to tam manaulne tie udaje meno cislo email ak mas aspon jedno
 * mail alebo cislo tam musi byt".
 *
 * Flow:
 *   1. Obchodák vyplní: Meno + (Telefón alebo Email) + volitelne Mesto/m²/Typ
 *   2. POST /api/lead/manual-create → vytvorí lead v DB (status='new',
 *      assigned_to=obchodák)
 *   3. Redirect na /calendar?assign=<kind>&lead=<new_id>&city=<lokalita>
 *      → normálny assign flow (výber dátumu + realizátora + submit)
 */
export function ManualAssignModal({
  kind,
  onClose,
}: {
  kind: "inspection" | "realization";
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [city, setCity] = React.useState("");
  const [m2, setM2] = React.useState("");
  const [floorType, setFloorType] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ─── SYSTEM PICKER STATE (iba pre manual realization) ───────────────
  // User (2026-07-11):
  //   "aj ked robis manualne realizaciu musis tam udat ten system tak ako
  //    ked to robis z obhliadky … realizator ma dopredu dany ten system
  //    takze aj tu inventuru mu to vypocita presne kolko coho ma zobrat".
  const [systemType, setSystemType] = React.useState<FloorType>("jednofarebna");
  const [systemBinder, setSystemBinder] = React.useState<Binder>("epoxid");
  const [systemCode, setSystemCode] = React.useState<string>("264");

  // Ak obchodák vyplnil floorType v hornej časti, prepiš systemType podľa toho
  React.useEffect(() => {
    if (!floorType) return;
    const n = floorType
      .normalize("NFD")
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (n.includes("chips")) setSystemType("chipsova");
    else if (n.includes("mramor")) setSystemType("mramorova");
    else if (n.includes("metal")) setSystemType("metalicka");
    else if (n.includes("jedno")) setSystemType("jednofarebna");
  }, [floorType]);

  const availableSystems = React.useMemo(
    () =>
      systemsFor(
        systemType,
        systemType === "jednofarebna" ? systemBinder : null,
      ),
    [systemType, systemBinder],
  );

  // Ak zmena type/binder invaliduje aktuálny systém, prepni na prvý
  React.useEffect(() => {
    if (
      !availableSystems.find((s) => s.code === systemCode) &&
      availableSystems.length > 0
    ) {
      setSystemCode(availableSystems[0].code);
    }
  }, [availableSystems, systemCode]);

  const m2Num = m2.trim() ? parseFloat(m2) : 0;
  const inventoryPreview: InventoryLine[] = React.useMemo(
    () =>
      kind === "realization" && systemCode && m2Num > 0
        ? calcInventory(systemCode, m2Num)
        : [],
    [kind, systemCode, m2Num],
  );

  // Pre realizáciu musí byť aj systém vybraný (validácia klientská)
  const canSubmit =
    name.trim().length > 0 &&
    (phone.trim() || email.trim()) &&
    (kind === "inspection" || !!systemCode);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    // BUG FIX 2026-07-11: predtym sa pouzival window.history.replaceState,
    // ktory desyncne Next.js router state od browser URL. Ked user
    // potom klikol na Link ktory viedol na rovnaku URL, Next.js si
    // myslel ze URL sa nezmenil → soft nav = no-op → modal sa neotvoril
    // az po refresh. Fix: pouzi router.replace() aby Next.js state
    // ostal syncnuty. Tlacidla su uz aj tak buttony (nie Linky), takze
    // toto je len fallback pre deep-link `?manual=1`.
    const url = new URL(window.location.href);
    url.searchParams.delete("manual");
    url.searchParams.delete("assign");
    const nextUrl = url.pathname + (url.search ? url.search : "");
    router.replace(nextUrl, { scroll: false });
    onClose();
  }

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/lead/manual-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          city: city.trim() || null,
          m2: m2.trim() || null,
          floor_type: floorType.trim() || null,
          // Realizácia → posli aj systém, backend uloží realization_system
          // + realization_inventory rovno pri create.
          system: kind === "realization" ? systemCode : null,
          system_type: kind === "realization" ? systemType : null,
          system_binder:
            kind === "realization" && systemType === "jednofarebna"
              ? systemBinder
              : null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        lead_id?: string;
        error?: string;
      };
      if (!r.ok || !j.ok || !j.lead_id) {
        setError(j.error ?? `HTTP ${r.status}`);
        setSaving(false);
        return;
      }
      // User: "ked davam manualne vytvorit obhliadku alebo realizaciu
      // nech ma po vytvoreni nevravi na leady ale na kalendar cisto".
      // Explicitne redirectni na /calendar s assign params — bez
      // ohľadu na aktuálnu URL.
      const params = new URLSearchParams({ assign: kind, lead: j.lead_id });
      if (city.trim()) params.set("city", city.trim());
      window.location.href = `/calendar?${params.toString()}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setSaving(false);
    }
  }

  const isInspection = kind === "inspection";
  const tint = isInspection ? "violet" : "emerald";

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={cn(
            "px-5 py-4 border-b flex items-center gap-3",
            isInspection
              ? "bg-gradient-to-br from-violet-50 to-white"
              : "bg-gradient-to-br from-emerald-50 to-white",
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-full text-white flex items-center justify-center shrink-0 shadow-md",
              isInspection ? "bg-violet-500" : "bg-emerald-500",
            )}
          >
            {isInspection ? (
              <ClipboardList className="w-5 h-5" />
            ) : (
              <Hammer className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              ✏ Manuálne pridanie
            </div>
            <div className="font-black text-lg leading-tight">
              Nová {isInspection ? "obhliadka" : "realizácia"}
            </div>
            <div className="text-xs text-muted-foreground">
              Klient ktorý ešte nie je v CRM — vyplň údaje.
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
            aria-label="Zavrieť"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — Form */}
        <div className="p-5 space-y-4">
          {/* Meno (required) */}
          <Field
            label="Meno klienta"
            icon={<User className="w-4 h-4" />}
            required
          >
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="napr. Peter Kováč"
              className="w-full h-11 px-3 rounded-lg border-2 border-slate-200 bg-white text-base font-bold focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </Field>

          {/* Telefón + Email — aspoň jedno */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Telefón" icon={<Phone className="w-4 h-4" />}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+421 905 …"
                className="w-full h-11 px-3 rounded-lg border-2 border-slate-200 bg-white text-base font-bold tabular-nums focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
            <Field label="Email" icon={<AtSign className="w-4 h-4" />}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="meno@email.sk"
                className="w-full h-11 px-3 rounded-lg border-2 border-slate-200 bg-white text-base font-bold focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </Field>
          </div>

          {!phone.trim() && !email.trim() && name.trim() && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-900">
              ⚠ Vyplň aspoň telefón alebo email — inak nie ako klienta osloviť.
            </div>
          )}

          {/* Voliteľné — mesto / m² / typ */}
          <div className="rounded-xl bg-slate-50/60 border border-slate-200 p-3 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Voliteľné — ak vieš už teraz
            </div>
            <Field label="Mesto" icon={<MapPin className="w-4 h-4" />}>
              <CityAutocomplete value={city} onChange={setCity} placeholder="napr. Trnava" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plocha (m²)" icon={<span>📏</span>}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={m2}
                  onChange={(e) => setM2(e.target.value)}
                  placeholder="80"
                  className="w-full h-11 px-3 rounded-lg border-2 border-slate-200 bg-white text-base font-bold tabular-nums focus:border-sky-400 focus:outline-none"
                />
              </Field>
              <Field label="Typ podlahy" icon={<span>🎨</span>}>
                <select
                  value={floorType}
                  onChange={(e) => setFloorType(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border-2 border-slate-200 bg-white text-sm font-bold focus:border-sky-400 focus:outline-none"
                >
                  <option value="">— vyber —</option>
                  <option value="Jednofarebná">Jednofarebná</option>
                  <option value="Chipsová">Chipsová</option>
                  <option value="Mramorová">Mramorová</option>
                  <option value="Metalická">Metalická</option>
                  <option value="Antistatická">Antistatická</option>
                </select>
              </Field>
            </div>
          </div>

          {/* SYSTEM PICKER — iba pre manual realization.
              User 2026-07-11: "aj ked robis manualne realizaciu musis
              tam udat ten system tak ako ked to robis z obhliadky
              alebo hocijako inak ten system tam musi byt uz definovany
              aky ideme robit. potom realizator ma dopredu dany ten
              system takze aj tu inventuru mu to vypocita presne
              kolko coho ma zobrat zo skladu". */}
          {!isInspection && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                🔨 Systém realizácie (povinné)
              </div>

              {/* Typ podlahy — auto-detekcia z floorType hore */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Typ
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "jednofarebna", label: "Jednofarebná" },
                      { v: "chipsova", label: "Chipsová" },
                      { v: "mramorova", label: "Mramorová" },
                      { v: "metalicka", label: "Metalická" },
                    ] as Array<{ v: FloorType; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setSystemType(opt.v)}
                      className={cn(
                        "rounded-lg border-2 px-3 py-2 text-xs font-black transition-colors",
                        systemType === opt.v
                          ? "border-emerald-500 bg-emerald-100 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Binder iba pre jednofarebnu */}
              {systemType === "jednofarebna" && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    Živica
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["epoxid", "polyuretan"] as Binder[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setSystemBinder(b)}
                        className={cn(
                          "rounded-lg border-2 px-3 py-2 text-xs font-black capitalize transition-colors",
                          systemBinder === b
                            ? "border-sky-500 bg-sky-100 text-sky-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Systém */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Systém
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {availableSystems.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSystemCode(s.code)}
                      className={cn(
                        "rounded-lg border-2 px-3 py-2 text-left transition-colors",
                        systemCode === s.code
                          ? "border-emerald-500 bg-emerald-100"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                    >
                      <div
                        className={cn(
                          "font-black text-xs",
                          systemCode === s.code
                            ? "text-emerald-900"
                            : "text-slate-800",
                        )}
                      >
                        {s.label}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {s.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Náhľad auto-inventúry */}
              {inventoryPreview.length > 0 && m2Num > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-1">
                    📦 Auto-inventúra pre {m2Num.toFixed(0)} m²
                  </div>
                  <ul className="space-y-0.5">
                    {inventoryPreview.map((i) => (
                      <li key={i.sku} className="flex items-baseline gap-2 text-[11px]">
                        <span className="w-6 shrink-0 text-right font-black tabular-nums text-amber-900">
                          {i.qty}×
                        </span>
                        <span className="flex-1 font-bold text-slate-900">
                          {i.label}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {i.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!m2Num && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  ⚠ Vyplň m² hore aby sa inventúra spočítala automaticky.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-900">
              ⚠ Chyba: {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-slate-50 flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2.5 text-sm font-bold transition-colors"
          >
            Zrušiť
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || saving}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 rounded-lg text-white px-4 py-2.5 text-sm font-black transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
              tint === "violet"
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Vytváram…
              </>
            ) : (
              <>
                Vytvoriť + prejsť na kalendár →
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 inline-flex items-center gap-1.5 mb-1.5">
        {icon}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </div>
      {children}
    </label>
  );
}
