export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/health — DB migration status check.
 *
 * Vráti zoznam admin tabuliek s tým či existujú v prod Supabase alebo nie.
 * Ak nejaká chýba, ukáže presne ktorú migráciu spustiť.
 *
 * User 2026-07-12: „nic nefunguje". Root cause: väčšina migrácií 30–40
 * nebola spustená v prod Supabase → tabuľky neexistujú → CRUD tiche padá.
 */

interface TableCheck {
  table: string;
  module: string;
  migration: string;
  exists: boolean;
  count: number | null;
  error: string | null;
}

const CHECKS: Array<Omit<TableCheck, "exists" | "count" | "error">> = [
  { table: "app_settings", module: "Nastavenia (Firma/Doprava/Zľavy)", migration: "39_admin_full_control.sql" },
  { table: "city_distances", module: "Mestá + km od HQ", migration: "39_admin_full_control.sql" },
  { table: "sika_catalog", module: "Sika katalóg", migration: "39_admin_full_control.sql" },
  { table: "custom_materials", module: "Vlastné materiály", migration: "39_admin_full_control.sql" },
  { table: "training_modules", module: "Školenie moduly", migration: "39_admin_full_control.sql" },
  { table: "realization_systems", module: "Realizačné systémy (264, 3000…)", migration: "30_realization_systems.sql" },
  { table: "realization_system_products", module: "Komponenty systému", migration: "30_realization_systems.sql" },
  { table: "call_scripts", module: "Podklady — Call skripty", migration: "31_call_scripts_and_procedures.sql" },
  { table: "realization_teams", module: "Realizačné tímy", migration: "33_realization_teams.sql" },
  { table: "realization_team_members", module: "Členovia tímov", migration: "33_realization_teams.sql" },
  { table: "content_shotlist_templates", module: "Kontent shotlist", migration: "38_content_shotlist_templates.sql" },
  { table: "procedure_step_library", module: "Knižnica krokov postupu", migration: "40_procedure_step_library.sql" },
];

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const results: TableCheck[] = [];

  // Test 1 — existencia tabuľky (HEAD count). Ak zlyhá, tabuľka reálne
  // chýba v Postgrese a treba spustiť SQL migráciu.
  // Test 2 — PostgREST cache freshness (real SELECT). Ak HEAD prešiel ale
  // SELECT hlási "not found in schema cache", tabuľka existuje ale REST
  // cache je stale → user musí spustiť NOTIFY pgrst, 'reload schema'.
  const cacheStaleErrors: string[] = [];

  for (const c of CHECKS) {
    try {
      // Test 1: existencia
      const { count, error: headErr } = await admin
        .from(c.table)
        .select("*", { count: "exact", head: true });

      if (headErr) {
        results.push({
          ...c,
          exists: false,
          count: null,
          error: headErr.message,
        });
        continue;
      }

      // Test 2: cache freshness — retry-safe (Supabase workerov je viac,
      // niektorý môže mať stale cache napriek reloadu).
      let selectOk = false;
      let lastErr: string | null = null;
      for (let attempt = 0; attempt < 3 && !selectOk; attempt++) {
        const { error: selErr } = await admin
          .from(c.table)
          .select("*")
          .limit(1);
        if (!selErr) {
          selectOk = true;
        } else {
          lastErr = selErr.message;
          // Malá pauza pred retry — dá PostgREST šancu.
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (!selectOk && lastErr) cacheStaleErrors.push(`${c.table}: ${lastErr}`);

      results.push({
        ...c,
        exists: true,
        count: count ?? 0,
        // Ak head prešiel ale select nie → cache stale ale tabuľka existuje.
        error: selectOk ? null : `cache_stale: ${lastErr ?? "select failed"}`,
      });
    } catch (e) {
      results.push({
        ...c,
        exists: false,
        count: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Bonus check — konkrétne SEED riadky v app_settings od migrácie 39.
  // Tabuľka môže existovať (z 22) ale keys company./transport./discounts.
  // nie sú v DB → firma+doprava sekcie prázdne aj napriek zelenému stavu.
  const seedChecks: Array<{
    check: string;
    migration: string;
    ok: boolean;
    detail: string;
  }> = [];

  const { data: settingsRows } = await admin
    .from("app_settings")
    .select("key");
  const keys = new Set((settingsRows ?? []).map((r) => r.key as string));
  const hasCompany = Array.from(keys).some((k) => k.startsWith("company."));
  const hasTransport = Array.from(keys).some((k) => k.startsWith("transport."));
  const hasDiscounts = Array.from(keys).some((k) => k.startsWith("discounts."));
  seedChecks.push({
    check: "app_settings — company.* kľúče (Firma sekcia)",
    migration: "39_admin_full_control.sql",
    ok: hasCompany,
    detail: hasCompany ? "OK" : "Chýba — Firma sekcia bude prázdna",
  });
  seedChecks.push({
    check: "app_settings — transport.* kľúče (Doprava sekcia)",
    migration: "39_admin_full_control.sql",
    ok: hasTransport,
    detail: hasTransport ? "OK" : "Chýba — Doprava sekcia bude prázdna",
  });
  seedChecks.push({
    check: "app_settings — discounts.* kľúče (Zľavy)",
    migration: "39_admin_full_control.sql",
    ok: hasDiscounts,
    detail: hasDiscounts ? "OK" : "Chýba (voliteľné)",
  });

  const missing = results.filter((r) => !r.exists);
  const missingSeeds = seedChecks.filter((s) => !s.ok);
  const cacheStale = results.filter(
    (r) => r.exists && r.error?.startsWith("cache_stale"),
  );
  const missingMigrations = Array.from(
    new Set([
      ...missing.map((r) => r.migration),
      ...missingSeeds.map((s) => s.migration),
    ]),
  ).sort();

  // Healthy = tabuľky existujú + seed OK + cache je fresh.
  // Cache stale samo o sebe NIE JE fatal — CRUD môže začať fungovať po
  // refresh, ale flagujeme aby user vedel klik-nut ešte raz reload.
  return NextResponse.json({
    ok: true,
    healthy:
      missing.length === 0 &&
      missingSeeds.length === 0 &&
      cacheStale.length === 0,
    total: results.length,
    existing: results.filter((r) => r.exists).length,
    missing: missing.length,
    missing_seeds: missingSeeds.length,
    cache_stale: cacheStale.length,
    cache_stale_tables: cacheStale.map((r) => r.table),
    missing_migrations: missingMigrations,
    tables: results,
    seed_checks: seedChecks,
    cache_stale_errors: cacheStaleErrors,
  });
}
