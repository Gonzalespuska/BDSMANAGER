import Link from "next/link";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { PodkladyTable } from "./podklady-table";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AdminPodkladyPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();
  const { data } = await sb
    .from("training_docs")
    .select("*")
    .order("sort_order", { ascending: true });

  const docs = (data ?? []) as Array<{
    id: string;
    title: string;
    body_md: string;
    target_role: "obchod" | "obhliadky" | "realizacie" | "admin" | "vsetci";
    category: string;
    sort_order: number;
    active: boolean;
    created_at: string;
  }>;

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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-violet-500" aria-hidden />
              Podklady{" "}
              <span className="text-violet-500 tabular-nums">({docs.length})</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              General knowledge base — sales tips, obhliadka protokoly, product
              info, cenníky, atď. Priraď dokument k role (obchod / obhliadky /
              realizacie / vsetci) a člen tímu ho uvidí v svojej sekcii Podklady.
              Text podporuje jednoduchý Markdown (nadpisy, zoznamy, tučný text).
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
      </header>

      <PodkladyTable initial={docs} />

      <div className="text-xs text-muted-foreground pt-4 border-t">
        <strong>Rozdiel oproti iným moduulom:</strong> Call scripty (interaktívne
        scenáre) sú v samostatnom module{" "}
        <Link href="/admin/callscripts" className="text-sky-700 hover:underline">
          /admin/callscripts
        </Link>
        . Realizačné systémy (postup krokov) v{" "}
        <Link href="/admin/systems" className="text-sky-700 hover:underline">
          /admin/systems
        </Link>
        . Kontent (foto/video shotlist) v{" "}
        <Link href="/admin/kontent" className="text-sky-700 hover:underline">
          /admin/kontent
        </Link>
        . Tu ide o ostatné voľné podklady.
      </div>
    </div>
  );
}
