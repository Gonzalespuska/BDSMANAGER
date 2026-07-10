"use client";

import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Info,
  Lightbulb,
  Loader2,
  Package,
  Pencil,
  Signature,
  UserCheck,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { saveExecutionAction } from "./execution-actions";
import { findGuide, type ProcedureGuide } from "@/lib/data/procedure-guides";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

interface TeamMember {
  id: string;
  name: string;
}

interface TaskRow {
  id: string;
  name: string;
  assigned_to: string | null; // user id
  signed_by: string | null;
  signed_at: string | null; // ISO
  notes: string;
}

interface InventoryRow {
  id: string;
  name: string;
  qty: number | null; // null = fixný nástroj bez počtu (checkbox)
  unit: string;
  category: "material" | "tool";
  checked: boolean;
}

interface ExecutionState {
  tasks: TaskRow[];
  inventory: InventoryRow[];
}

// ═══════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_TASKS: string[] = [
  "Vybrúsiť podklad (diamantové kotúče)",
  "Povysávať",
  "Skontrolovať povysávanie",
  "Vyspraviť diery, praskliny",
  "Aplikovať penetráciu",
  "Zbrúsiť penetráciu (medzi vrstvová)",
  "1. vrstva farebného náteru",
  "2. vrstva farebného náteru",
  "Aplikovať vrchný lak",
  "Finálna kontrola + fotky",
];

const DEFAULT_TOOLS: Array<{ name: string; unit?: string }> = [
  { name: "Stierka" },
  { name: "Valčeky", unit: "ks" },
  { name: "Nástroj na valček (držiak)" },
  { name: "Ježko (odvzdušňovací)", unit: "ks" },
  { name: "Spike shoes", unit: "páry" },
  { name: "Stellmit (nástroj)" },
  { name: "Kremičitý piesok", unit: "vrece" },
  { name: "Páska kobercová" },
  { name: "Vrecia na smeti 120L", unit: "ks" },
  { name: "Fólia na kraje / prekrytie" },
  { name: "Vysávač + nástavce" },
  { name: "Brúska Hilti / veľká" },
  { name: "Brúska trojuholník" },
  { name: "Brúska prenosná + malý vysávač" },
  { name: "Sprej na muchy a hmyz" },
  { name: "Páska papierová" },
  { name: "Špachtle rôzne veľkosti" },
  { name: "Nádoby, kýble rôzne" },
  { name: "Vlhkomer" },
  { name: "Váha" },
];

/**
 * Odhad materiálu na m² podľa typu podlahy.
 * Vracia zoznam { name, kg_per_m2, package_kg } ktorý sa použije na
 * automatický výpočet ks balení potrebných pre danú zákazku.
 *
 * Zdroj spotrieb: .epoxidovo-sika/CENNIK-MASTER.md (Sika TDS + Peto potvrdené).
 */
function estimateMaterials(
  m2: number,
  typPodlahy: string | null,
): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const type = (typPodlahy ?? "").toLowerCase();

  function pkgs(kgPerM2: number, packageKg: number): number {
    const kg = m2 * kgPerM2;
    return Math.ceil(kg / packageKg);
  }
  function row(name: string, qty: number, unit = "bal"): InventoryRow {
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      qty,
      unit,
      category: "material",
      checked: false,
    };
  }

  if (m2 <= 0) return rows;

  if (type.includes("chipsov")) {
    rows.push(row(`Sikafloor-01 Primer 10 kg (${pkgs(0.35, 10)}×)`, pkgs(0.35, 10)));
    rows.push(row(`Sikafloor-264 Plus RAL 30 kg (${pkgs(1.4, 30)}×)`, pkgs(1.4, 30)));
    rows.push(row(`Chipsy 5 kg (${pkgs(0.2, 5)}×)`, pkgs(0.2, 5)));
    rows.push(row(`Kremičitý piesok 25 kg (${pkgs(0.15, 25)}×)`, pkgs(0.15, 25)));
  } else if (type.includes("metalick")) {
    rows.push(row(`Topstone EP02 penetr. 25 kg (${pkgs(0.93, 25)}×)`, pkgs(0.93, 25)));
    rows.push(row(`Topstone EP11 Metalic BA 20 kg (${pkgs(1.22, 20)}×)`, pkgs(1.22, 20)));
    rows.push(row(`Topstone EP22 Plus lak 20 kg (${pkgs(1.19, 20)}×)`, pkgs(1.19, 20)));
    rows.push(row(`Topstone Akcelerátor 5 kg (${pkgs(0.04, 5)}×)`, pkgs(0.04, 5)));
  } else if (type.includes("mramor")) {
    rows.push(row(`Topstone EP02 penetr. 25 kg (${pkgs(0.93, 25)}×)`, pkgs(0.93, 25)));
    rows.push(row(`Topstone EP11 báza 20 kg (${pkgs(1.2, 20)}×)`, pkgs(1.2, 20)));
    rows.push(row(`Topstone EP22 Plus lak 20 kg (${pkgs(1.19, 20)}×)`, pkgs(1.19, 20)));
  } else if (type.includes("polyuret") || type.includes("pu")) {
    // Jednofarebná PU
    rows.push(row(`Sikafloor-150 Plus 25 kg (${pkgs(0.5, 25)}×)`, pkgs(0.5, 25)));
    rows.push(row(`Sikafloor-3000 RAL 20 kg (${pkgs(1.3, 20)}×)`, pkgs(1.3, 20)));
    rows.push(row(`Sikafloor-3310 top 20 kg (${pkgs(0.2, 20)}×)`, pkgs(0.2, 20)));
  } else {
    // Default = jednofarebná epoxid
    rows.push(row(`Sikafloor-01 Primer 10 kg (${pkgs(0.35, 10)}×)`, pkgs(0.35, 10)));
    rows.push(row(`Sikafloor-264 Plus RAL 30 kg (${pkgs(1.4, 30)}×)`, pkgs(1.4, 30)));
    rows.push(row(`Sikafloor-304W Matt 7,5 kg (${pkgs(0.18, 7.5)}×)`, pkgs(0.18, 7.5)));
  }

  return rows;
}

// ═══════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════

export function ExecutionWizard({
  leadId,
  m2,
  typPodlahy,
  priestor,
  team,
  meId,
  meName,
  existing,
}: {
  leadId: string;
  m2: number;
  typPodlahy: string | null;
  priestor: string | null;
  team: TeamMember[];
  meId: string;
  meName: string;
  existing: Partial<ExecutionState>;
}) {
  const [tasks, setTasks] = React.useState<TaskRow[]>(() => {
    if (existing.tasks?.length) return existing.tasks;
    return DEFAULT_TASKS.map((name, i) => ({
      id: `t-${i}`,
      name,
      assigned_to: team[i % team.length]?.id ?? null,
      signed_by: null,
      signed_at: null,
      notes: "",
    }));
  });

  const autoMaterials = React.useMemo(
    () => estimateMaterials(m2, typPodlahy),
    [m2, typPodlahy],
  );
  const [inventory, setInventory] = React.useState<InventoryRow[]>(() => {
    if (existing.inventory?.length) return existing.inventory;
    const tools = DEFAULT_TOOLS.map((t, i) => ({
      id: `tool-${i}`,
      name: t.name,
      qty: null,
      unit: t.unit ?? "",
      category: "tool" as const,
      checked: false,
    }));
    return [...autoMaterials, ...tools];
  });

  const [tasksOpen, setTasksOpen] = React.useState(false);
  const [inventoryOpen, setInventoryOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const tasksSigned = tasks.filter((t) => t.signed_at !== null).length;
  const inventoryChecked = inventory.filter((i) => i.checked).length;

  // Postup — vyberie sa podľa typu podlahy + priestoru
  const guide: ProcedureGuide = React.useMemo(
    () => findGuide(typPodlahy, priestor),
    [typPodlahy, priestor],
  );

  async function persist(next: Partial<ExecutionState>) {
    setSaving(true);
    const payload: ExecutionState = {
      tasks: next.tasks ?? tasks,
      inventory: next.inventory ?? inventory,
    };
    const r = await saveExecutionAction(leadId, payload as never);
    setSaving(false);
    if (!r.ok) {
      toast.error(`Uloženie zlyhalo: ${r.error}`);
      return false;
    }
    return true;
  }

  async function saveTasks(newTasks: TaskRow[]) {
    setTasks(newTasks);
    if (await persist({ tasks: newTasks })) {
      toast.success("Zodpovednosti uložené");
    }
    setTasksOpen(false);
  }
  async function saveInventory(newInv: InventoryRow[]) {
    setInventory(newInv);
    if (await persist({ inventory: newInv })) {
      toast.success("Inventúra uložená");
    }
    setInventoryOpen(false);
  }

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BigCard
          icon={<UserCheck className="w-8 h-8" />}
          title="Zodpovednosť"
          subtitle="Kto čo robí + podpis"
          summary={`${tasksSigned} / ${tasks.length} úkonov podpísaných`}
          done={tasksSigned === tasks.length && tasks.length > 0}
          onOpen={() => setTasksOpen(true)}
          accent="sky"
        />
        <BigCard
          icon={<Package className="w-8 h-8" />}
          title="Inventúra"
          subtitle="Materiál + náradie do dodávky"
          summary={`${inventoryChecked} / ${inventory.length} položiek odškrtnutých`}
          done={inventoryChecked === inventory.length && inventory.length > 0}
          onOpen={() => setInventoryOpen(true)}
          accent="amber"
        />
        <BigCard
          icon={<BookOpen className="w-8 h-8" />}
          title="Postup"
          subtitle={guide.title}
          summary={
            guide.id === "fallback"
              ? "⚠ Návod pre tento systém ešte nie je pripravený"
              : `${guide.steps.length} krokov · ${guide.total_time}`
          }
          done={false}
          onOpen={() => setGuideOpen(true)}
          accent="emerald"
        />
      </div>

      {saving && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Ukladám…
        </div>
      )}

      {tasksOpen && (
        <TasksModal
          initial={tasks}
          team={team}
          meId={meId}
          meName={meName}
          onClose={() => setTasksOpen(false)}
          onSave={saveTasks}
        />
      )}
      {inventoryOpen && (
        <InventoryModal
          initial={inventory}
          autoMaterials={autoMaterials}
          onClose={() => setInventoryOpen(false)}
          onSave={saveInventory}
        />
      )}
      {guideOpen && <GuideModal guide={guide} onClose={() => setGuideOpen(false)} />}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BigCard
// ═══════════════════════════════════════════════════════════════════════

function BigCard({
  icon,
  title,
  subtitle,
  summary,
  done,
  onOpen,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  summary: string;
  done: boolean;
  onOpen: () => void;
  accent: "sky" | "amber" | "emerald";
}) {
  const idle = {
    sky: "border-sky-200 bg-sky-50/50 hover:border-sky-400 text-sky-700",
    amber: "border-amber-200 bg-amber-50/50 hover:border-amber-400 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 text-emerald-700",
  }[accent];
  const iconIdle = {
    sky: "text-sky-500",
    amber: "text-amber-500",
    emerald: "text-emerald-500",
  }[accent];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative rounded-2xl border-2 p-5 transition-all text-left shadow-sm hover:shadow-md",
        done
          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
          : idle,
      )}
    >
      {done && (
        <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
          <Check className="w-5 h-5 text-white stroke-[3]" />
        </div>
      )}
      {done && (
        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white border-2 border-emerald-300 flex items-center justify-center">
          <Pencil className="w-3.5 h-3.5 text-emerald-700" />
        </div>
      )}
      <div className={cn("flex items-start gap-3", done && "pl-8")}>
        <div className={cn(done ? "text-emerald-600" : iconIdle)}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className={cn("font-extrabold text-lg", done && "text-emerald-900")}>
            {title}
          </div>
          <div className="text-xs opacity-80 mt-0.5">{subtitle}</div>
          <div
            className={cn(
              "text-sm font-semibold mt-2 leading-snug",
              done && "text-emerald-800",
            )}
          >
            {summary}
          </div>
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TASKS MODAL
// ═══════════════════════════════════════════════════════════════════════

function TasksModal({
  initial,
  team,
  meId,
  meName,
  onClose,
  onSave,
}: {
  initial: TaskRow[];
  team: TeamMember[];
  meId: string;
  meName: string;
  onClose: () => void;
  onSave: (tasks: TaskRow[]) => void;
}) {
  const [rows, setRows] = React.useState<TaskRow[]>(initial);
  const [pending, setPending] = React.useState(false);

  function updateRow(id: string, patch: Partial<TaskRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function toggleSign(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? r.signed_at
            ? { ...r, signed_at: null, signed_by: null }
            : {
                ...r,
                signed_at: new Date().toISOString(),
                signed_by: meId,
              }
          : r,
      ),
    );
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `t-${Date.now()}`,
        name: "Nová úloha",
        assigned_to: team[0]?.id ?? null,
        signed_by: null,
        signed_at: null,
        notes: "",
      },
    ]);
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const teamMap = new Map(team.map((t) => [t.id, t.name]));

  return (
    <ModalShell onClose={onClose} title="👥 Zodpovednosť za úkony">
      <div className="space-y-2 mb-4">
        {rows.map((row, idx) => {
          const assignedName =
            row.assigned_to && teamMap.get(row.assigned_to);
          const signerName =
            row.signed_by === meId ? meName : teamMap.get(row.signed_by ?? "");
          return (
            <div
              key={row.id}
              className={cn(
                "rounded-xl border-2 p-3 space-y-2",
                row.signed_at ? "border-emerald-300 bg-emerald-50/50" : "bg-background",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="text-xs font-black text-muted-foreground w-6 shrink-0 pt-1.5 tabular-nums">
                  {idx + 1}.
                </div>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  className="flex-1 rounded border-2 bg-background px-2 py-1 text-sm font-semibold focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                  aria-label="Zmazať úlohu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-8">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">
                  Robí:
                </label>
                <select
                  value={row.assigned_to ?? ""}
                  onChange={(e) =>
                    updateRow(row.id, { assigned_to: e.target.value || null })
                  }
                  className="rounded border-2 bg-background px-2 py-1 text-sm font-bold"
                >
                  <option value="">— Nikto —</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  ({assignedName ?? "nepridelene"})
                </span>
                {row.signed_at ? (
                  <button
                    type="button"
                    onClick={() => toggleSign(row.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 text-xs font-bold"
                  >
                    <Signature className="w-3.5 h-3.5" />
                    Podpísal {signerName ?? "?"} ·{" "}
                    {new Date(row.signed_at).toLocaleString("sk-SK", {
                      day: "numeric",
                      month: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <X className="w-3.5 h-3.5 ml-1 opacity-60" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleSign(row.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border-2 border-dashed border-sky-300 hover:border-sky-500 hover:bg-sky-50 text-sky-700 px-2.5 py-1 text-xs font-bold"
                  >
                    <Signature className="w-3.5 h-3.5" />
                    Podpísať ako {meName}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="flex-1 rounded-lg border-2 border-dashed border-sky-300 hover:border-sky-500 hover:bg-sky-50 text-sky-700 py-2 text-sm font-bold"
        >
          + Pridať vlastnú úlohu
        </button>
        <button
          type="button"
          onClick={async () => {
            setPending(true);
            try {
              await onSave(rows);
            } finally {
              setPending(false);
            }
          }}
          disabled={pending}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
        >
          {pending ? "Ukladám…" : "Uložiť"}
        </button>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INVENTORY MODAL
// ═══════════════════════════════════════════════════════════════════════

function InventoryModal({
  initial,
  autoMaterials,
  onClose,
  onSave,
}: {
  initial: InventoryRow[];
  autoMaterials: InventoryRow[];
  onClose: () => void;
  onSave: (rows: InventoryRow[]) => void;
}) {
  const [rows, setRows] = React.useState<InventoryRow[]>(initial);
  const [pending, setPending] = React.useState(false);

  function toggle(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)),
    );
  }
  function update(id: string, patch: Partial<InventoryRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function addCustom() {
    setRows((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: "Ďalšie",
        qty: 1,
        unit: "ks",
        category: "material",
        checked: false,
      },
    ]);
  }
  function resyncAuto() {
    // Zachová user-added items (id nezačína "sikafloor" / "topstone" / "chipsy" / "kremicity")
    setRows((prev) => {
      const nonAuto = prev.filter((r) => r.category !== "material" || r.id.startsWith("custom-"));
      const tools = prev.filter((r) => r.category === "tool");
      return [
        ...autoMaterials,
        ...tools,
        ...nonAuto.filter((r) => r.id.startsWith("custom-")),
      ];
    });
  }

  const materials = rows.filter((r) => r.category === "material");
  const tools = rows.filter((r) => r.category === "tool");

  return (
    <ModalShell onClose={onClose} title="📦 Inventúra na zákazku">
      <div className="space-y-4">
        {/* Materiál */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Materiál na zákazku (auto-výpočet podľa m² a typu podlahy)
            </h3>
            <button
              type="button"
              onClick={resyncAuto}
              className="text-[10px] font-bold text-sky-700 hover:text-sky-800 underline"
            >
              🔄 Prepočítať
            </button>
          </div>
          <div className="space-y-1.5">
            {materials.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed p-3 text-center text-xs text-muted-foreground italic">
                Zákazka nemá m² — auto-výpočet nedostupný. Pridaj ručne.
              </div>
            ) : (
              materials.map((r) => (
                <InvRow
                  key={r.id}
                  row={r}
                  onToggle={() => toggle(r.id)}
                  onUpdate={(p) => update(r.id, p)}
                  onRemove={() => remove(r.id)}
                  showQty
                />
              ))
            )}
          </div>
        </div>

        {/* Náradie */}
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2">
            Náradie + spotrebný materiál (fixný zoznam)
          </h3>
          <div className="space-y-1">
            {tools.map((r) => (
              <InvRow
                key={r.id}
                row={r}
                onToggle={() => toggle(r.id)}
                onUpdate={(p) => update(r.id, p)}
                onRemove={() => remove(r.id)}
                showQty={false}
              />
            ))}
          </div>
        </div>

        {/* Ďalšie */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addCustom}
            className="flex-1 rounded-lg border-2 border-dashed border-sky-300 hover:border-sky-500 hover:bg-sky-50 text-sky-700 py-2 text-sm font-bold"
          >
            + Pridať ďalšiu položku
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onSave(rows);
              } finally {
                setPending(false);
              }
            }}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
          >
            {pending ? "Ukladám…" : "Uložiť"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function InvRow({
  row,
  onToggle,
  onUpdate,
  onRemove,
  showQty,
}: {
  row: InventoryRow;
  onToggle: () => void;
  onUpdate: (p: Partial<InventoryRow>) => void;
  onRemove: () => void;
  showQty: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2",
        row.checked ? "bg-emerald-50 border-emerald-300 line-through opacity-70" : "bg-background",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors",
          row.checked
            ? "bg-emerald-500 border-emerald-500"
            : "border-slate-300 hover:border-emerald-400",
        )}
        aria-label={row.checked ? "Odškrtnúť" : "Odškrtnúť ako pripravené"}
      >
        {row.checked && <Check className="w-4 h-4 text-white stroke-[3]" />}
      </button>
      {showQty && (
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={row.qty ?? ""}
          onChange={(e) =>
            onUpdate({
              qty: e.target.value === "" ? null : parseInt(e.target.value, 10),
            })
          }
          className="w-14 rounded border-2 bg-background px-1 py-0.5 text-sm font-bold tabular-nums text-center"
        />
      )}
      <input
        type="text"
        value={row.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="flex-1 min-w-0 rounded border-2 bg-background px-2 py-0.5 text-sm font-semibold focus:border-sky-500 focus:outline-none"
      />
      {row.unit && (
        <span className="text-[10px] text-muted-foreground font-bold w-8 text-right">
          {row.unit}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
        aria-label="Zmazať"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GUIDE MODAL — automatický návod pre konkrétny systém podľa typu podlahy
// ═══════════════════════════════════════════════════════════════════════

function GuideModal({
  guide,
  onClose,
}: {
  guide: ProcedureGuide;
  onClose: () => void;
}) {
  const [stepIdx, setStepIdx] = React.useState(0);
  const totalSteps = guide.steps.length;
  const step = guide.steps[stepIdx];
  const isLast = stepIdx === totalSteps - 1;

  return (
    <ModalShell onClose={onClose} title={`📖 ${guide.title}`}>
      {/* Intro na 1. kroku */}
      {stepIdx === 0 && (
        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 p-4 mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-1">
            Systém
          </div>
          <div className="text-sm font-black text-emerald-900 mb-2">
            {guide.material_system}
          </div>
          <div className="text-sm text-emerald-900 leading-snug">
            {guide.intro}
          </div>
          <div className="text-[11px] font-bold text-emerald-700 mt-2 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {guide.total_time}
          </div>
        </div>
      )}

      {/* Aktuálny krok */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-sky-500 text-white font-black flex items-center justify-center text-lg tabular-nums">
            {stepIdx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-lg leading-tight">
              {step.title}
            </h3>
            {typeof step.duration_min === "number" && (
              <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                ~{step.duration_min} min
                {step.wait_hours_after && (
                  <span className="ml-2 text-amber-700 font-bold">
                    + {step.wait_hours_after} h čakať
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Popis */}
        <p className="text-sm leading-relaxed text-foreground/90">
          {step.description}
        </p>

        {/* Tips */}
        {step.tips && step.tips.length > 0 && (
          <div className="rounded-lg border-2 border-sky-200 bg-sky-50/50 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-700 mb-1.5 inline-flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" /> Tipy
            </div>
            <ul className="space-y-1 text-sm text-sky-900">
              {step.tips.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-sky-500 shrink-0">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {step.warnings && step.warnings.length > 0 && (
          <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-1.5 inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Pozor!
            </div>
            <ul className="space-y-1 text-sm text-rose-900">
              {step.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-rose-500 shrink-0">⚠</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Materials */}
        {step.materials && step.materials.length > 0 && (
          <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 inline-flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Materiál na tento krok
            </div>
            <ul className="space-y-0.5 text-sm text-slate-800">
              {step.materials.map((m, i) => (
                <li key={i}>• {m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 pt-4 border-t flex items-center gap-2">
        <button
          type="button"
          onClick={() => stepIdx > 0 && setStepIdx(stepIdx - 1)}
          disabled={stepIdx === 0}
          className="rounded-xl border-2 bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed px-4 py-3 text-sm font-bold text-muted-foreground transition-colors"
        >
          ← Späť
        </button>
        <div className="flex-1 text-center text-xs font-bold text-muted-foreground tabular-nums">
          {stepIdx + 1} / {totalSteps}
        </div>
        <button
          type="button"
          onClick={() => {
            if (isLast) {
              onClose();
            } else {
              setStepIdx(stepIdx + 1);
            }
          }}
          className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-4 py-3 text-sm font-black inline-flex items-center gap-2 shadow-md"
        >
          {isLast ? "Hotovo — Zavrieť" : "Ďalej"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Rýchly progres bar */}
      <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
          style={{ width: `${((stepIdx + 1) / totalSteps) * 100}%` }}
        />
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ModalShell (shared)
// ═══════════════════════════════════════════════════════════════════════

function ModalShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
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
        className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between z-10">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-sky-600" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="Zavrieť"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
