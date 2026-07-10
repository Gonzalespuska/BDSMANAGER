import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Package,
  Plus,
  Warehouse,
} from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SkladClient } from "./sklad-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/sklad — skladové zásoby materiálu.
 *
 * Admin vidí:
 *   • Zoznam všetkých položiek na sklade
 *   • Filter (brand, hľadanie), sort
 *   • Alert na položky pod min_alert_qty (farbne)
 *   • Button "+ Pridať materiál" — modal s ručným zadaním alebo PDF drag&drop
 *   • Audit log posledných pohybov
 *
 * Realizátor NEVIDÍ túto stránku ale môže čítať cez API (pri vytváraní tlačiva).
 */
export default async function SkladPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sb = createAdminClient();

  let stock: Array<Record<string, unknown>> = [];
  let recentMovements: Array<Record<string, unknown>> = [];
  let migrationMissing = false;

  try {
    const [{ data: stockData, error: stockErr }, { data: movsData }] =
      await Promise.all([
        sb
          .from("inventory_stock")
          .select(
            "id, sap_number, product_name, brand, package_size_kg, package_unit, quantity_packages, min_alert_qty, location, notes, updated_at",
          )
          .order("brand")
          .order("product_name"),
        sb
          .from("inventory_movements")
          .select(
            "id, product_name, brand, package_size_kg, package_unit, delta, reason, notes, created_at, actor:actor_id(name)",
          )
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
    if (stockErr) {
      migrationMissing = true;
    } else {
      stock = stockData ?? [];
      recentMovements = movsData ?? [];
    }
  } catch {
    migrationMissing = true;
  }

  const totalItems = stock.length;
  const alertItems = stock.filter(
    (s) =>
      typeof s.quantity_packages === "number" &&
      typeof s.min_alert_qty === "number" &&
      s.quantity_packages <= s.min_alert_qty,
  ).length;

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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
              <Warehouse className="w-6 h-6 text-amber-600" aria-hidden />
              Skladové zásoby
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aktuálny stav materiálu. Realizátor pri tlači tlačiva sa
              automaticky odpočíta zo skladu.
            </p>
          </div>
        </div>
      </header>

      {/* Migračná chybová hláška */}
      {migrationMissing && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠️ SQL migrácia{" "}
          <code className="font-mono font-bold">28_inventory.sql</code> ešte
          nebola spustená v Supabase. Otvor{" "}
          <a
            href="https://supabase.com/dashboard/project/wzcehdynanuuzztfrqyi/sql/new"
            target="_blank"
            rel="noreferrer"
            className="underline font-bold"
          >
            SQL Editor
          </a>{" "}
          a spusti obsah súboru{" "}
          <code className="font-mono font-bold">
            supabase/28_inventory.sql
          </code>
          . Potom refreshni túto stránku.
        </div>
      )}

      {!migrationMissing && (
        <>
          {/* Prehľad KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              icon={<Package className="w-5 h-5" />}
              label="Rôzne položky"
              value={String(totalItems)}
              tint="sky"
            />
            <StatCard
              icon={<Package className="w-5 h-5" />}
              label="Balenia spolu"
              value={String(
                stock.reduce(
                  (s, r) =>
                    s +
                    (typeof r.quantity_packages === "number"
                      ? r.quantity_packages
                      : 0),
                  0,
                ),
              )}
              tint="emerald"
            />
            <StatCard
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Pod alert (nízky stav)"
              value={String(alertItems)}
              tint={alertItems > 0 ? "rose" : "slate"}
            />
          </div>

          <SkladClient
            initialStock={stock as never}
            initialMovements={recentMovements as never}
          />
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: "sky" | "emerald" | "rose" | "slate";
}) {
  const c = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-300 bg-rose-50 text-rose-800",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tint];
  return (
    <div className={`rounded-xl border-2 p-4 ${c}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-black tabular-nums mt-1">{value}</div>
    </div>
  );
}
