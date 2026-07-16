import Link from "next/link";
import { ArrowLeft, Phone, Plus, Search } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

import { CallscriptsTable } from "./callscripts-table";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Role = "obchod" | "obhliadky";

export default async function AdminCallscriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const { role } = await searchParams;
  const activeRole: Role = role === "obhliadky" ? "obhliadky" : "obchod";
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("call_scripts")
    .select("*")
    .eq("target_role", activeRole)
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
    target_role: Role;
  }>;

  const counts = await sb
    .from("call_scripts")
    .select("target_role")
    .then((r) => {
      const map: Record<Role, number> = { obchod: 0, obhliadky: 0 };
      for (const row of r.data ?? []) {
        const tr = (row as { target_role?: string }).target_role as Role;
        if (tr === "obchod" || tr === "obhliadky") map[tr]++;
      }
      return map;
    });

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
              {activeRole === "obhliadky" ? (
                <Search className="w-6 h-6 text-violet-500" aria-hidden />
              ) : (
                <Phone className="w-6 h-6 text-rose-500" aria-hidden />
              )}
              {activeRole === "obhliadky" ? "Obhliadka scripty" : "Call scripty"}{" "}
              <span
                className={
                  "tabular-nums " +
                  (activeRole === "obhliadky"
                    ? "text-violet-500"
                    : "text-rose-500")
                }
              >
                ({scripts.length})
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              {activeRole === "obhliadky"
                ? "Postup obhliadkára priamo u klienta — čo skontrolovať, zmerať, opýtať sa a ako uzavrieť obhliadku."
                : "Scenáre telefonátu pre obchodákov — každý má tagy (typ podlahy + priestor), text + interaktívne otázky."}{" "}
              Placeholder-y{" "}
              <code className="bg-slate-100 px-1 rounded">{"{priezvisko}"}</code>{" "}
              alebo{" "}
              <code className="bg-slate-100 px-1 rounded">{"{plocha}"}</code>{" "}
              sa automaticky nahrádzajú.
            </p>
          </div>
          <Link
            href={`/admin/callscripts/new?role=${activeRole}`}
            className={
              "inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-black px-3 py-2 shadow-md " +
              (activeRole === "obhliadky"
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-rose-600 hover:bg-rose-700")
            }
          >
            <Plus className="w-4 h-4" aria-hidden />
            Nový {activeRole === "obhliadky" ? "obhliadka postup" : "call script"}
          </Link>
        </div>
      </header>

      <nav className="flex gap-2 border-b">
        <RoleTab
          href="/admin/callscripts?role=obchod"
          active={activeRole === "obchod"}
          Icon={Phone}
          label="Obchod (telefonát)"
          count={counts.obchod}
          activeCls="border-rose-500 text-rose-700"
        />
        <RoleTab
          href="/admin/callscripts?role=obhliadky"
          active={activeRole === "obhliadky"}
          Icon={Search}
          label="Obhliadka (u klienta)"
          count={counts.obhliadky}
          activeCls="border-violet-500 text-violet-700"
        />
      </nav>

      {error && (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          ⚠ {error.message}
        </div>
      )}

      <CallscriptsTable initial={scripts} role={activeRole} />
    </div>
  );
}

function RoleTab({
  href,
  active,
  Icon,
  label,
  count,
  activeCls,
}: {
  href: string;
  active: boolean;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  count: number;
  activeCls: string;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 border-b-2 -mb-px text-sm font-black transition-colors " +
        (active
          ? activeCls
          : "border-transparent text-slate-500 hover:text-slate-800")
      }
    >
      <Icon className="w-4 h-4" aria-hidden />
      {label}
      <span className="tabular-nums opacity-70">({count})</span>
    </Link>
  );
}
