"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Hammer,
  Loader2,
  MapPin,
  Phone,
  Search,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPhoneSK } from "@/lib/phone-format";

interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  city: string | null;
  m2: string | null;
  floor_type: string | null;
}

/**
 * ManualAssignModal — modal ktorý sa otvorí keď obchodák klikne
 * „+ Nová obhliadka" / „+ Nová realizácia" v hlavičke kalendára (bez
 * konkrétneho leadu). Umožní vyhľadať lead a preklápa sa do assign
 * mode s vybraným lead-om.
 *
 * Query params:
 *   /calendar?assign=inspection&manual=1  → otvorí modal
 *   Po výbere leadu redirect na:
 *   /calendar?assign=inspection&lead=<uuid>&city=<lokalita>
 */
export function ManualAssignModal({
  kind,
  onClose,
}: {
  kind: "inspection" | "realization";
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [leads, setLeads] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Load leadov — pri prvom otvorení + pri každom query change (debounced)
  React.useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/agent/leads-search?kind=${kind}&q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        const json = (await r.json()) as {
          ok?: boolean;
          leads?: LeadRow[];
          error?: string;
        };
        if (!r.ok || !json.ok) {
          setError(json.error ?? `HTTP ${r.status}`);
          setLeads([]);
        } else {
          setLeads(json.leads ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "network");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, kind]);

  // Esc → close
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pick(l: LeadRow) {
    const cityParam = l.city ? `&city=${encodeURIComponent(l.city)}` : "";
    router.push(`/calendar?assign=${kind}&lead=${l.id}${cityParam}`);
  }

  const isInspection = kind === "inspection";

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={cn(
            "px-5 py-3 border-b flex items-center justify-between",
            isInspection
              ? "bg-gradient-to-b from-violet-50/60 to-transparent"
              : "bg-gradient-to-b from-emerald-50/60 to-transparent",
          )}
        >
          <div>
            <h2 className="font-extrabold text-base inline-flex items-center gap-2">
              {isInspection ? (
                <>
                  <ClipboardList
                    className="w-5 h-5 text-violet-600"
                    aria-hidden
                  />
                  Nová obhliadka
                </>
              ) : (
                <>
                  <Hammer className="w-5 h-5 text-emerald-600" aria-hidden />
                  Nová realizácia
                </>
              )}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Vyber lead → prejdeš na výber dátumu v kalendári.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Zavrieť"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search
              className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Meno, telefón (0950…, +421…), email…"
              autoFocus
              className="pl-9 h-11 text-base"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm inline-flex items-center gap-2 justify-center w-full">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Načítavam leady…
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg m-4">
              ⚠ {error}
            </div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {query.length >= 2
                ? `Žiadne leady pre „${query}"`
                : "Zadaj meno alebo telefón na vyhľadanie."}
            </div>
          ) : (
            <ul className="divide-y">
              {leads.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => pick(l)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 text-white font-bold text-sm",
                        isInspection ? "bg-violet-500" : "bg-emerald-500",
                      )}
                    >
                      {initials(l.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">
                        {l.name || (
                          <span className="italic text-muted-foreground">
                            bez mena
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2 flex-wrap">
                        {l.phone && (
                          <span className="tabular-nums inline-flex items-center gap-0.5">
                            <Phone className="w-3 h-3" aria-hidden />
                            {formatPhoneSK(l.phone)}
                          </span>
                        )}
                        {l.city && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" aria-hidden />
                            {l.city}
                          </span>
                        )}
                        {l.m2 && <span>📐 {l.m2} m²</span>}
                        {l.floor_type && (
                          <span className="text-muted-foreground/70">
                            · {l.floor_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded",
                        "bg-muted text-muted-foreground",
                      )}
                    >
                      {l.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3 border-t bg-muted/20 text-[11px] text-muted-foreground">
          Po výbere leadu ťa systém presunie do kalendára — klikneš voľný deň
          → priradenie.
        </footer>
      </div>
    </div>
  );
}

function initials(s: string): string {
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
