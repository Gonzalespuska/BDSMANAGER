export const runtime = "edge";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/agents/list
 *
 * Vráti zoznam všetkých obchodákov (aktívnych + pauznutých) pre picker
 * v ReassignPicker modaly. Iba admin môže volať.
 */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", agents: [] },
      { status: 401 },
    );
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "admin_only", agents: [] },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  // Skús plný select s paused_until; ak stĺpec neexistuje (migrácia 41
  // neaplikovaná), fallback na základné stĺpce bez paused stavu.
  type UserRow = {
    id: string;
    name: string | null;
    email: string;
    active: boolean;
    paused_until?: string | null;
  };
  let users: UserRow[] = [];
  {
    const { data, error } = await admin
      .from("users")
      .select("id, name, email, active, paused_until")
      .eq("role", "obchod")
      .order("name", { ascending: true });
    if (error) {
      const { data: fallback, error: err2 } = await admin
        .from("users")
        .select("id, name, email, active")
        .eq("role", "obchod")
        .order("name", { ascending: true });
      if (err2) {
        return NextResponse.json(
          { ok: false, error: err2.message, agents: [] },
          { status: 500 },
        );
      }
      users = (fallback ?? []) as unknown as UserRow[];
    } else {
      users = (data ?? []) as unknown as UserRow[];
    }
  }

  const nowIso = new Date().toISOString();
  const agents = users.map((u) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    active: !!u.active,
    paused: !!u.paused_until && u.paused_until > nowIso,
  }));

  return NextResponse.json({ ok: true, agents });
}
