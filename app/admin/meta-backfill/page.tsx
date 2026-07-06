import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { MetaBackfillClient } from "./meta-backfill-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function MetaBackfillPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Download className="w-6 h-6 text-blue-600" aria-hidden />
          Meta backfill — importuj historické leady
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Meta uchováva všetky lead ID na svojej strane. Náš webhook začal
          chodiť až dnes, takže historické leady tu chýbajú. Sem paste
          <strong> leadgen_id</strong> zo Sheets (stĺpec A, hodnoty typu{" "}
          <code className="text-[11px]">l:891026250611462</code>) — batch po 500.
        </p>
      </header>

      <MetaBackfillClient />
    </div>
  );
}
