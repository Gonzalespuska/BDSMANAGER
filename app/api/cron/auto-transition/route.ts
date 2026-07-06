export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/auto-transition
 *
 * Auth: X-Cron-Secret header musí sedieť s process.env.CRON_SECRET.
 *
 * Volaný cron worker-om raz za 5 min. Prehľadá leady kde:
 *   status IN ('quote_sent', 'needs_inspection')
 *   AND inspection_at < now()
 * a prehodí ich na status='inspected'.
 *
 * Vyžaduje SQL migráciu 17_inspected_auto_transition (funkcia
 * `auto_transition_inspected()`).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET env not set" },
      { status: 500 },
    );
  }
  const provided = request.headers.get("X-Cron-Secret");
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = createAdminClient();

  try {
    // Zavolaj SQL funkciu z migrácie 17
    const { data, error } = await sb.rpc("auto_transition_inspected");
    if (error) {
      // Ak funkcia neexistuje (migrácia nebola spustená), skús priamy update.
      if (/function .*auto_transition_inspected.* does not exist/i.test(error.message)) {
        // Fallback update — bez audit logu
        const { data: updated, error: updErr } = await sb
          .from("leads")
          .update({ status: "inspected", last_activity_at: new Date().toISOString() })
          .in("status", ["quote_sent", "needs_inspection"])
          .lt("inspection_at", new Date().toISOString())
          .select("id");
        if (updErr) {
          return NextResponse.json(
            {
              ok: false,
              error: "fallback_failed",
              detail: updErr.message,
              hint: "Spusti supabase/17_inspected_auto_transition.sql",
            },
            { status: 500 },
          );
        }
        return NextResponse.json({
          ok: true,
          mode: "fallback",
          affected: updated?.length ?? 0,
        });
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      mode: "rpc",
      affected: data ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
