export const runtime = "edge";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/dev/set-user?email=<email>&name=<name>&role=<user|admin>
 *
 * Dev-only: vytvorí/aktualizuje usera + Supabase auth.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled in production", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  const name = searchParams.get("name") ?? "Agent";
  const role = searchParams.get("role") === "admin" ? "admin" : "user";

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

  let authId = existing?.auth_id ?? null;

  // 2) Zaisti auth.users
  if (!authId) {
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

  // 3) Upsert public.users
  if (!existing) {
    const { data: inserted, error: insErr } = await sb
      .from("users")
      .insert({
        auth_id: authId,
        email,
        name,
        role,
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
    return NextResponse.json({
      ok: true,
      action: "created",
      id: inserted.id,
      email,
      role,
    });
  }

  const { error: updErr } = await sb
    .from("users")
    .update({
      auth_id: authId,
      role,
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

  return NextResponse.json({
    ok: true,
    action: "updated",
    id: existing.id,
    email,
    role,
  });
}
