export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/reload-postgrest
 *
 * Pošle `NOTIFY pgrst, 'reload schema'` do Postgresu. PostgREST toto
 * počúva a vynúti refresh schema cache — po nej sa nové tabuľky
 * (napr. realization_teams po migrácii 33) stanú dostupnými cez REST.
 *
 * Problém ktorý rieši: user spustí SQL migráciu → tabuľka existuje v
 * Postgrese, ale PostgREST cache je stale → CRUD API vrátia
 * „Could not find the table 'public.XXX' in the schema cache".
 *
 * User 2026-07-12: banner „Realizačné tímy neexistuje" napriek tomu, že
 * migrácia 33 bola spustená a health check hovorí OK. Root cause = tento.
 */
export async function POST() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Pokusíme sa cez rpc — ak Supabase má vytvorenú funkciu pgrst_reload().
  // Ak nemá (default), padne s "function does not exist" a povieme
  // userovi aby si to spustil v SQL editore.
  try {
    const { error } = await admin.rpc("pgrst_reload");
    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        manual_fix:
          "V Supabase SQL editore spusti: NOTIFY pgrst, 'reload schema'; alebo v Supabase dashboard: Settings → Database → Restart PostgREST.",
      });
    }
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      manual_fix:
        "V Supabase SQL editore spusti: NOTIFY pgrst, 'reload schema'; alebo v Supabase dashboard: Settings → Database → Restart PostgREST.",
    });
  }

  return NextResponse.json({
    ok: true,
    message: "PostgREST schema reload signal odoslaný. Cache sa refreshne do 1s.",
  });
}
