import Link from "next/link";
import { ArrowLeft, Hammer, Palette, Settings2 } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { GeneratorNastaveniaClient } from "./client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function GeneratorNastaveniaPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();
  const [systemsRes, settingsRes] = await Promise.all([
    sb
      .from("realization_systems")
      .select("code, label, floor_type, binder, active")
      .eq("active", true)
      .order("floor_type")
      .order("code"),
    sb
      .from("app_settings")
      .select("key, value")
      .or(
        "key.like.generator.%,key.like.margin.%,key.like.markup.%",
      ),
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
          <Settings2 className="w-6 h-6 text-sky-500" aria-hidden />
          Nastavenia Generátora CP
        </h1>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickTile
          href="/admin/cennik-materialov"
          title="Cenník materiálov"
          desc="Predaj / náklad / spotreba pre 18 operácií + extras"
          Icon={Palette}
          tint="violet"
        />
        <QuickTile
          href="/admin/systems"
          title="Realizačné systémy"
          desc="Sikafloor / TopStopne balenia + ceny (nákupné) per systém"
          Icon={Hammer}
          tint="emerald"
        />
      </section>

      <GeneratorNastaveniaClient
        systems={(systemsRes.data ?? []) as Array<{
          code: string;
          label: string;
          floor_type: string;
          binder: string | null;
        }>}
        settings={(settingsRes.data ?? []) as Array<{ key: string; value: unknown }>}
      />
    </div>
  );
}

function QuickTile({
  href,
  title,
  desc,
  Icon,
  tint,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tint: "violet" | "emerald";
}) {
  const tintMap = {
    violet:
      "border-violet-300 hover:border-violet-500 bg-violet-50/40 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300",
    emerald:
      "border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300",
  } as const;
  return (
    <Link
      href={href}
      className={
        "block rounded-xl border-2 p-3 transition-colors " + tintMap[tint]
      }
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" aria-hidden />
        <div className="font-black tracking-tight flex-1">{title}</div>
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5">
        {desc}
      </div>
    </Link>
  );
}
