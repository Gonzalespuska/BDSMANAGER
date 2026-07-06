export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import { LeadWebhookInputSchema } from "@/lib/schemas/lead";

const MANUAL_SOURCE_ID = "55555555-5555-5555-5555-555555555555";

/**
 * POST /api/lead/create-manual
 *
 * Manuálne vytvorenie leadu obchodákom (z "Manuálny lead" modalu).
 * Rozdielne od /api/webhook/lead/[source_id]:
 *   - Vyžaduje prihláseného agenta (kontrolujeme cez session cookies).
 *   - Lead sa AUTOMATICKY priradí tvorcovi (assigned_to = currentUser.id),
 *     takže obchodák ho hneď vidí vo svojich leadoch.
 *     Auto-assign trigger sa preskočí (NEW.assigned_to IS NOT NULL).
 *
 * Body: { name, phone?, email?, data?, source_campaign? }
 * Response: { ok: true, lead_id } alebo { ok: false, error }
 */
export async function POST(request: NextRequest) {
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = LeadWebhookInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const admin = createAdminClient();

    // KOMU PRIRADIŤ:
    //   - Normálne obchodák → sám sebe
    //   - info@epoxidovo.sk (test admin) → NIE sebe, ale nasleduje round-robin
    //     na aktívnych obchodákov, lebo info@ je iba test/preview a nesmie
    //     "kradnúť" reálne leady
    const isTestAdmin =
      user.role === "admin" && user.email.toLowerCase() === "info@epoxidovo.sk";
    let assignTo: string = user.id;
    if (isTestAdmin) {
      const { data: activeAgents } = await admin
        .from("users")
        .select("id")
        .eq("role", "obchod")
        .eq("active", true)
        .gt("capacity", 0)
        .order("created_at", { ascending: true });
      if (activeAgents && activeAgents.length > 0) {
        // Vyber toho ktorý má najmenej otvorených leadov (least-loaded)
        const ids = activeAgents.map((a) => a.id as string);
        const { data: counts } = await admin
          .from("leads")
          .select("assigned_to")
          .in("assigned_to", ids)
          .not("status", "in", "(won,lost,archived)");
        const perAgent = new Map<string, number>();
        for (const id of ids) perAgent.set(id, 0);
        for (const l of counts ?? []) {
          const a = l.assigned_to as string;
          perAgent.set(a, (perAgent.get(a) ?? 0) + 1);
        }
        const sorted = Array.from(perAgent.entries()).sort(
          (a, b) => a[1] - b[1],
        );
        assignTo = sorted[0][0];
      }
    }

    const { data: lead, error } = await admin
      .from("leads")
      .insert({
        source_id: MANUAL_SOURCE_ID,
        source_type: "manual",
        source_campaign:
          input.source_campaign ??
          "Manuálne pridaný (telefonát / výstava / odporúčanie)",
        name: input.name.trim(),
        phone: input.phone || null,
        email: input.email?.toLowerCase() || null,
        data: input.data ?? {},
        priority: input.priority ?? "medium",
        value_estimate: input.value_estimate ?? null,
        status: "new",
        assigned_to: assignTo,
      })
      .select("id, name")
      .single();

    if (error || !lead) {
      console.error("[create-manual] insert failed:", error);
      return NextResponse.json(
        { ok: false, error: error?.message ?? "insert_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: true, lead_id: lead.id, name: lead.name },
      { status: 201 },
    );
  } catch (e) {
    console.error("[create-manual] exception:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
