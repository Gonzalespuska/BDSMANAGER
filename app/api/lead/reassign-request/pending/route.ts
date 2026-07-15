export const runtime = "edge";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/lead/reassign-request/pending
 *
 * Vráti PENDING žiadosti kde JA musím odpovedať:
 *   • kind = 'push' AND to_user_id = me    → niekto mi ponúka lead (dar)
 *   • kind = 'pull' AND from_user_id = me  → niekto prosí o môj lead
 *
 * Formát: pridá `kind` + `direction` (in/out) pre UI ktoré tint-uje
 * karty inou farbou (push=zelený dar, pull=amber prosba).
 */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", items: [] },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  // Try s kind column; ak neexistuje (migrácia 44 neaplikovaná),
  // fallback na starý select bez kind (všetko sa berie ako 'push').
  let rows: Array<{
    id: string;
    lead_id: string;
    requested_by: string;
    from_user_id: string | null;
    to_user_id: string;
    reason: string | null;
    created_at: string;
    kind: "push" | "pull";
  }> = [];
  {
    const { data, error } = await admin
      .from("lead_reassign_requests")
      .select(
        "id, lead_id, requested_by, from_user_id, to_user_id, reason, created_at, kind",
      )
      .eq("status", "pending")
      .or(
        `and(kind.eq.push,to_user_id.eq.${user.id}),and(kind.eq.pull,from_user_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: false });
    if (error) {
      // Fallback bez kind
      const { data: fb } = await admin
        .from("lead_reassign_requests")
        .select(
          "id, lead_id, requested_by, from_user_id, to_user_id, reason, created_at",
        )
        .eq("status", "pending")
        .eq("to_user_id", user.id)
        .order("created_at", { ascending: false });
      rows = (fb ?? []).map((r) => ({
        id: r.id as string,
        lead_id: r.lead_id as string,
        requested_by: r.requested_by as string,
        from_user_id: r.from_user_id as string | null,
        to_user_id: r.to_user_id as string,
        reason: r.reason as string | null,
        created_at: r.created_at as string,
        kind: "push" as const,
      }));
    } else {
      rows = (data ?? []).map((r) => ({
        id: r.id as string,
        lead_id: r.lead_id as string,
        requested_by: r.requested_by as string,
        from_user_id: r.from_user_id as string | null,
        to_user_id: r.to_user_id as string,
        reason: r.reason as string | null,
        created_at: r.created_at as string,
        kind: (r.kind as "push" | "pull") ?? "push",
      }));
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));
  const userIds = Array.from(
    new Set(
      [
        ...rows.map((r) => r.requested_by),
        ...rows.map((r) => r.from_user_id).filter(Boolean),
        ...rows.map((r) => r.to_user_id),
      ].filter((x): x is string => !!x && x !== user.id),
    ),
  );

  const [{ data: leads }, { data: users }] = await Promise.all([
    admin.from("leads").select("id, name, phone").in("id", leadIds),
    userIds.length > 0
      ? admin.from("users").select("id, name, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
  ]);

  const leadMap = new Map(
    (leads ?? []).map((l) => [
      l.id as string,
      {
        name: (l.name as string) ?? "Bez mena",
        phone: (l.phone as string | null) ?? null,
      },
    ]),
  );
  const userMap = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      (u.name as string) || (u.email as string) || "user",
    ]),
  );
  const nameOf = (id: string | null) =>
    !id ? "—" : id === user.id ? "TY" : (userMap.get(id) ?? "obchodník");

  return NextResponse.json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      lead_id: r.lead_id,
      lead_name: leadMap.get(r.lead_id)?.name ?? "Neznámy lead",
      lead_phone: leadMap.get(r.lead_id)?.phone ?? null,
      kind: r.kind,
      requested_by_name: nameOf(r.requested_by),
      from_user_name: nameOf(r.from_user_id),
      to_user_name: nameOf(r.to_user_id),
      reason: r.reason,
      created_at: r.created_at,
    })),
  });
}
