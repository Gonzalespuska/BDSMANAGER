import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderPrintView } from "./order-print-view";
import { PrintButton } from "./print-button";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const { id } = await params;

  const sb = createAdminClient();
  const { data: order } = await sb
    .from("material_orders")
    .select(
      "id, title, description, area_m2, supplier, items, status, created_at, created_by",
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const items = Array.isArray(order.items) ? order.items : [];

  let authorName: string | null = null;
  if (order.created_by) {
    const { data: u } = await sb
      .from("users")
      .select("name, email")
      .eq("id", order.created_by)
      .maybeSingle();
    authorName = u?.name || u?.email || null;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="print:hidden">
        <Link
          href="/admin/objednavky"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-orange-700 mb-3 px-2 py-1 rounded-md hover:bg-orange-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na zoznam
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
              <Package className="w-6 h-6 text-orange-600" aria-hidden />
              {(order.title as string) ?? "Objednávka"}
            </h1>
            {order.description && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                {order.description as string}
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
              <span>
                📅{" "}
                {new Date(order.created_at as string).toLocaleDateString("sk-SK", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {authorName && <span>👤 {authorName}</span>}
              {order.area_m2 && <span>📐 {order.area_m2} m²</span>}
              <span>🏭 {(order.supplier as string) ?? "Sika"}</span>
            </div>
          </div>
          <PrintButton />
        </div>
      </header>

      {/* PRINT VIEW — identický formát ako Excel screenshot */}
      <OrderPrintView
        title={(order.title as string) ?? ""}
        description={(order.description as string) ?? null}
        areaM2={order.area_m2 as number | null}
        supplier={(order.supplier as string) ?? "Sika"}
        items={items as Array<{
          sap_number: string;
          name: string;
          packaging: string;
          quantity: number;
        }>}
      />
    </div>
  );
}
