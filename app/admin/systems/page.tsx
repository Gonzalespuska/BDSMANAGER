import { redirect } from "next/navigation";
import { Hammer, Package } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { SystemsAdmin } from "./systems-admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/systems — admin definuje realizačné systémy + ich komponenty +
 * postup krokov.
 *
 * User 2026-07-11:
 *   "tento system sa bude dat definovat aj v admine budu mat pomenovanie
 *    napr. 264 a tam bude penetrak, finalny nater, popripade lak ak tak
 *    ide a vyplnim tam spotrebu a na zaklade toho bude urcovat kolko
 *    sudov potreubjem podla m2 … admin musi mat moznost tieto postupy
 *    taktiez upravovat".
 */
export default async function SystemsAdminPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const admin = createAdminClient();
  let systemsRaw: Array<Record<string, unknown>> = [];
  let productsRaw: Array<Record<string, unknown>> = [];
  let dbReady = true;
  try {
    const [{ data: s, error: sErr }, { data: p, error: pErr }] =
      await Promise.all([
        admin
          .from("realization_systems")
          .select("*")
          .order("sort_order", { ascending: true }),
        admin
          .from("realization_system_products")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);
    if (sErr || pErr) dbReady = false;
    systemsRaw = (s ?? []) as Array<Record<string, unknown>>;
    productsRaw = (p ?? []) as Array<Record<string, unknown>>;
  } catch {
    dbReady = false;
  }

  const bySystem = new Map<string, Array<Record<string, unknown>>>();
  for (const p of productsRaw) {
    const id = p.system_id as string;
    if (!bySystem.has(id)) bySystem.set(id, []);
    bySystem.get(id)!.push(p);
  }
  const systems = systemsRaw.map((s) => ({
    ...s,
    products: bySystem.get(s.id as string) ?? [],
  }));

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <Hammer className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">
            Realizačné systémy
          </h1>
        </div>
      </header>

      {!dbReady && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="font-black text-amber-900 mb-1">
            ⚠ DB migrácia nie je spustená
          </div>
          <div className="text-sm text-amber-900">
            Spusti <code className="bg-amber-100 px-1 rounded">supabase/30_realization_systems.sql</code>{" "}
            a{" "}
            <code className="bg-amber-100 px-1 rounded">
              supabase/31_call_scripts_and_procedures.sql
            </code>{" "}
            v Supabase Dashboard SQL Editore. Bez toho sa tu nedá nič ukladať.
          </div>
        </div>
      )}

      {dbReady && (
        <SystemsAdmin
          initialSystems={
            systems as Array<{
              id: string;
              code: string;
              label: string;
              description: string | null;
              floor_type: string;
              binder: string | null;
              sort_order: number;
              active: boolean;
              procedure_steps: unknown;
              products: Array<{
                id: string;
                product_role: string;
                sku: string;
                label: string;
                consumption_per_m2: number;
                unit_size_kg: number;
                unit_label: string;
                sort_order: number;
              }>;
            }>
          }
        />
      )}

      {dbReady && systems.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-center">
          <Package className="w-12 h-12 mx-auto text-slate-400 mb-2" />
          <div className="font-black text-slate-700">Zatiaľ žiadne systémy</div>
          <div className="text-sm text-slate-500 mt-1">
            Klikni „+ Nový systém" hore a nastav prvý (napr. 264).
          </div>
        </div>
      )}
    </div>
  );
}
