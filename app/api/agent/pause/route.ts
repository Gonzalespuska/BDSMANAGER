export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/agent/pause
 *
 * Self-pauznutie / obnovenie príjmu leadov.
 * Body: { paused: boolean }
 * Response: { ok: true, capacity: number } alebo { ok: false, error }
 */
export async function POST(request: NextRequest) {
  let body: { paused?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.id === "dev-user") {
    return NextResponse.json(
      { ok: false, error: "dev fallback user" },
      { status: 400 },
    );
  }

  const paused = body.paused === true;
  const nextCapacity = paused ? 0 : 5;

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update({ capacity: nextCapacity })
      .eq("id", user.id);

    if (error) {
      console.error("[agent/pause] update failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_error" },
        { status: 500 },
      );
    }

    // ─── Ak pauzujeme, presuň netknuté leady k aktívnym obchodákom ─────
    // Netknuté = phone_revealed_at IS NULL (obchodák ešte nezavolal),
    // status = 'new' (nedostal sa k nemu do inej fázy).
    let redistributed = 0;
    let redistributedTo: Array<{ name: string; count: number }> = [];
    if (paused) {
      const { data: untouched } = await admin
        .from("leads")
        .select("id")
        .eq("assigned_to", user.id)
        .is("phone_revealed_at", null)
        .eq("status", "new");
      const untouchedIds = (untouched ?? []).map((l) => l.id as string);

      if (untouchedIds.length > 0) {
        // Nájdi aktívnych obchodákov (obchod role, capacity > 0, active=true, NIE ja)
        const { data: activeAgents } = await admin
          .from("users")
          .select("id, name, email")
          .eq("role", "obchod")
          .eq("active", true)
          .gt("capacity", 0)
          .neq("id", user.id);

        if (activeAgents && activeAgents.length > 0) {
          // Round-robin distribúcia
          const perAgent = new Map<string, string[]>();
          for (const a of activeAgents) perAgent.set(a.id, []);
          untouchedIds.forEach((leadId, i) => {
            const agent = activeAgents[i % activeAgents.length];
            perAgent.get(agent.id)!.push(leadId);
          });

          // Bulk update per agent
          for (const [agentId, leadIds] of perAgent.entries()) {
            if (leadIds.length === 0) continue;
            const { error: uErr } = await admin
              .from("leads")
              .update({ assigned_to: agentId })
              .in("id", leadIds);
            if (!uErr) {
              redistributed += leadIds.length;
              const agent = activeAgents.find((a) => a.id === agentId);
              redistributedTo.push({
                name: agent?.name || agent?.email || "?",
                count: leadIds.length,
              });
            }
          }

          // Audit log — jeden zápis o presune
          if (redistributed > 0) {
            admin
              .from("lead_activities")
              .insert(
                Array.from(perAgent.entries())
                  .filter(([, ids]) => ids.length > 0)
                  .flatMap(([agentId, ids]) =>
                    ids.map((leadId) => ({
                      lead_id: leadId,
                      user_id: user.id,
                      type: "status_changed",
                      data: {
                        reason: "auto_reassign_on_pause",
                        from_user: user.id,
                        to_user: agentId,
                      },
                    })),
                  ),
              )
              .then(() => {})
              .catch(() => {});
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      capacity: nextCapacity,
      redistributed,
      redistributed_to: redistributedTo,
    });
  } catch (e) {
    console.error("[agent/pause] exception:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
