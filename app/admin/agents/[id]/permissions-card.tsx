"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpCircle,
  Check,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";

import {
  deleteAgentAction,
  updateAgentAction,
} from "@/app/admin/agents/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Permissions karta v detail obchodníka.
 * Akcie:
 *   - Povýšiť na admina (role: obchod/obhliadky/realizacie → admin) — 2× confirm
 *   - Degradovať na obchodníka (admin → obchod)                    — 2× confirm
 *   - Odobrať access (DELETE z DB + auth)                          — 1× confirm
 */
type ActionType = "promote" | "demote" | "delete";

export function PermissionsCard({
  agentId,
  role,
  active,
  name,
}: {
  agentId: string;
  role: "admin" | "obchod" | "obhliadky" | "realizacie" | "office" | "skolenie";
  active: boolean;
  name: string;
}) {
  void active; // soft-deactivate sa už nepoužíva — len úplný delete
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<ActionType | null>(
    null,
  );
  const [confirmStep, setConfirmStep] = React.useState<1 | 2>(1);

  function startConfirm(a: ActionType) {
    setConfirmAction(a);
    setConfirmStep(1);
    setError(null);
  }

  function closeConfirm() {
    setConfirmAction(null);
    setConfirmStep(1);
  }

  async function execute() {
    if (!confirmAction) return;
    setBusy(true);
    setError(null);
    let res;
    if (confirmAction === "promote") {
      res = await updateAgentAction(agentId, { role: "admin" });
    } else if (confirmAction === "demote") {
      res = await updateAgentAction(agentId, { role: "obchod" });
    } else {
      res = await deleteAgentAction(agentId);
    }
    setBusy(false);
    closeConfirm();
    if (!res.ok) {
      setError(res.error);
    } else if (confirmAction === "delete") {
      router.push("/admin/agents");
    } else {
      router.refresh();
    }
  }

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider mb-2 inline-flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-amber-600" aria-hidden />
        Permissions
      </h2>

      <div className="rounded-xl border bg-background divide-y">
        {/* Povýšiť / Degradovať */}
        <Row
          icon={
            role === "admin" ? (
              <ShieldAlert className="w-4 h-4 text-amber-600" aria-hidden />
            ) : (
              <ArrowUpCircle className="w-4 h-4 text-amber-600" aria-hidden />
            )
          }
          title={role === "admin" ? "Degradovať na obchodníka" : "Povýšiť na admina"}
          desc={
            role === "admin"
              ? "Stratí prístup do admin sekcie, vráti sa medzi bežných obchodníkov."
              : "Získa plný prístup do admin sekcie (správa obchodníkov, leady, permissions)."
          }
          action={
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => startConfirm(role === "admin" ? "demote" : "promote")}
              className={cn(
                role === "admin"
                  ? "border-zinc-300 hover:bg-zinc-100"
                  : "border-amber-300 text-amber-800 hover:bg-amber-50",
              )}
            >
              {role === "admin" ? (
                <>
                  <UserMinus className="w-4 h-4 mr-1.5" aria-hidden />
                  Degradovať
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" aria-hidden />
                  Povýšiť
                </>
              )}
            </Button>
          }
        />

        {/* Úplne odobrať access — DELETE */}
        <Row
          icon={<Trash2 className="w-4 h-4 text-rose-600" aria-hidden />}
          title="Odobrať access"
          desc="Trvalo odstráni účet (DB + auth). Leady ostanú v systéme bez priradenia, môžeš ich potom pridať inému obchodníkovi."
          action={
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => startConfirm("delete")}
              className="border-rose-300 text-rose-800 hover:bg-rose-50"
            >
              <Trash2 className="w-4 h-4 mr-1.5" aria-hidden />
              Odobrať
            </Button>
          }
        />
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4" aria-hidden />
          {error}
        </div>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          step={confirmStep}
          name={name}
          busy={busy}
          onCancel={closeConfirm}
          onNext={() => setConfirmStep(2)}
          onExecute={execute}
        />
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
function ConfirmModal({
  action,
  step,
  name,
  busy,
  onCancel,
  onNext,
  onExecute,
}: {
  action: ActionType;
  step: 1 | 2;
  name: string;
  busy: boolean;
  onCancel: () => void;
  onNext: () => void;
  onExecute: () => void;
}) {
  // Promote/demote majú 2-step confirm. Delete má len 1-step.
  const needsTwoSteps = action === "promote" || action === "demote";
  const isLastStep = !needsTwoSteps || step === 2;

  const cfg = {
    promote: {
      title:
        step === 1
          ? "Povýšiť na admina?"
          : "Si si naozaj istý?",
      body:
        step === 1
          ? `${name} získa plný admin prístup — môže pridávať/odoberať obchodníkov, meniť permissions, vidieť všetky leady.`
          : `Posledná otázka — naozaj povýšiť ${name} na admina? Túto akciu môže následne odvolať len iný admin.`,
      cta: step === 1 ? "Pokračovať" : "Áno, povýšiť",
      tone: "emerald",
    },
    demote: {
      title:
        step === 1
          ? "Degradovať na obchodníka?"
          : "Si si naozaj istý?",
      body:
        step === 1
          ? `${name} stratí prístup do admin sekcie. Vráti sa medzi bežných obchodníkov.`
          : `Posledná otázka — naozaj degradovať ${name}? Stratí všetky admin permissions.`,
      cta: step === 1 ? "Pokračovať" : "Áno, degradovať",
      tone: "rose",
    },
    delete: {
      title: "Odobrať access?",
      body: `Účet ${name} bude TRVALO odstránený. Jeho leady ostanú v systéme, ale bez priradenia (môžeš ich potom pridať inému). Túto akciu nemožno vrátiť.`,
      cta: "Áno, odobrať access",
      tone: "rose" as const,
    },
  }[action];

  const toneColor = cfg.tone === "rose" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-2 mb-2">
          {action === "delete" || step === 2 ? (
            <AlertTriangle className="w-5 h-5 text-rose-600" aria-hidden />
          ) : null}
          <h3 className="text-base font-bold">{cfg.title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{cfg.body}</p>

        {needsTwoSteps && (
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-3">
            Krok {step} / 2
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={isLastStep ? onExecute : onNext}
            disabled={busy}
            className={cn("flex-1", toneColor)}
          >
            <Check className="w-4 h-4 mr-1.5" aria-hidden />
            {busy ? "Vykonávam…" : cfg.cta}
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

function Row({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="font-bold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug mt-0.5">
            {desc}
          </div>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
