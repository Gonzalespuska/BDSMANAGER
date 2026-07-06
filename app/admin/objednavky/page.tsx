import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Plus } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "🚧 Rozpracovaná", className: "bg-amber-100 text-amber-800" },
  sent: { label: "📤 Odoslaná Sika", className: "bg-sky-100 text-sky-800" },
  delivered: { label: "✅ Dodaná", className: "bg-emerald-100 text-emerald-800" },
  archived: { label: "📦 Archív", className: "bg-slate-100 text-slate-700" },
};

export default async function ObjednavkyListPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sp = await searchParams;

  const sb = createAdminClient();
  // Fault-tolerant: ak SQL 23 ešte nebežala, ukáž warning namiesto crashu
  let orders: Array<Record<string, unknown>> = [];
  let migrationMissing = false;
  {
    const r = await sb
      .from("material_orders")
      .select("id, title, description, area_m2, supplier, items, status, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(200);
    if (r.error) {
      migrationMissing = true;
    } else {
      orders = r.data ?? [];
    }
  }

  const userIds = Array.from(new Set((orders ?? []).map((o) => o.created_by).filter((x): x is string => !!x)));
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await sb.from("users").select("id, name, email").in("id", userIds);
    for (const u of users ?? []) userMap.set(u.id, u.name || u.email);
  }

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
              <Package className="w-6 h-6 text-orange-600" aria-hidden />
              Objednávky materiálu
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Objednávkové tabuľky pre Siku / Topstone. Vyplň produkty + množstvá,
              vygeneruje ti to formát pre dodávateľa (SAP # + názov + balenie + ks).
            </p>
          </div>
          <Link
            href="/admin/objednavky/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 text-sm font-bold transition-colors shadow"
          >
            <Plus className="w-4 h-4" />
            Nová objednávka
          </Link>
        </div>
      </header>

      {sp.err && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          ❌ {sp.err}
        </div>
      )}
      {migrationMissing && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ SQL migrácia <code className="font-mono font-bold">23_material_orders.sql</code>{" "}
          ešte nebola spustená v Supabase. Sekcia zatiaľ nemá kam ukladať.
          Spusti SQL v{" "}
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

      {!orders || orders.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-10 text-center">
          <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            Zatiaľ žiadna objednávka. Vytvor prvú:
          </p>
          <Link
            href="/admin/objednavky/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Nová objednávka
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border-2 bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                <th className="text-left px-3 py-2">Dátum</th>
                <th className="text-left px-3 py-2">Objednávka</th>
                <th className="text-right px-3 py-2">m²</th>
                <th className="text-right px-3 py-2">Položiek</th>
                <th className="text-left px-3 py-2">Dodávateľ</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Vytvoril</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => {
                const items = Array.isArray(o.items) ? o.items : [];
                const meta = STATUS_META[o.status as string] ?? STATUS_META.draft;
                const author = o.created_by ? userMap.get(o.created_by as string) : null;
                return (
                  <tr key={o.id as string} className="hover:bg-orange-50/40">
                    <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(o.created_at as string).toLocaleDateString("sk-SK", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/objednavky/${o.id}`}
                        className="font-bold text-orange-800 hover:underline decoration-dotted"
                      >
                        {(o.title as string) ?? "—"}
                      </Link>
                      {(o.description as string | null) ? (
                        <div className="text-[11px] text-muted-foreground truncate max-w-[400px] mt-0.5">
                          {o.description as string}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {o.area_m2 ? `${o.area_m2}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {items.length}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {(o.supplier as string) ?? "Sika"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {author ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
