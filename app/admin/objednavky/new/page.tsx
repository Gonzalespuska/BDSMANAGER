import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { SIKA_PRODUCTS } from "@/lib/data/sika-products";
import { NewOrderForm } from "./new-order-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <Link
          href="/admin/objednavky"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-orange-700 mb-3 px-2 py-1 rounded-md hover:bg-orange-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na zoznam
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Package className="w-6 h-6 text-orange-600" aria-hidden />
          Nová objednávka materiálu
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vyplň názov (napr. „Byt 1 – PU systém, 84 m²"), pridaj produkty
          zo Sika katalógu (search-om), zadaj množstvá. Po uložení dostaneš
          objednávkovú tabuľku ktorá sa dá vytlačiť / poslať Sike.
        </p>
      </header>

      <NewOrderForm catalog={SIKA_PRODUCTS} />
    </div>
  );
}
