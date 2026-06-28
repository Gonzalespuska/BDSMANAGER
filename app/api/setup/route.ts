export const runtime = "edge";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

// runtime = "edge" disabled — @supabase/supabase-js admin fetch fails in Next edge dev

/**
 * GET /api/setup
 *
 * One-time bootstrap endpoint:
 *   1. Skontroluje že žiadny admin v public.users zatiaľ nie je
 *   2. Vytvorí auth.users záznam pre BOOTSTRAP_ADMIN_EMAIL (bez hesla,
 *      auto-confirmed — login bude cez email OTP)
 *   3. Vloží/upsertne riadok do public.users s rolou 'admin'
 *
 * Idempotentné: ak admin už existuje, vráti current state bez zmeny.
 *
 * Bezpečnosť: ak by sa endpoint dostal k attackerovi v produkcii s ne-pridelenou
 * admin tabuľkou, vytvoril by si ADMIN s vlastným emailom. Ale potrebuje
 * SUPABASE_SECRET_KEY čo je server-only. V production by sa to malo skryť za
 * env-flag alebo zmazať po prvom použití. Pre dev je to OK.
 */
export async function GET(request: Request) {
  // GUARD: v produkcii sa /api/setup môže spustiť IBA s tajným tokenom.
  // Bez tokenu (alebo nesprávny) → 403, žiadny info leak.
  // Token sa nastavuje cez SETUP_TOKEN env var v CF Pages.
  if (process.env.NODE_ENV === "production") {
    const setupToken = process.env.SETUP_TOKEN;
    const providedToken = new URL(request.url).searchParams.get("token");
    if (!setupToken || providedToken !== setupToken) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 },
      );
    }
  }

  const bootstrapEmail = (
    process.env.BOOTSTRAP_ADMIN_EMAIL ?? ""
  )
    .trim()
    .toLowerCase();
  const bootstrapName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Admin";

  if (!bootstrapEmail) {
    return NextResponse.json(
      { ok: false, error: "BOOTSTRAP_ADMIN_EMAIL is not set in env" },
      { status: 500 },
    );
  }

  const admin = createAdminClient();

  // 1) Skontroluj či už admin existuje
  const { data: existingAdmin } = await admin
    .from("users")
    .select("id, email, role")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (existingAdmin) {
    return NextResponse.json({
      ok: true,
      status: "already_exists",
      message: `Admin už existuje: ${existingAdmin.email}`,
      admin: existingAdmin,
    });
  }

  // 2) Skontroluj či existuje auth.users záznam — ak nie, vytvor
  const { data: authList, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    return NextResponse.json(
      { ok: false, error: `listUsers failed: ${listError.message}` },
      { status: 500 },
    );
  }

  let authUser = authList.users.find(
    (u) => u.email?.toLowerCase() === bootstrapEmail,
  );

  if (!authUser) {
    const { data: createData, error: createError } =
      await admin.auth.admin.createUser({
        email: bootstrapEmail,
        email_confirm: true, // bez hesla, auto-confirmed
      });
    if (createError || !createData.user) {
      return NextResponse.json(
        {
          ok: false,
          error: `createUser failed: ${createError?.message ?? "unknown"}`,
        },
        { status: 500 },
      );
    }
    authUser = createData.user;
  }

  // 3) Upsert public.users
  const { data: appUser, error: upsertError } = await admin
    .from("users")
    .upsert(
      {
        auth_id: authUser.id,
        email: bootstrapEmail,
        name: bootstrapName,
        role: "admin",
        active: true,
      },
      { onConflict: "email" },
    )
    .select("id, email, name, role, active")
    .single();

  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: `users upsert failed: ${upsertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "created",
    message: `✓ Admin vytvorený. Prihlás sa na /login s emailom ${bootstrapEmail}. Pošleme ti 6-cifr kód.`,
    admin: appUser,
  });
}
