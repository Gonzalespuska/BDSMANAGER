import Link from "next/link";
import { ArrowLeft, Palette } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { CennikMaterialovClient, type MaterialExtra } from "./cennik-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function CennikMaterialovPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();
  const [settingsRes, extrasRes] = await Promise.all([
    sb.from("app_settings").select("key, value").like("key", "material.%"),
    sb.from("material_extras").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <Link
          href="/admin/nastavenia"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 dark:hover:bg-sky-950/40 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Nastavenia CRM
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Palette className="w-6 h-6 text-violet-500" aria-hidden />
          Cenník materiálov (Generátor CP)
        </h1>
      </header>

      <CennikMaterialovClient
        settings={(settingsRes.data ?? []) as Array<{ key: string; value: unknown }>}
        initialExtras={(extrasRes.data ?? []) as MaterialExtra[]}
      />
    </div>
  );
}
