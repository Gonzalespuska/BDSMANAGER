"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Wifi } from "lucide-react";

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
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    ok: boolean;
    results: Array<{
      page_id: string;
      page_name: string | null;
      accessible: boolean;
      lead_forms_count: number;
      error: string | null;
    }>;
    fix: string | null;
  } | null>(null);
  // Ak už je token uložený, skryjeme token editor kým user nezaklikne
  // „Zmeniť token" (user 2026-07-15: „neda mi iba moznost nejkao editnut
  // ale mam tam stale to iste pole").
  const [editingToken, setEditingToken] = React.useState(false);

  async function testConnection() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/admin/meta-token/test", { method: "POST" });
      const j = (await r.json()) as {
        ok?: boolean;
        results?: Array<{
          page_id: string;
          page_name: string | null;
          accessible: boolean;
          lead_forms_count: number;
          error: string | null;
        }>;
        fix?: string | null;
        message?: string;
      };
      if (j.results) {
        setTestResult({
          ok: !!j.ok,
          results: j.results,
          fix: j.fix ?? null,
        });
      } else {
        setFlash({ kind: "err", text: j.message ?? "Test failed" });
      }
    } catch (e) {
      setFlash({
        kind: "err",
        text: `Test error: ${e instanceof Error ? e.message : "unknown"}`,
      });
    } finally {
      setTesting(false);
    }
  }
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
        text: "✓ Uložené. Overujem že token funguje…",
      });
      setToken("");
      setEditingToken(false);
      await load();
      // Auto-run test — user 2026-07-15: „preco neukaze ze teda funguje".
      await testConnection();
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
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <div className="font-black text-emerald-900">
                Token uložený: {existing.token_preview}
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                {existing.token_updated_at &&
                  `Posledná zmena: ${new Date(existing.token_updated_at).toLocaleString("sk-SK")}`}
              </div>
              <div className="text-xs text-emerald-800">
                Page IDs:{" "}
                <span className="font-mono">
                  {existing.page_ids || "—"}
                </span>
              </div>
            </div>
            {!editingToken && (
              <button
                type="button"
                onClick={() => setEditingToken(true)}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-black bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              >
                ✏️ Zmeniť
              </button>
            )}
          </div>
        </div>
      )}

      {/* Token pole zobrazujeme buď ak ešte nič nie je uložené,
          alebo keď user explicitne klikol „Zmeniť". */}
      {(!existing?.token_set || editingToken) && (
        <div>
          <label className="text-[10px] uppercase tracking-wider font-black text-slate-700 mb-1 block">
            META_PAGE_ACCESS_TOKEN
            {editingToken && (
              <button
                type="button"
                onClick={() => {
                  setEditingToken(false);
                  setToken("");
                }}
                className="ml-2 text-[10px] font-bold text-slate-500 hover:text-slate-700 normal-case"
              >
                (zrušiť zmenu)
              </button>
            )}
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
      )}

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

      <div className="flex items-center gap-2">
        {/* Uložiť zobrazíme iba keď je token editable */}
        {(!existing?.token_set || editingToken) && (
          <button
            type="submit"
            disabled={busy || !token.trim() || !pageIds.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Uložiť
          </button>
        )}
        {existing?.token_set && (
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className={
              (existing?.token_set && !editingToken ? "flex-1 " : "") +
              "inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black disabled:opacity-60 " +
              (existing?.token_set && !editingToken
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-800")
            }
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            {existing?.token_set && !editingToken
              ? "Otestovať teraz"
              : "Otestovať"}
          </button>
        )}
      </div>

      {testResult && (
        <div
          className={
            "rounded-xl border-2 p-4 space-y-2 " +
            (testResult.ok
              ? "border-emerald-300 bg-emerald-50"
              : "border-rose-300 bg-rose-50")
          }
        >
          <div className="flex items-center gap-2 text-sm font-black">
            {testResult.ok ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-900">
                  Token funguje — Meta lead ads sa budú syncovať.
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span className="text-rose-900">
                  Token má problém — pozri detail nižšie.
                </span>
              </>
            )}
          </div>
          <ul className="space-y-1.5">
            {testResult.results.map((r) => (
              <li
                key={r.page_id}
                className={
                  "rounded-lg p-2 text-xs " +
                  (r.error ? "bg-rose-100 border border-rose-200" : "bg-white border border-emerald-200")
                }
              >
                <div className="font-black text-slate-900">
                  {r.page_name ?? r.page_id}
                </div>
                <div className="text-slate-600 font-mono text-[10px]">
                  {r.page_id}
                </div>
                {r.error ? (
                  <div className="mt-1 text-rose-800 font-semibold">
                    ✗ {r.error}
                  </div>
                ) : (
                  <div className="mt-1 text-emerald-800 font-semibold">
                    ✓ Prístup OK · {r.lead_forms_count} lead form(iek) viditeľných
                  </div>
                )}
              </li>
            ))}
          </ul>
          {testResult.fix && (
            <div className="rounded-lg bg-amber-100 border border-amber-300 p-3 text-xs text-amber-900 font-semibold mt-2">
              💡 Fix: {testResult.fix}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
