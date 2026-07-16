import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  FileText,
  Hammer,
  Phone,
  Plus,
  Search,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { PodkladyTable } from "./podklady-table";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AdminPodkladyPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();

  const [docsRes, csObchodRes, csObhliadkyRes, systemsRes, kontentRes] =
    await Promise.all([
      sb.from("training_docs").select("*").order("sort_order", { ascending: true }),
      sb
        .from("call_scripts")
        .select("id", { count: "exact", head: true })
        .eq("target_role", "obchod"),
      sb
        .from("call_scripts")
        .select("id", { count: "exact", head: true })
        .eq("target_role", "obhliadky"),
      sb
        .from("realization_systems")
        .select("id", { count: "exact", head: true }),
      sb
        .from("content_shotlist_templates")
        .select("id", { count: "exact", head: true }),
    ]);

  const docs = (docsRes.data ?? []) as Array<{
    id: string;
    title: string;
    body_md: string;
    target_role: "obchod" | "obhliadky" | "realizacie" | "admin" | "vsetci";
    category: string;
    sort_order: number;
    active: boolean;
    created_at: string;
  }>;

  const csObchodCount = csObchodRes.count ?? 0;
  const csObhliadkyCount = csObhliadkyRes.count ?? 0;
  const systemsCount = systemsRes.count ?? 0;
  const kontentCount = kontentRes.count ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/nastavenia"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 dark:hover:bg-sky-950/40 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Nastavenia CRM
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-violet-500" aria-hidden />
          Podklady
        </h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Všetky materiály pre tím na jednom mieste — Call scripty, Realizačné
          systémy, Kontent shotlist a voľné podklady (sales tips, protokoly,
          cenníky). Rozdeľujú sa podľa role.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SubTile
          href="/admin/callscripts?role=obchod"
          title="Call scripty — obchod"
          count={csObchodCount}
          desc="Telefonáty pre obchodákov — placeholdery ({priezvisko}, {plocha}…), interaktívne otázky, uzavretie leadu."
          Icon={Phone}
          tint="sky"
        />
        <SubTile
          href="/admin/callscripts?role=obhliadky"
          title="Obhliadka scripty"
          count={csObhliadkyCount}
          desc="Postup obhliadkára u klienta — čo skontrolovať, zmerať, opýtať, ako uzavrieť. Placeholdery rovnaké."
          Icon={Search}
          tint="violet"
        />
        <SubTile
          href="/admin/systems"
          title="Realizačné systémy"
          count={systemsCount}
          desc="264, 3000, TopStone… + spotreba kg/m² + postup krokov pre realizátorov."
          Icon={Hammer}
          tint="emerald"
        />
        <SubTile
          href="/admin/kontent"
          title="Kontent shotlist"
          count={kontentCount}
          desc="Čo majú realizatori fotiť/nakrúcať pred/počas/po realizácii."
          Icon={Camera}
          tint="fuchsia"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap border-t pt-5">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight inline-flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-500" aria-hidden />
              Voľné podklady{" "}
              <span className="text-violet-500 tabular-nums text-base">
                ({docs.length})
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-2xl">
              Markdown dokumenty — sales tips, obhliadka protokoly, product info,
              cenníky. Priraď k role (obchod / obhliadky / realizacie / vsetci) →
              člen tímu to uvidí vo svojej sekcii Podklady.
            </p>
          </div>
          <Link
            href="/admin/podklady/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-black px-3 py-2 shadow-md"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Nový podklad
          </Link>
        </div>

        <PodkladyTable initial={docs} />
      </section>
    </div>
  );
}

function SubTile({
  href,
  title,
  count,
  desc,
  Icon,
  tint,
}: {
  href: string;
  title: string;
  count: number;
  desc: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tint: "sky" | "emerald" | "fuchsia" | "violet";
}) {
  const tintMap = {
    sky: "border-sky-300 hover:border-sky-500 bg-sky-50/40 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300",
    emerald:
      "border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300",
    fuchsia:
      "border-fuchsia-300 hover:border-fuchsia-500 bg-fuchsia-50/40 dark:bg-fuchsia-950/20 text-fuchsia-700 dark:text-fuchsia-300",
    violet:
      "border-violet-300 hover:border-violet-500 bg-violet-50/40 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300",
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
        <span className="text-xs font-black tabular-nums opacity-70">
          {count}
        </span>
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5">
        {desc}
      </div>
    </Link>
  );
}
