export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneIntl } from "@/lib/phone-format";

/**
 * POST /api/admin/agent-create
 *
 * Náhrada za `createAgentAction` server action. REST je spoľahlivejší
 * na CF Pages Edge než server actions.
 *
 * Body: { name, email, phone, role, secondary_roles?, capacity? }
 * Response: { ok: true, id: string } alebo { ok: false, error }
 */
const ROLES = ["admin", "obchod", "obhliadky", "realizacie", "office"] as const;

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentAppUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    if (me.role !== "admin") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    let body: {
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      secondary_roles?: string[];
      capacity?: number;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() ? formatPhoneIntl(body.phone.trim()) : null;
    const role = body.role;
    if (!name || !email || !role) {
      return NextResponse.json(
        { ok: false, error: "missing_fields (name/email/role)" },
        { status: 400 },
      );
    }
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Skús či user s týmto emailom už existuje
    const { data: existing } = await admin
      .from("users")
      .select("id, name, role, active")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: `User ${email} už existuje (${existing.name ?? "?"}, rola ${existing.role}, ${existing.active ? "aktívny" : "neaktívny"}). Otvor v /admin/agents.`,
        },
        { status: 409 },
      );
    }

    // Vytvor auth account (magic link login)
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (authErr || !authUser?.user) {
      return NextResponse.json(
        { ok: false, error: `Auth: ${authErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    // Filtruj sekundárne role
    const secondary: string[] = [];
    if (body.secondary_roles) {
      const seen: Record<string, boolean> = {};
      for (const r of body.secondary_roles) {
        if (!ROLES.includes(r as (typeof ROLES)[number])) continue;
        if (r === role) continue;
        if (seen[r]) continue;
        seen[r] = true;
        secondary.push(r);
      }
    }

    // Vytvor DB row
    const insertPayload: Record<string, unknown> = {
      auth_id: authUser.user.id,
      email,
      name,
      role,
      phone,
      capacity: body.capacity ?? 5,
      active: true,
    };
    if (secondary.length > 0) insertPayload.secondary_roles = secondary;

    const { data: created, error: insertErr } = await admin
      .from("users")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insertErr) {
      // Cleanup — rollback auth create
      try {
        await admin.auth.admin.deleteUser(authUser.user.id);
      } catch {
        /* silent */
      }
      // Ak secondary_roles column neexistuje, retry bez neho
      if (
        /secondary_roles.*column|column.*secondary_roles/i.test(insertErr.message) &&
        insertPayload.secondary_roles
      ) {
        delete insertPayload.secondary_roles;
        const retry = await admin
          .from("users")
          .insert(insertPayload)
          .select("id")
          .single();
        if (retry.error) {
          return NextResponse.json(
            { ok: false, error: `DB retry: ${retry.error.message}` },
            { status: 500 },
          );
        }
        return NextResponse.json({ ok: true, id: retry.data.id as string });
      }
      return NextResponse.json(
        { ok: false, error: `DB: ${insertErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, id: created.id as string });
  } catch (e) {
    console.error("[agent-create] unhandled:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
