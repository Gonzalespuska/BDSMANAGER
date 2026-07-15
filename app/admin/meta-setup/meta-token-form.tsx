"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";

/**
 * MetaTokenForm — jednoduchý form s 2 poľami (token + Page IDs) a Save.
 *
 * User 2026-07-15: „daj tam iba miesto kde copy pastnem ten kod a dam ulozit".
 *
 * Save uloží do Supabase secure_config → sync-meta-leads to hneď načíta pri
 * ďalšom cron behu (max 5 min). Žiadny redeploy netreba.
 */
export function MetaTokenForm() {
  const [token, setToken] = React.useState("");
  const [pageIds, setPageIds] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [discovering, setDiscovering] = React.useState(false);
  const [discovered, setDiscovered] = React.useState<
    Array<{ id: string; name: string }> | null
  >(null);
  const [flash, setFlash] = React.useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [existing, setExisting] = React.useState<{
    token_set: boolean;
    token_preview: string | null;
    token_updated_at: string | null;
    page_ids: string;
    page_ids_updated_at: string | null;
  } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch("/api/admin/meta-token", { cache: "no-store" });
      const j = (await r.json()) as {
        ok?: boolean;
        token_set: boolean;
        token_preview: string | null;
        token_updated_at: string | null;
        page_ids: string;
        page_ids_updated_at: string | null;
      };
      if (j.ok) {
        setExisting(j);
        if (j.page_ids) setPageIds(j.page_ids);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function discover() {
    if (!token.trim()) {
      setFlash({ kind: "err", text: "Najprv paste token do prvého poľa." });
      return;
    }
    setDiscovering(true);
    setFlash(null);
    setDiscovered(null);
    try {
      const r = await fetch("/api/admin/meta-token/discover-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        pages?: Array<{ id: string; name: string }>;
        error?: string;
        hint?: string;
      };
      if (!r.ok || !j.ok || !j.pages || j.pages.length === 0) {
        setFlash({
          kind: "err",
          text: `${j.error ?? "Nepodarilo sa načítať Pages"}${j.hint ? ` — ${j.hint}` : ""}`,
        });
        return;
      }
      setDiscovered(j.pages);
      // Auto-fillni všetky (99% adminov chce všetky, môže potom editovať)
      setPageIds(j.pages.map((p) => p.id).join(","));
      setFlash({
        kind: "ok",
        text: `✓ Nájdených ${j.pages.length} Pages — auto-fillnuté nižšie. Klik Uložiť.`,
      });
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setDiscovering(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!token.trim() || !pageIds.trim()) {
      setFlash({ kind: "err", text: "Vyplň oba polia." });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/meta-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          page_ids: pageIds.trim(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        setFlash({ kind: "err", text: `Chyba: ${j.error ?? "unknown"}` });
        setBusy(false);
        return;
      }
      setFlash({
        kind: "ok",
        text: "✓ Uložené. Cron sync (každých 5 min) použije nový token pri ďalšom behu.",
      });
      setToken("");
      await load();
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Sieťová chyba: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {existing?.token_set && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-black text-emerald-900">
              Token uložený: {existing.token_preview}
            </div>
            <div className="text-xs text-emerald-800 mt-0.5">
              {existing.token_updated_at &&
                `Posledná zmena: ${new Date(existing.token_updated_at).toLocaleString("sk-SK")}`}
            </div>
            <div className="text-xs text-emerald-800">
              Page IDs: <span className="font-mono">{existing.page_ids || "—"}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider font-black text-slate-700 mb-1 block">
          META_PAGE_ACCESS_TOKEN
        </label>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="EAA..."
          rows={4}
          spellCheck={false}
          className="w-full px-3 py-2 rounded-lg border-2 border-slate-300 text-sm font-mono focus:outline-none focus:border-sky-400 resize-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] uppercase tracking-wider font-black text-slate-700">
            META_PAGE_IDS (Facebook stránka ktorú sledovať)
          </label>
          <button
            type="button"
            onClick={discover}
            disabled={discovering || !token.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 disabled:opacity-60"
            title="Automaticky zistí Page IDs z tokenu (zavolá Graph API /me/accounts)"
          >
            {discovering ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            Auto-fill z tokenu
          </button>
        </div>
        <input
          value={pageIds}
          onChange={(e) => setPageIds(e.target.value)}
          placeholder='Klikni „Auto-fill" hore, alebo paste ID ručne'
          spellCheck={false}
          className="w-full h-10 px-3 rounded-lg border-2 border-slate-300 text-sm font-mono focus:outline-none focus:border-sky-400"
        />
        {discovered && discovered.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {discovered.map((p) => (
              <li
                key={p.id}
                className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 flex items-center gap-2"
              >
                <span className="font-black text-emerald-900 truncate">
                  {p.name}
                </span>
                <span className="text-emerald-700 font-mono ml-auto">
                  {p.id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {flash && (
        <div
          className={
            "rounded-lg p-3 text-sm font-bold " +
            (flash.kind === "ok"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200")
          }
        >
          {flash.text}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !token.trim() || !pageIds.trim()}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Uložiť
      </button>
    </form>
  );
}
