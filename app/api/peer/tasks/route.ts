export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/peer/tasks?peer_id=<uuid>
 *
 * Vráti { role_scope, their_tasks, my_tasks } pre PeerTransferPanel
 * na `/profil/[userId]`. Iba ak PEER má rovnakú rolu ako aktuálny user
 * (obchod/obhliadky/realizacie) — inak vráti prázdne listy.
 *
 * their_tasks = úlohy priradené peerovi (leady/obhliadky/realizácie)
 * my_tasks    = úlohy priradené mne
 *
 * Aktívne statusy per rola:
 *   obchod    → new/kontakt/nezdvíhali/scheduled/interested/CP-sent
 *   obhliadky → needs_inspection (obhliadka priradená, nevykonaná)
 *   realizacie→ in_realization
 */
export async function GET(request: NextRequest) {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const peerId = url.searchParams.get("peer_id");
  if (!peerId || peerId === me.id) {
    return NextResponse.json(
      { ok: false, error: "invalid_peer" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: peer } = await admin
    .from("users")
    .select("id, role, active")
    .eq("id", peerId)
    .maybeSingle();
  if (!peer) {
    return NextResponse.json(
      { ok: false, error: "peer_not_found" },
      { status: 404 },
    );
  }
  // Rola sa musí zhodovať (obchod-obchod, obhliadky-obhliadky, realizacie-realizacie).
  // Admin nemá „vlastné" úlohy — vráti prázdny panel.
  const commonRole =
    me.role === peer.role &&
    ["obchod", "obhliadky", "realizacie"].includes(me.role)
      ? (me.role as "obchod" | "obhliadky" | "realizacie")
      : null;
  if (!commonRole) {
    return NextResponse.json({
      ok: true,
      data: { role_scope: "obchod", their_tasks: [], my_tasks: [] },
    });
  }

  const col =
    commonRole === "obhliadky"
      ? "inspection_by"
      : commonRole === "realizacie"
        ? "realization_by"
        : "assigned_to";
  const activeStatuses =
    commonRole === "obhliadky"
      ? ["needs_inspection", "scheduled"]
      : commonRole === "realizacie"
        ? ["in_realization"]
        : [
            "new",
            "phone_revealed",
            "no_answer",
            "scheduled",
            "interested",
            "quote_sent",
            "inspected",
          ];

  async function fetchFor(userId: string) {
    const { data } = await admin
      .from("leads")
      .select("id, name, status, data, last_activity_at, created_at")
      .eq(col, userId)
      .in("status", activeStatuses)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(30);
    return (data ?? []).map((l) => {
      const d = (l.data as Record<string, unknown> | null) ?? {};
      return {
        id: l.id as string,
        name: (l.name as string) ?? "",
        status: l.status as string,
        lokalita: (d.lokalita as string | undefined) ?? null,
        plocha: (d.plocha as string | undefined) ?? null,
        updated_at:
          (l.last_activity_at as string) ??
          (l.created_at as string) ??
          "",
      };
    });
  }

  const [their_tasks, my_tasks] = await Promise.all([
    fetchFor(peerId),
    fetchFor(me.id),
  ]);

  return NextResponse.json({
    ok: true,
    data: { role_scope: commonRole, their_tasks, my_tasks },
  });
}
