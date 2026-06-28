"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  MailCheck,
  Pause,
  Play,
  Plus,
  Send,
  ShieldCheck,
  UserCircle,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmailAutocomplete } from "@/components/ui/email-autocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ROLE_BADGE_CLASSES,
  ROLE_LABELS,
  type AppUserRole,
} from "@/lib/roles";

/** Avatar farby per rola — saturovanejšie ako badge variants (full color circle). */
const ROLE_AVATAR_CLASSES: Record<AppUserRole, string> = {
  admin: "bg-amber-100 text-amber-800",
  obchod: "bg-sky-100 text-sky-800",
  obhliadky: "bg-violet-100 text-violet-800",
  realizacie: "bg-emerald-100 text-emerald-800",
};

import {
  activateAgentAction,
  createAgentAction,
  deactivateAgentAction,
  sendInviteAction,
  updateAgentAction,
} from "./actions";
import type { AgentListRow } from "./page";

/**
 * Tabuľka agentov + add-new button → modal.
 * Inline editovateľné: name, capacity (slider), role pill.
 * Bulk akcie: deaktivovať / aktivovať / nový magic link.
 */
export function AgentsTable({ initial }: { initial: AgentListRow[] }) {
  const router = useRouter();
  const [agents, setAgents] = React.useState(initial);
  const [addOpen, setAddOpen] = React.useState(false);

  // Sync ak server zaplikuje
  React.useEffect(() => {
    setAgents(initial);
  }, [initial]);

  const activeCount = agents.filter((a) => a.active).length;
  const inactiveCount = agents.length - activeCount;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{activeCount}</span> aktívnych
          {inactiveCount > 0 && (
            <span>
              {" "}· <span className="font-bold text-foreground">{inactiveCount}</span> deaktivovaných
            </span>
          )}
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="bg-sky-600 hover:bg-sky-700 text-white"
        >
          <UserPlus className="w-4 h-4 mr-1.5" aria-hidden />
          Pridať obchodníka
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <th className="text-left px-3 py-2">Obchodník</th>
              <th className="text-left px-3 py-2">Zaťaženosť</th>
              <th className="text-right px-3 py-2">Leady</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {agents.map((a) => (
              <AgentRow key={a.id} agent={a} onChanged={() => router.refresh()} />
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                  Žiadni agenti — pridaj prvého cez tlačidlo hore vpravo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddAgentModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function AgentRow({
  agent,
  onChanged,
}: {
  agent: AgentListRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteSent, setInviteSent] = React.useState(false);

  // Editácia mena sa robí v detail page; držíme len placeholder
  async function _unusedSaveName() {
    const res = await updateAgentAction(agent.id, { name: agent.name });
    if (!res.ok) {
      setError(res.error);
    } else {
      onChanged();
    }
  }

  // Role toggle bol prerobený na full picker v PermissionsCard (admin/agents/[id])
  // — admin musí explicitne vybrať rolu z 4 možností, nie len flip admin/obchod.

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const res = agent.active
      ? await deactivateAgentAction(agent.id)
      : await activateAgentAction(agent.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  async function sendInvite() {
    setBusy(true);
    setError(null);
    const res = await sendInviteAction(agent.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setInviteSent(true);
      setTimeout(() => setInviteSent(false), 3000);
    }
  }

  return (
    <>
      <tr className={cn("hover:bg-muted/30", !agent.active && "opacity-60")}>
        <td className="px-3 py-2">
          <div className="inline-flex items-center gap-2.5">
            <div
              className={cn(
                "w-8 h-8 rounded-full inline-flex items-center justify-center text-xs font-bold shrink-0",
                ROLE_AVATAR_CLASSES[agent.role as AppUserRole] ??
                  ROLE_AVATAR_CLASSES.obchod,
              )}
              title={ROLE_LABELS[agent.role as AppUserRole] ?? "Obchod"}
            >
              {initials(agent.name || agent.email)}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                <Link
                  href={`/admin/agents/${agent.id}`}
                  className="font-bold text-sm hover:underline decoration-dotted truncate max-w-[180px]"
                  title="Otvoriť detail agenta"
                >
                  {agent.name || (
                    <span className="text-muted-foreground italic">bez mena</span>
                  )}
                </Link>
                {/* ROLE BADGE — vedľa mena, farby a label z lib/auth */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                    ROLE_BADGE_CLASSES[agent.role as AppUserRole] ??
                      ROLE_BADGE_CLASSES.obchod,
                  )}
                >
                  {ROLE_LABELS[agent.role as AppUserRole] ?? "Obchod"}
                </span>
                {agent.inactive_flag && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[9px] font-bold uppercase"
                    title="Naposledy aktívny pred viac ako 24 hodinami"
                  >
                    24h+
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                {agent.email}
              </div>
            </div>
          </div>
        </td>

        <td className="px-3 py-2">
          {agent.role !== "admin" ? (
            agent.capacity > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Dostáva leady
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-700 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                Nedostáva leady
              </span>
            )
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>

        <td className="px-3 py-2 text-right tabular-nums text-xs">
          <span className="font-bold">{agent.active_leads}</span>
          <span className="text-muted-foreground"> / {agent.total_leads}</span>
        </td>
      </tr>

      {error && (
        <tr>
          <td colSpan={7} className="px-3 py-2 bg-muted/30">
            <div className="inline-flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden />
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
function CapacitySlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 w-full max-w-[160px]">
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1 accent-sky-500"
      />
      <span
        className={cn(
          "text-xs font-bold tabular-nums w-6 text-right",
          value === 0 && "text-amber-700",
        )}
      >
        {value === 0 ? "⏸" : value}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function AddAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState<
    "admin" | "obchod" | "obhliadky" | "realizacie"
  >("obchod");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await createAgentAction({ name, email, phone, role, capacity: 5 });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Agent vytvorený — magic link nezobrazujeme (admin si pozve usera ručne
    // alebo cez nový magic link button v zozname agentov).
    onCreated();
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-base font-bold inline-flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-sky-600" aria-hidden />
            Pridať obchodníka
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Zavrieť"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <form onSubmit={submit} className="p-5 space-y-3">
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive inline-flex items-center gap-2">
                <AlertCircle className="w-4 h-4" aria-hidden />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Meno *</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Peter Noga"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-email">Email *</Label>
              <EmailAutocomplete
                id="agent-email"
                value={email}
                onChange={setEmail}
                placeholder="peter@epoxidovo.sk"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Rola *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "obchod", label: "Obchod", color: "sky" },
                    { id: "obhliadky", label: "Obhliadky", color: "violet" },
                    { id: "realizacie", label: "Realizácie", color: "emerald" },
                    { id: "admin", label: "Admin", color: "amber" },
                  ] as const
                ).map((r) => {
                  const active = role === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={
                        "px-3 py-2 rounded-lg border-2 text-sm font-bold transition-all " +
                        (active
                          ? r.color === "sky"
                            ? "border-sky-500 bg-sky-50 text-sky-900"
                            : r.color === "violet"
                              ? "border-violet-500 bg-violet-50 text-violet-900"
                              : r.color === "emerald"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                                : "border-amber-500 bg-amber-50 text-amber-900"
                          : "border-zinc-200 bg-background hover:bg-muted/40 text-muted-foreground")
                      }
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                <strong>Obchod</strong> = volajú leady; <strong>Obhliadky</strong> = chodia obhliadnuť realizáciu; <strong>Realizácie</strong> = robia podlahy.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-phone">Telefón * (do mailov + PDF footera)</Label>
              <Input
                id="agent-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+421 905 123 456"
                required
              />
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button
                type="submit"
                disabled={busy || !name.trim() || !email.trim() || !phone.trim()}
                className="flex-1 bg-sky-600 hover:bg-sky-700"
              >
                {busy ? "Vytváram…" : (<>
                  <Plus className="w-4 h-4 mr-1" aria-hidden />
                  Vytvoriť agenta
                </>)}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Zrušiť
              </Button>
            </div>
          </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function initials(s: string): string {
  if (!s) return "?";
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatLastActive(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "teraz";
  if (min < 60) return `pred ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `pred ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `pred ${days} dňami`;
  return new Date(ts).toLocaleDateString("sk-SK");
}
