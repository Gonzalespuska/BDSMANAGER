import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATERIALS } from "@/lib/data/materials";
import { SettingsClient } from "./settings-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/settings — admin ovládanie celého CRM bez potreby claude:
 *   - Materiály (cenník generátora ponúk) — search + inline edit price
 *   - Globálne (marže, doprava, DPH, min. zákazka)
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ok?: string; err?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sp = await searchParams;

  const sb = createAdminClient();

  // Overrides + settings — try/catch pre prípad že SQL 22 ešte nebežala
  let overrides: Array<Record<string, unknown>> = [];
  let settings: Array<Record<string, unknown>> = [];
  let migrationMissing = false;
  try {
    const [r1, r2] = await Promise.all([
      sb.from("material_overrides").select("material_id, price_per_sqm, price_per_unit, price_per_sqm_per_mm, updated_at"),
      sb.from("app_settings").select("key, value, label, description, updated_at").order("key"),
    ]);
    if (r1.error || r2.error) {
      migrationMissing = true;
    } else {
      overrides = r1.data ?? [];
      settings = r2.data ?? [];
    }
  } catch {
    migrationMissing = true;
  }

  const overrideMap = new Map<
    string,
    {
      price_per_sqm: number | null;
      price_per_unit: number | null;
      price_per_sqm_per_mm: number | null;
      updated_at: string;
    }
  >();
  for (const o of overrides ?? []) {
    overrideMap.set(o.material_id as string, {
      price_per_sqm: (o.price_per_sqm as number | null) ?? null,
      price_per_unit: (o.price_per_unit as number | null) ?? null,
      price_per_sqm_per_mm: (o.price_per_sqm_per_mm as number | null) ?? null,
      updated_at: o.updated_at as string,
    });
  }

  // Materials with overrides applied
  const materialsView = MATERIALS.map((m) => {
    const ov = overrideMap.get(m.id);
    return {
      id: m.id,
      floor_type: m.floor_type,
      name: m.name,
      unit: m.unit,
      variant: m.variant ?? null,
      optional: m.optional,
      hidden_in_pdf: m.hidden_in_pdf ?? false,
      requires_custom_label: m.requires_label ?? false,
      // Original prices from hardcoded MATERIALS
      original_price_per_sqm: m.price_per_sqm,
      original_price_per_unit: m.price_per_unit ?? null,
      original_price_per_sqm_per_mm: m.price_per_sqm_per_mm ?? null,
      // Effective (override if set, else original)
      effective_price_per_sqm: ov?.price_per_sqm ?? m.price_per_sqm,
      effective_price_per_unit: ov?.price_per_unit ?? m.price_per_unit ?? null,
      effective_price_per_sqm_per_mm:
        ov?.price_per_sqm_per_mm ?? m.price_per_sqm_per_mm ?? null,
      is_overridden:
        !!ov &&
        (ov.price_per_sqm !== null ||
          ov.price_per_unit !== null ||
          ov.price_per_sqm_per_mm !== null),
      override_updated_at: ov?.updated_at ?? null,
      unit_label: m.unit_label ?? null,
    };
  });

  const tab = sp.tab ?? "materials";
  const success = sp.ok === "1";
  const errorMsg = sp.err;

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-slate-600" aria-hidden />
          Nastavenia
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Materiály & cenník generátora, marže, DPH, doprava. Zmeny sa okamžite
          prejavia v generátore ponúk pre obchodákov.
        </p>
      </header>

      {success && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✅ Uložené.
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          ❌ {errorMsg}
        </div>
      )}
      {migrationMissing && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ SQL migrácia <code className="font-mono font-bold">22_settings_and_materials.sql</code>{" "}
          ešte nebola spustená v Supabase. Zoznam materiálov beží
          z hardcoded fallback (bez uloženia zmien do DB). Pusti SQL v{" "}
          <a
            href="https://supabase.com/dashboard/project/wzcehdynanuuzztfrqyi/sql/new"
            target="_blank"
            rel="noreferrer"
            className="underline font-bold"
          >
            SQL Editore
          </a>
          .
        </div>
      )}

      <SettingsClient
        activeTab={tab}
        materials={materialsView}
        settings={
          (settings ?? []).map((s) => ({
            key: s.key as string,
            value: s.value,
            label: ((s.label as string | null) ?? (s.key as string)) as string,
            description: (s.description as string | null) ?? null,
            updated_at: s.updated_at as string,
          }))
        }
      />
    </div>
  );
}
