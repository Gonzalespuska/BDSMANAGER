"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ClipboardList,
  Hammer,
  Loader2,
  Package,
  ShieldCheck,
  Store,
  Trash2,
} from "lucide-react";

import {
  deleteAgentAction,
  updateAgentAction,
} from "@/app/admin/agents/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Permissions karta v detail obchodníka — v2 (2026-07-11).
 *
 * User: "rolu pridelujes ked vytvaras agenta popripade ked si rozkliknes
 *  existujuceho agenta a chces mi pridat rolu".
 *
 * Zmena oproti v1: namiesto len promote/demote toggle-u je tu plný role
 * picker so všetkými 6 rolami. Jeden klik zmení rolu (s confirm-om).
 */
export type UserRole =
  | "admin"
  | "obchod"
  | "obhliadky"
  | "realizacie"
  | "office"
  | "skolenie";

const ROLE_DEFS: Array<{
  role: UserRole;
  label: string;
  desc: string;
  icon: React.ReactNode;
  tint: string;
}> = [
  {
    role: "admin",
    label: "Admin",
    desc: "Plný prístup — správa userov, systémov, podkladov, všetkých leadov.",
    icon: <ShieldCheck className="w-4 h-4" />,
    tint: "amber",
  },
  {
    role: "obchod",
    label: "Obchodník",
    desc: "Volá leadom, posiela CP, priraďuje obhliadky + realizácie.",
    icon: <Store className="w-4 h-4" />,
    tint: "sky",
  },
  {
    role: "obhliadky",
    label: "Obhliadkár",
    desc: "Chodí na obhliadky, meria plochu, robí testy podkladu + foto.",
    icon: <ClipboardList className="w-4 h-4" />,
    tint: "violet",
  },
  {
    role: "realizacie",
    label: "Realizátor",
    desc: "Robí samotnú realizáciu podľa systému + inventúry.",
    icon: <Hammer className="w-4 h-4" />,
    tint: "emerald",
  },
  {
    role: "office",
    label: "Office",
    desc: "Admin support — objednávky, sklad, kontakty.",
    icon: <Package className="w-4 h-4" />,
    tint: "slate",
  },
  // User 2026-07-12: „tato rola prec" — rola „skolenie" odstranená z pickeru.
  // Type + DB constraint držíme kvôli back-compat s existujúcimi users,
  // ale v UI sa už nedá priradiť. Migrácia: scripts/migrate-skolenie.mjs.
];

export function PermissionsCard({
  agentId,
  role,
  secondaryRoles: initialSecondary,
  active,
  name,
}: {
  agentId: string;
  role: UserRole;
  /** User 2026-07-16: „chcem mu dat multiple role proste". */
  secondaryRoles?: UserRole[];
  active: boolean;
  name: string;
}) {
  void active;
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingRole, setPendingRole] = React.useState<UserRole | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [secondary, setSecondary] = React.useState<Set<UserRole>>(
    new Set(initialSecondary ?? []),
  );

  async function applyRole(next: UserRole) {
    setBusy(true);
    setError(null);
    const res = await updateAgentAction(agentId, { role: next });
    setBusy(false);
    setPendingRole(null);
    if (!res.ok) {
      setError(res.error);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { toast } = require("@/components/ui/toast");
      toast.error(`Chyba: ${res.error}`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { toast } = require("@/components/ui/toast");
      toast.success(`✅ Rola zmenená na „${labelOf(next)}"`);
      window.location.reload();
    }
  }

  async function saveSecondary() {
    setBusy(true);
    setError(null);
    const list = Array.from(secondary).filter((r) => r !== role);
    const res = await updateAgentAction(agentId, {
      secondary_roles: list,
    });
    setBusy(false);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { toast } = require("@/components/ui/toast");
    if (!res.ok) {
      setError(res.error);
      toast.error(`Chyba: ${res.error}`);
    } else {
      toast.success(
        list.length === 0
          ? "✅ Sekundárne role vymazané"
          : `✅ Sekundárne role uložené (${list.length})`,
      );
      window.location.reload();
    }
  }

  function toggleSecondary(r: UserRole) {
    setSecondary((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function doDelete() {
    setBusy(true);
    const res = await deleteAgentAction(agentId);
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      router.push("/admin/agents");
    }
  }

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-amber-600" aria-hidden />
        Rola a permissions
      </h2>

      <div className="rounded-xl border bg-background p-3 space-y-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Priraď rolu
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLE_DEFS.map((def) => {
            const isCurrent = def.role === role;
            return (
              <button
                key={def.role}
                type="button"
                disabled={busy || isCurrent}
                onClick={() => setPendingRole(def.role)}
                className={cn(
                  "text-left rounded-lg border-2 px-3 py-2.5 transition-colors flex items-start gap-2.5",
                  isCurrent
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300",
                  busy && "opacity-50 cursor-not-allowed",
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                    def.tint === "amber" && "bg-amber-100 text-amber-700",
                    def.tint === "sky" && "bg-sky-100 text-sky-700",
                    def.tint === "violet" && "bg-violet-100 text-violet-700",
                    def.tint === "emerald" && "bg-emerald-100 text-emerald-700",
                    def.tint === "slate" && "bg-slate-100 text-slate-700",
                    def.tint === "rose" && "bg-rose-100 text-rose-700",
                  )}
                >
                  {def.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-black text-sm">{def.label}</div>
                    {isCurrent && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white rounded-full px-1.5 py-0.5">
                        ✓ aktuálna
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 leading-snug mt-0.5">
                    {def.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sekundárne role — user môže mať viac rolí naraz.
          User 2026-07-16: „tu mi to nedovoluje mu pridat rolu iba zmenit
          ja mu chcem dat multiple role proste". */}
      <div className="mt-3 rounded-xl border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Dodatočné role (multi-role user)
          </div>
          {(() => {
            const currentSet = new Set(initialSecondary ?? []);
            const nextSet = new Set(Array.from(secondary).filter((r) => r !== role));
            const changed =
              currentSet.size !== nextSet.size ||
              !Array.from(currentSet).every((r) => nextSet.has(r));
            return changed ? (
              <button
                type="button"
                onClick={saveSecondary}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-2.5 py-1 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Uložiť
              </button>
            ) : null;
          })()}
        </div>
        <p className="text-[11px] text-slate-600 leading-snug">
          Napr. admin ktorý dostáva aj obchod-leady. Odškrtni tie ktoré má
          mať okrem primárnej role.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ROLE_DEFS.filter((d) => d.role !== role).map((def) => {
            const checked = secondary.has(def.role);
            return (
              <label
                key={def.role}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-colors",
                  checked
                    ? "border-sky-400 bg-sky-50 dark:bg-sky-950/30"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSecondary(def.role)}
                  disabled={busy}
                  className="w-4 h-4"
                />
                <span className="font-bold">{def.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-xl border bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Trash2 className="w-4 h-4 text-rose-600 mt-0.5" aria-hidden />
            <div>
              <div className="font-bold text-sm">Odobrať access</div>
              <div className="text-xs text-muted-foreground leading-snug mt-0.5">
                Trvalo odstráni účet (DB + auth). Leady ostanú bez priradenia.
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="border-rose-300 text-rose-800 hover:bg-rose-50 shrink-0"
          >
            <Trash2 className="w-4 h-4 mr-1.5" aria-hidden />
            Odobrať
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4" aria-hidden />
          {error}
        </div>
      )}

      {/* Confirm role change */}
      {pendingRole && (
        <ConfirmModal
          title={`Zmeniť rolu na ${labelOf(pendingRole)}?`}
          body={`${name} bude mať odteraz rolu „${labelOf(pendingRole)}" — ${descOf(
            pendingRole,
          )}`}
          cta="Áno, zmeniť"
          tone="emerald"
          busy={busy}
          onCancel={() => setPendingRole(null)}
          onConfirm={() => applyRole(pendingRole)}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmModal
          title="Odobrať access?"
          body={`Účet ${name} bude TRVALO odstránený. Leady ostanú v systéme bez priradenia. Túto akciu nemožno vrátiť.`}
          cta="Áno, odobrať"
          tone="rose"
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={doDelete}
        />
      )}
    </section>
  );
}

function labelOf(r: UserRole): string {
  return ROLE_DEFS.find((d) => d.role === r)?.label ?? r;
}
function descOf(r: UserRole): string {
  return ROLE_DEFS.find((d) => d.role === r)?.desc ?? "";
}

function ConfirmModal({
  title,
  body,
  cta,
  tone,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  cta: string;
  tone: "emerald" | "rose";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-2 mb-2">
          {tone === "rose" && (
            <AlertTriangle className="w-5 h-5 text-rose-600" aria-hidden />
          )}
          <h3 className="text-base font-bold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{body}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "flex-1",
              tone === "rose"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
            ) : (
              <Check className="w-4 h-4 mr-1.5" aria-hidden />
            )}
            {busy ? "Vykonávam…" : cta}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            Zrušiť
          </Button>
        </div>
      </div>
    </div>
  );
}
