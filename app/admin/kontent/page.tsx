import { redirect } from "next/navigation";
import { Camera } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { KontentAdmin } from "./kontent-admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/kontent — edituj shotlist ktorý realizator vidí v /realizacie/[id]/kontent.
 *
 * User 2026-07-12: „ten postup a kontent si budem v admine moct editovat
 *   to co uvidi vo finale ten realizator ked stlaci to tlacidlo".
 */
export default async function KontentAdminPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const admin = createAdminClient();
  let shots: Array<Record<string, unknown>> = [];
  let dbReady = true;
  try {
    const { data, error } = await admin
      .from("content_shotlist_templates")
      .select("*")
      .order("phase", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) dbReady = false;
    shots = (data ?? []) as Array<Record<string, unknown>>;
  } catch {
    dbReady = false;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center shrink-0">
          <Camera className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">
            Kontent shotlist
          </h1>
          <p className="text-sm text-muted-foreground">
            Definuj čo majú realizatori fotiť/nakrúcať pred / počas / po
            realizácii. Ich uploady dostane marketing tím pre Instagram
            Stories, reels a denné príspevky.
          </p>
        </div>
      </header>

      {!dbReady && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="font-black text-amber-900 mb-1">
            ⚠ DB migrácia nie je spustená
          </div>
          <div className="text-sm text-amber-900">
            Spusti{" "}
            <code className="bg-amber-100 px-1 rounded">
              supabase/38_content_shotlist_templates.sql
            </code>{" "}
            v Supabase Dashboard SQL Editore.
          </div>
        </div>
      )}

      {dbReady && (
        <KontentAdmin
          initialShots={
            shots as Array<{
              id: string;
              shot_key: string;
              phase: "pred" | "pocas" | "po";
              title: string;
              description: string;
              tips: string[];
              kind: "photo" | "video";
              orientation: "portrait" | "landscape" | "any";
              duration_sec: number | null;
              required: boolean;
              floor_types: string[] | null;
              icon: string;
              sort_order: number;
              active: boolean;
            }>
          }
        />
      )}
    </div>
  );
}
