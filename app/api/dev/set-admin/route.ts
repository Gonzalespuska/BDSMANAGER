export const runtime = "edge";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { assertDevOnly } from "@/lib/dev-guard";

/**
 * GET /api/dev/set-admin?email=<email>&name=<name>
 *
 * Dev-only:
 *   1. Skontroluje že user s daným emailom existuje v public.users; ak nie,
 *      vytvorí ho (s rolou 'admin', active=true).
 *   2. Ak nemá auth_id, vytvorí Supabase auth user a nalinkuje.
 *   3. Vráti info — admin si potom klikne na /api/dev/login?email=...
 */
export async function GET(request: Request) {
  const blocked = assertDevOnly(request);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  const name = searchParams.get("name") ?? "Admin";

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "missing ?email" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // 1) Existuje public.users row?
  const { data: existing } = await sb
    .from("users")
    .select("id, email, role, active, auth_id")
    .eq("email", email)
    .maybeSingle();

  let userId = existing?.id;
  let authId = existing?.auth_id;

  // 2) Zaisti auth.users (Supabase auth)
  if (!authId) {
    // Pozri či už neexistuje
    const { data: authList } = await sb.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existingAuth = authList?.users.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (existingAuth) {
      authId = existingAuth.id;
    } else {
      const { data: created, error: createErr } =
        await sb.auth.admin.createUser({ email, email_confirm: true });
      if (createErr || !created.user) {
        return NextResponse.json(
          { ok: false, error: `auth create failed: ${createErr?.message}` },
          { status: 500 },
        );
      }
      authId = created.user.id;
    }
  }

  // 3) Upsert public.users s role=admin
  if (!existing) {
    const { data: inserted, error: insErr } = await sb
      .from("users")
      .insert({
        auth_id: authId,
        email,
        name,
        role: "admin",
        active: true,
        capacity: 5,
      })
      .select("id")
      .single();
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: `insert failed: ${insErr.message}` },
        { status: 500 },
      );
    }
    userId = inserted.id;
  } else {
    // Update — uistime sa že je admin + active + linked
    const { error: updErr } = await sb
      .from("users")
      .update({
        auth_id: authId,
        role: "admin",
        active: true,
        name,
      })
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json(
        { ok: false, error: `update failed: ${updErr.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id: userId,
    email,
    auth_id: authId,
    role: "admin",
    next: `/api/dev/login?email=${encodeURIComponent(email)}&redirectTo=/admin`,
  });
}
