"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * TeamsAdmin — CRUD pre realization_teams a ich členov.
 *
 * User 2026-07-11:
 *   "zadefinujeme si timi v adminovi a tie mena z timov tam budes doplnat
 *    popripade pridaj moznost ked vyberas tim ho editnut napr ze das
 *    tim 1 ale mozes vymenit napr v tom time je jezko a petko a vies
 *    bud dat + a das tam este maja alebo minus a odoberes jezka".
 */

type Realizator = { id: string; name: string; email: string };
type Team = {
  id: string;
  name: string;
  description: string | null;
  home_city?: string | null;
  members: Realizator[];
};

export function TeamsAdmin({
  initialTeams,
  realizators,
}: {
  initialTeams: Team[];
  realizators: Realizator[];
}) {
  const router = useRouter();
  const [teams, setTeams] = React.useState<Team[]>(initialTeams);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function refresh() {
    try {
      const r = await fetch("/api/admin/teams");
      const j = await r.json();
      if (j.ok) setTeams(j.teams);
    } catch {
      /* ignore */
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {teams.length} tím{teams.length === 1 ? "" : "ov"} · {realizators.length}{" "}
          dostupných realizatorov
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nový tím
        </button>
      </div>

      <ul className="space-y-2">
        {teams.map((t) => (
          <TeamCard
            key={t.id}
            team={t}
            realizators={realizators}
            expanded={expanded === t.id}
            onToggle={() =>
              setExpanded((cur) => (cur === t.id ? null : t.id))
            }
            onChanged={refresh}
          />
        ))}
      </ul>

      {creating && (
        <NewTeamModal
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

function TeamCard({
  team,
  realizators,
  expanded,
  onToggle,
  onChanged,
}: {
  team: Team;
  realizators: Realizator[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = React.useState(team.name);
  const [description, setDescription] = React.useState(team.description ?? "");
  const [homeCity, setHomeCity] = React.useState(team.home_city ?? "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const memberIds = new Set(team.members.map((m) => m.id));
  const available = realizators.filter((r) => !memberIds.has(r.id));

  async function saveInfo() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: team.id,
        name,
        description: description || null,
        home_city: homeCity.trim() || null,
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

  async function addMember(userId: string) {
    setBusy(true);
    const r = await fetch("/api/admin/teams/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: team.id, user_id: userId }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChanged();
    else setMsg(`⚠ ${j.error}`);
  }

  async function removeMember(userId: string) {
    setBusy(true);
    const r = await fetch("/api/admin/teams/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: team.id, user_id: userId }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChanged();
    else setMsg(`⚠ ${j.error}`);
  }

  async function deleteTeam() {
    if (!confirm(`Zmazať tím „${team.name}"?`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/teams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: team.id }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) onChanged();
  }

  return (
    <li className="rounded-xl border-2 border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base leading-tight">{team.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {team.members.length === 0
              ? "Zatiaľ bez členov"
              : team.members.map((m) => m.name).join(" · ")}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50/40">
          <section className="rounded-xl bg-white border p-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Základné info
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Field label="Názov tímu">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
                />
              </Field>
              <Field label="Sídlo tímu (mesto, odkial vyrážajú)">
                <input
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                  placeholder="napr. Žilina"
                  className="w-full h-9 px-2 rounded-lg border-2 border-emerald-200 text-sm font-bold"
                />
              </Field>
              <Field label="Popis (voliteľné)">
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveInfo}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-black"
              >
                <Save className="w-3.5 h-3.5" />
                Uložiť
              </button>
              <button
                type="button"
                onClick={deleteTeam}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border-2 border-rose-200 hover:bg-rose-50 text-rose-700 px-3 py-1.5 text-xs font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Zmazať tím
              </button>
              {msg && <span className="text-xs font-bold">{msg}</span>}
            </div>
          </section>

          <section className="rounded-xl bg-white border p-3 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Členovia ({team.members.length})
            </div>
            {team.members.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                Zatiaľ žiadni. Pridaj z dostupných nižšie.
              </div>
            ) : (
              <ul className="space-y-1">
                {team.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm">{m.name}</div>
                      <div className="text-[11px] text-slate-500">{m.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 hover:bg-rose-50 text-rose-700 px-2 py-1 text-[11px] font-bold"
                    >
                      <UserMinus className="w-3 h-3" />
                      Odobrať
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {available.length > 0 && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Pridať dostupného
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {available.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addMember(r.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border-2 border-emerald-300 hover:bg-emerald-100 text-emerald-800 px-2.5 py-1 text-xs font-black"
                    >
                      <UserPlus className="w-3 h-3" />
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </li>
  );
}

function NewTeamModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [homeCity, setHomeCity] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setErr("Názov je povinný");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description || null,
        home_city: homeCity.trim() || null,
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
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white px-5 py-3 flex items-center gap-3">
          <Users className="w-5 h-5" />
          <div className="font-black text-lg">Nový tím</div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Názov tímu">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="napr. Tím Jano + Peťo"
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-black"
            />
          </Field>
          <Field label="Sídlo tímu (mesto, odkial vyrážajú)">
            <input
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              placeholder="napr. Žilina"
              className="w-full h-10 px-2 rounded-lg border-2 border-emerald-200 text-sm font-bold"
            />
          </Field>
          <Field label="Popis (voliteľné)">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="napr. Hlavný realizačný tím"
              className="w-full h-10 px-2 rounded-lg border-2 border-slate-200 text-sm font-bold"
            />
          </Field>
          {err && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
              ⚠ {err}
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 bg-slate-50 flex gap-2">
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
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Vytvoriť
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
