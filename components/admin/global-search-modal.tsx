"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Camera,
  ClipboardList,
  Hammer,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Settings,
  Share2,
  Shield,
  User,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

import { STATUS_META, type LeadStatus } from "@/lib/types/lead";

type Section = {
  title: string;
  href: string;
  keywords: string;
  Icon: LucideIcon;
};

const ADMIN_SECTIONS: Section[] = [
  { title: "Prehľad", href: "/admin/prehlad", keywords: "dashboard prehlad kpi metrics home admin overview", Icon: BarChart3 },
  { title: "Leady", href: "/admin/leads", keywords: "leady leads pool obchod", Icon: ClipboardList },
  { title: "Tím & Realizačné tímy", href: "/admin/agents", keywords: "team tim agenti agents obchodaci realizacne timy obhliadkari realizatori users", Icon: Users },
  { title: "Nastavenia CRM", href: "/admin/nastavenia", keywords: "nastavenia settings config firma pdf email dph sika mesta cennik zlava sub-modul", Icon: Settings },
  { title: "Podklady", href: "/admin/podklady", keywords: "podklady knowledge call scripty scenar sales tips protokoly", Icon: BookOpen },
  { title: "Call scripty", href: "/admin/callscripts", keywords: "call scripty callscript telefonat placeholder", Icon: Phone },
  { title: "Realizačné systémy", href: "/admin/systems", keywords: "realizacne systemy 264 3000 topstone postup kroky spotreba kg", Icon: Hammer },
  { title: "Kontent shotlist", href: "/admin/kontent", keywords: "kontent content shotlist foto video fotenie instagram stories", Icon: Camera },
  { title: "Objednávky materiálu", href: "/admin/objednavky", keywords: "objednavky material sika topstone order zakazka", Icon: Package },
  { title: "Skladové zásoby", href: "/admin/sklad", keywords: "sklad zasoby inventura materialy stav", Icon: Warehouse },
  { title: "Realne dáta", href: "/admin/realne-data", keywords: "realne data analytika reporty dokoncene realizacie casy fazy", Icon: BarChart3 },
  { title: "Meta OAuth setup", href: "/admin/meta-setup", keywords: "meta oauth facebook instagram fb ig token access system user page_ids graph_me_accounts webhook", Icon: Share2 },
];

function matchSections(query: string): Section[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const parts = q.split(/\s+/).filter(Boolean);
  return ADMIN_SECTIONS.filter((s) => {
    const hay = (s.title + " " + s.keywords).toLowerCase();
    return parts.every((p) => hay.includes(p));
  });
}

type LeadHit = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  source_type: string;
  source_campaign: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
  last_activity_at: string | null;
  lokalita: string | null;
};

type UserHit = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  capacity: number | null;
};

/**
 * Admin global search — modal ktorý sa otvorí Cmd+K / Ctrl+K alebo
 * klikom na search chip v hlavičke. Hľadá cez VŠETKY leady (bez ohľadu
 * na status/pool/assigned) + userov.
 *
 * User 2026-07-16: „admin musi vediet vyhladat cokolvek ci uz lead alebo
 * agenta alebo cokolvek".
 */
export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [leads, setLeads] = React.useState<LeadHit[]>([]);
  const [users, setUsers] = React.useState<UserHit[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ("");
      setLeads([]);
      setUsers([]);
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const q2 = q.trim();
    if (q2.length < 2) {
      setLeads([]);
      setUsers([]);
      setError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/admin/global-search?q=${encodeURIComponent(q2)}`,
        );
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          leads?: LeadHit[];
          users?: UserHit[];
          error?: string;
        };
        if (!r.ok || !j.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          setLeads([]);
          setUsers([]);
        } else {
          setLeads(j.leads ?? []);
          setUsers(j.users ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "network");
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-sky-500 to-sky-700 text-white px-4 py-3 flex items-center gap-3 shrink-0">
          <Search className="w-5 h-5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">
              Admin — globálne hľadanie
            </div>
            <div className="font-black text-sm leading-tight">
              Leady (všetky stavy) + tím
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b bg-slate-50 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onClose()}
              placeholder="Sekcia, meno, telefón, email… (aspoň 2 znaky)"
              className="w-full h-11 pl-10 pr-3 rounded-lg border-2 border-slate-200 focus:border-sky-400 focus:outline-none text-sm font-semibold"
            />
            {busy && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-sky-500" />
            )}
          </div>
        </div>

        {(() => {
          const sectionHits = matchSections(q);
          return (
        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              ⚠ {error}
            </div>
          )}

          {!error && q.trim().length < 2 && (
            <div className="text-center text-sm text-slate-500 py-10 space-y-2">
              <div className="text-3xl">🔍</div>
              <div>Napíš aspoň 2 znaky. Hľadá cez:</div>
              <ul className="text-xs text-slate-400 space-y-0.5 mt-2">
                <li>• admin sekcie (napr. „objednávky", „meta", „kontent")</li>
                <li>• leady vo VŠETKÝCH stavoch (nie iba pool)</li>
                <li>• všetky mená / telefóny / emaily</li>
                <li>• tímových členov (obchodákov + adminov)</li>
              </ul>
            </div>
          )}

          {!error &&
            q.trim().length >= 2 &&
            !busy &&
            sectionHits.length === 0 &&
            leads.length === 0 &&
            users.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-10">
                Nič sa nenašlo pre „{q}".
              </div>
            )}

          {sectionHits.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                📁 Sekcie ({sectionHits.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {sectionHits.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={onClose}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 hover:border-sky-400 bg-white hover:bg-sky-50/40 p-2.5 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                      <s.Icon className="w-4 h-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm text-slate-900 truncate">
                        {s.title}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate font-mono">
                        {s.href}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {leads.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                📇 Leady ({leads.length})
              </h3>
              <div className="space-y-1.5">
                {leads.map((l) => {
                  const meta = STATUS_META[l.status as LeadStatus];
                  return (
                    <Link
                      key={l.id}
                      href={`/agent/leads/${l.id}?from=/admin`}
                      onClick={onClose}
                      className="block rounded-lg border border-slate-200 hover:border-sky-400 bg-white hover:bg-sky-50/40 p-2.5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-black text-slate-900 truncate">
                              {l.name || "(bez mena)"}
                            </div>
                            {meta && (
                              <span
                                className={
                                  "text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded " +
                                  meta.pill
                                }
                              >
                                {meta.label}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex gap-2 mt-0.5 flex-wrap">
                            {l.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {l.phone}
                              </span>
                            )}
                            {l.email && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {l.email}
                              </span>
                            )}
                            {l.lokalita && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {l.lokalita}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                            Vlastník
                          </div>
                          <div className="text-xs font-black text-slate-700">
                            {l.assigned_name || (
                              <span className="italic text-slate-400">unassigned</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {users.length > 0 && (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                👥 Tím ({users.length})
              </h3>
              <div className="space-y-1.5">
                {users.map((u) => (
                  <Link
                    key={u.id}
                    href={`/admin/agents/${u.id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 hover:border-sky-400 bg-white hover:bg-sky-50/40 p-2.5 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                      {u.role === "admin" ? (
                        <Shield className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-slate-900 truncate">
                        {u.name || u.email}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {u.email} · {u.role}
                        {!u.active && " · vypnutý"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
          );
        })()}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/**
 * Trigger button — malý chip v hlavičke ktorý otvorí modal.
 * Cmd+K / Ctrl+K funguje globálne.
 */
export function GlobalSearchTrigger() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted/60 hover:bg-muted border border-input hover:border-sky-400 transition-colors"
        title="Hľadať (Cmd+K)"
        aria-label="Hľadať"
      >
        <Search
          className="w-4 h-4 text-muted-foreground group-hover:text-sky-600 transition-colors"
          aria-hidden
        />
      </button>
      <GlobalSearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
