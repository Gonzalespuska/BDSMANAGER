export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * /api/admin/contacts — CRUD nad tabuľkou public.contacts.
 * Iba admin.
 */

async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me) {
    return {
      error: NextResponse.json(
        { ok: false, error: "unauthenticated" },
        { status: 401 },
      ),
    };
  }
  if (me.role !== "admin") {
    return {
      error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    };
  }
  return { user: me };
}

// LIST — vráti všetky kontakty (zoradené podľa mena)
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("contacts")
    .select("*")
    .order("company", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contacts: data ?? [] });
}

// CREATE
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: {
    name?: string;
    company?: string | null;
    role?: string | null;
    category?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name || name.length > 200) {
    return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("contacts")
    .insert({
      name,
      company: body.company?.trim() || null,
      role: body.role?.trim() || null,
      category: body.category?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: auth.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contact: data });
}

// PATCH — čiastočný update
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: {
    id?: string;
    name?: string;
    company?: string | null;
    role?: string | null;
    category?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n || n.length > 200) {
      return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
    }
    patch.name = n;
  }
  for (const field of ["company", "role", "category", "phone", "email", "notes"] as const) {
    if (field in body) {
      const v = body[field];
      patch[field] = typeof v === "string" ? v.trim() || null : null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("contacts")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contact: data });
}

// DELETE
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }
  const sb = createAdminClient();
  const { error } = await sb.from("contacts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
