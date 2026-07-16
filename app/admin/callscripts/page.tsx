import Link from "next/link";
import { ArrowLeft, Phone, Plus } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { CallscriptsTable } from "./callscripts-table";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AdminCallscriptsPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("call_scripts")
    .select("*")
    .order("sort_order", { ascending: true });

  const scripts = (data ?? []) as Array<{
    id: string;
    label: string;
    description: string | null;
    floor_type: string | null;
    space: string | null;
    body: string;
    steps: Array<Record<string, unknown>> | null;
    sort_order: number;
    active: boolean;
    created_at: string;
    updated_at: string | null;
  }>;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/podklady"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na Podklady
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
              <Phone className="w-6 h-6 text-rose-500" aria-hidden />
              Call scripty{" "}
              <span className="tabular-nums text-rose-500">
                ({scripts.length})
              </span>
            </h1>
          </div>
          <Link
            href="/admin/callscripts/new"
            className="inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-black px-3 py-2 shadow-md bg-rose-600 hover:bg-rose-700"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Nový call script
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          ⚠ {error.message}
        </div>
      )}

      <CallscriptsTable initial={scripts} />
    </div>
  );
}
