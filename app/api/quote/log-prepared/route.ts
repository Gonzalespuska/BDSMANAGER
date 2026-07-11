export const runtime = "edge";

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/quote/log-prepared
 *
 * Best-effort audit logger pre Gmail compose flow.
 * Volá sa v moment keď obchodník klikne "Pošli email s ponukou":
 *   - PDF sa stiahol do Downloads
 *   - Otvoril sa Gmail compose v novom tabe s prefilled email
 *
 * Z hľadiska CRM zaradíme ten lead ako "ponuka pripravená/odoslaná" — v praxi
 * sa obchodník stále musí vrátiť do Gmail a kliknúť Send, ale workflow ho
 * tu už nestrhne späť. Lead presunieme do `quote_sent` aby sa objavil v
 * "Otvorené" (CP) tabe.
 *
 * Body:
 *   { lead_id: string, to_email: string, subject: string }
 *
 * Response: { ok: true } alebo { ok: false, error }
 */
export async function POST(request: NextRequest) {
  // AUTH: iba prihlásený obchodník/admin
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: { lead_id?: string; to_email?: string; subject?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body.lead_id || body.lead_id.startsWith("demo-")) {
    // demo / žiadne ID — nelogujeme, ale OK
    return NextResponse.json({ ok: true, mode: "skipped" });
  }

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // OWNERSHIP: lead patrí mne alebo som admin
    const { data: ownerCheck } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", body.lead_id)
      .maybeSingle();
    if (!ownerCheck) {
      return NextResponse.json(
        { ok: false, error: "lead_not_found" },
        { status: 404 },
      );
    }
    if (ownerCheck.assigned_to !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden_not_your_lead" },
        { status: 403 },
      );
    }

    await admin.from("lead_activities").insert({
      lead_id: body.lead_id,
      user_id: user.id,
      type: "email_sent",
      data: {
        to: body.to_email,
        subject: body.subject,
        kind: "quote",
        via: "gmail_compose",
      },
    });

    const { data: leadRow } = await admin
      .from("leads")
      .select("status")
      .eq("id", body.lead_id)
      .maybeSingle();

    if (leadRow && !["won", "lost", "archived"].includes(leadRow.status)) {
      await admin
        .from("leads")
        .update({ status: "quote_sent", last_activity_at: nowIso })
        .eq("id", body.lead_id);
    }

    // Revaliduj — badge "Obhliadnuté" v nav-e zhasne (lead už nie je 'inspected')
    try {
      revalidatePath("/obhliadnute");
      revalidatePath("/notifikacie");
      revalidatePath("/calendar");
      revalidatePath("/agent");
    } catch {
      /* edge cache — ignore */
    }

    return NextResponse.json({ ok: true, mode: "logged" });
  } catch (e) {
    console.warn("[quote/log-prepared] failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "exception",
        message: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
