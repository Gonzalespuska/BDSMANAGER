"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface HealthTable {
  table: string;
  module: string;
  migration: string;
  exists: boolean;
  count: number | null;
  error: string | null;
}

interface SeedCheck {
  check: string;
  migration: string;
  ok: boolean;
  detail: string;
}

interface HealthResponse {
  ok: boolean;
  healthy: boolean;
  total: number;
  existing: number;
  missing: number;
  missing_seeds?: number;
  cache_stale?: number;
  cache_stale_tables?: string[];
  missing_migrations: string[];
  tables: HealthTable[];
  seed_checks?: SeedCheck[];
}

export function AdminHealthBanner() {
  const [data, setData] = React.useState<HealthResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);
  const [seedMsg, setSeedMsg] = React.useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/admin/health");
      const j = (await r.json()) as HealthResponse;
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }

  async function reloadPostgrest() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const r = await fetch("/api/admin/reload-postgrest", { method: "POST" });
      const j = (await r.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        manual_fix?: string;
      };
      if (!j.ok) {
        setSeedMsg(
          `⚠ ${j.error ?? "unknown"}${j.manual_fix ? ` — ${j.manual_fix}` : ""}`,
        );
      } else {
        setSeedMsg(`✓ ${j.message ?? "reloaded"}. Obnovujem…`);
        await new Promise((res) => setTimeout(res, 1500));
        await refresh();
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (e) {
      setSeedMsg(`⚠ ${e instanceof Error ? e.message : "network_error"}`);
    }
    setSeeding(false);
  }

  async function copyFixSql() {
    const sql = `-- 1) Vytvor pgrst_reload rpc (jednorázovo, aby v UI klik tlačidla fungoval):
CREATE OR REPLACE FUNCTION public.pgrst_reload() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN NOTIFY pgrst, 'reload schema'; END; $$;
GRANT EXECUTE ON FUNCTION public.pgrst_reload() TO service_role;

-- 2) Rovno refreshni schema cache:
NOTIFY pgrst, 'reload schema';`;
    try {
      await navigator.clipboard.writeText(sql);
      setSeedMsg("✓ SQL skopírované do schránky. Otvor Supabase SQL editor a paste + Run.");
    } catch {
      setSeedMsg("⚠ Prehliadač neumožnil kopírovanie. Nižšie je SQL na ručný copy-paste.");
    }
  }

  async function seedAppSettings() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const r = await fetch("/api/admin/seed-app-settings", {
        method: "POST",
      });
      const j = (await r.json()) as {
        ok: boolean;
        inserted?: number;
        skipped?: number;
        error?: string;
      };
      if (!j.ok) {
        setSeedMsg(`⚠ Chyba: ${j.error}`);
      } else {
        setSeedMsg(
          `✓ Pridané ${j.inserted ?? 0} nových keys (${j.skipped ?? 0} už existovalo). Obnovujem…`,
        );
        await refresh();
        // Force page reload aby /admin/nastavenia videl nové settings
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      setSeedMsg(`⚠ ${e instanceof Error ? e.message : "network_error"}`);
    }
    setSeeding(false);
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
        ⚠ DB health check zlyhal: {err}
      </div>
    );
  }
  // Kým sa check nedokončí, nič neukazuj — user nemusí vidieť „kontrolujem…"
  // ak nakoniec všetko OK. Ak niečo zlyhá, error banner sa objaví.
  if (!data) return null;
  // User 2026-07-12: „nemusi svietit iba ak to nebude spravne fungovat nech
  // to svieti" — pri zdravom stave banner úplne skryjeme, nezaberá miesto.
  if (data.healthy) return null;
  const totalIssues =
    data.missing + (data.missing_seeds ?? 0) + (data.cache_stale ?? 0);
  const hasOnlyCacheProblem =
    data.missing === 0 &&
    (data.missing_seeds ?? 0) === 0 &&
    (data.cache_stale ?? 0) > 0;

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-black text-amber-900 text-base">
            {hasOnlyCacheProblem ? (
              <>
                🔄 PostgREST schema cache je stale ({data.cache_stale} z{" "}
                {data.total} tabuliek)
              </>
            ) : (
              <>
                🚨 Admin má {totalIssues} problém
                {totalIssues === 1 ? "" : totalIssues < 5 ? "y" : "ov"} v DB
                (tabuľky chýbajú: {data.missing}, seed dáta chýbajú:{" "}
                {data.missing_seeds ?? 0}, cache stale: {data.cache_stale ?? 0}
                )
              </>
            )}
          </div>
          <div className="text-xs text-amber-800 mt-0.5">
            {hasOnlyCacheProblem ? (
              <>
                Tabuľky <strong>reálne existujú v DB</strong>, len PostgREST
                REST API cache o nich zatiaľ nevie. Supabase má viac PostgREST
                workerov — po <code className="bg-amber-100 px-1 rounded">
                  NOTIFY pgrst
                </code>{" "}
                niektorí picknú cache okamžite, iní až po ~30s. Klikni{" "}
                <strong>Reload</strong> 2-3× v odstupe 15s alebo počkaj
                minútu a refresh stránky.
              </>
            ) : (
              <>
                Tabuľky <strong>sú v DB</strong>, ale PostgREST schema cache
                je stale ALEBO chýbajú migrácie / seed dáta. Skús najprv
                „Reload PostgREST" tlačidlo nižšie — vyrieši 95 % prípadov.
              </>
            )}
          </div>
          <div className="text-sm text-amber-900 mt-1">
            Kým nespustíš nižšie uvedené SQL migrácie, CRUD niektorých admin
            sub-modulov nebude fungovať (add/edit/delete potichu zlyhá alebo
            hodí error). Otvor{" "}
            <a
              href="https://supabase.com/dashboard/project/wzcehdynanuuzztfrqyi/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-black text-sky-700"
            >
              Supabase SQL editor
            </a>{" "}
            a spusti postupne:
          </div>
          <ul className="mt-3 space-y-1">
            {data.missing_migrations.map((m) => (
              <li key={m} className="text-sm">
                <code className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-mono font-black text-amber-900">
                  supabase/{m}
                </code>
              </li>
            ))}
          </ul>

          {/* PostgREST cache refresh — najpravdepodobnejšie riešenie. */}
          <div className="mt-3 rounded-2xl bg-white border-2 border-sky-400 p-4 space-y-3">
            <div className="text-sm text-sky-900 font-black inline-flex items-center gap-2">
              🔄 Rýchla oprava — Reload PostgREST cache
            </div>
            <div className="text-xs text-sky-800">
              Väčšinou po migrácii Supabase automaticky nerefreshuje schema
              cache PostgREST. Toto by malo vyriešiť „table not found"
              chyby na väčšine tabuliek.
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={reloadPostgrest}
                disabled={seeding}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 text-sm font-black disabled:opacity-50 shadow-md"
              >
                {seeding && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                )}
                Reload PostgREST schema cache
              </button>
              <button
                type="button"
                onClick={copyFixSql}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-black shadow-md"
              >
                📋 Kopírovať fix SQL
              </button>
              <a
                href="https://supabase.com/dashboard/project/wzcehdynanuuzztfrqyi/sql/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-white border-2 border-sky-400 hover:bg-sky-50 text-sky-800 px-4 py-2.5 text-sm font-black shadow-sm"
              >
                🔗 Otvoriť Supabase SQL
              </a>
            </div>
            <div className="text-[11px] text-slate-700 leading-snug">
              <strong>Rýchly postup ak si na mobile:</strong> klikni „📋
              Kopírovať fix SQL" → klikni „🔗 Otvoriť Supabase SQL" → v
              editore paste (Cmd/Ctrl+V) → klikni „Run" → vráť sa sem a
              obnov stránku.
            </div>
            {seedMsg && (
              <div
                className={
                  "text-xs font-bold " +
                  (seedMsg.startsWith("✓")
                    ? "text-emerald-800"
                    : "text-rose-700")
                }
              >
                {seedMsg}
              </div>
            )}
            <details className="text-[10px] text-slate-600 mt-2">
              <summary className="cursor-pointer font-bold">
                Alternatíva: ak tlačidlo nefunguje (rpc pgrst_reload nie je
                nainštalovaný)
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <strong>Riešenie 1:</strong> Otvor{" "}
                  <a
                    href="https://supabase.com/dashboard/project/wzcehdynanuuzztfrqyi/sql/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-sky-700 font-bold"
                  >
                    Supabase SQL editor
                  </a>
                  {" "}a spusti:
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-2 rounded text-[10px] font-mono">
{`NOTIFY pgrst, 'reload schema';`}
                </pre>
                <div>
                  <strong>Riešenie 2:</strong> V Supabase dashboarde:{" "}
                  <strong>Settings → API → Restart PostgREST</strong>.
                </div>
                <div>
                  <strong>Riešenie 3:</strong> Vytvor rpc funkciu (jednorázovo)
                  a potom tlačidlo nižšie bude fungovať:
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-2 rounded text-[10px] font-mono">
{`CREATE OR REPLACE FUNCTION public.pgrst_reload()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN NOTIFY pgrst, 'reload schema'; END; $$;

GRANT EXECUTE ON FUNCTION public.pgrst_reload() TO service_role;`}
                </pre>
              </div>
            </details>
          </div>

          {(data.missing_seeds ?? 0) > 0 && (
            <div className="mt-3 rounded-lg bg-white border-2 border-emerald-300 p-3 space-y-2">
              <div className="text-xs text-emerald-900 font-bold">
                💡 Rýchla oprava: seed dáta pre Firma + Doprava + Zľavy
                (17 kľúčov) viem doplniť sám bez SQL editora.
              </div>
              <button
                type="button"
                onClick={seedAppSettings}
                disabled={seeding}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black disabled:opacity-50"
              >
                {seeding && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                )}
                Doplniť seed dáta teraz
              </button>
              {seedMsg && (
                <div
                  className={
                    "text-xs font-bold " +
                    (seedMsg.startsWith("✓")
                      ? "text-emerald-800"
                      : "text-rose-700")
                  }
                >
                  {seedMsg}
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                Tabuľky ktoré nemajú tento skratkový seed (call_scripts,
                realization_teams, procedure_step_library, atď.) musíš stále
                spustiť ako SQL migrácie.
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="mt-3 text-xs font-bold text-amber-800 underline"
          >
            {expanded
              ? "▲ Skryť detail per tabuľka"
              : `▼ Ukázať detail per tabuľka (${data.missing} chýba, ${data.existing} OK)`}
          </button>
          {expanded && (
            <>
              <div className="mt-3 text-[10px] font-black uppercase tracking-wider text-amber-800">
                Tabuľky
              </div>
              <ul className="mt-1 text-xs space-y-0.5">
                {data.tables.map((t) => (
                  <li key={t.table}>
                    {t.exists ? "✅" : "❌"}{" "}
                    <span className="font-bold">{t.module}</span>{" "}
                    <span className="text-slate-500">
                      ({t.table}
                      {t.exists
                        ? `, ${t.count} riadkov`
                        : `, migrácia ${t.migration}`}
                      )
                    </span>
                  </li>
                ))}
              </ul>
              {data.seed_checks && data.seed_checks.length > 0 && (
                <>
                  <div className="mt-3 text-[10px] font-black uppercase tracking-wider text-amber-800">
                    Seed dáta (init hodnoty)
                  </div>
                  <ul className="mt-1 text-xs space-y-0.5">
                    {data.seed_checks.map((s, i) => (
                      <li key={i}>
                        {s.ok ? "✅" : "❌"}{" "}
                        <span className="font-bold">{s.check}</span>{" "}
                        <span className="text-slate-500">
                          — {s.detail}
                          {!s.ok && ` (${s.migration})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
