import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

/**
 * GET /api/health
 *
 * Public endpoint — vracia iba minimálne "healthy/unhealthy" bez auth.
 * Detailná diagnostika je viditeľná IBA prihlásenému adminovi (info leak
 * prevention — attacker nemá dozvedieť sa Supabase URL, latency, environ.).
 */
export async function GET() {
  // ─── Public: iba binary healthy/unhealthy ─────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !publishable || !secret) {
    return NextResponse.json({ ok: false, status: "unhealthy" }, { status: 503 });
  }

  // ─── Admin: full diagnostics ──────────────────────────────────────
  let user = null;
  try {
    user = await getCurrentAppUser();
  } catch {
    /* ignore */
  }

  if (user?.role === "admin") {
    const checks: Record<string, unknown> = {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "✓ set",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "✓ set",
        SUPABASE_SECRET_KEY: "✓ set",
      },
    };
    try {
      const supabase = await createClient();
      const start = Date.now();
      const { data, error } = await supabase.auth.getUser();
      const latencyMs = Date.now() - start;
      checks.supabase = {
        auth_endpoint: error ? `✗ ${error.message}` : "✓ reachable",
        latency_ms: latencyMs,
        authenticated_user: data?.user?.email ?? null,
      };
    } catch (e) {
      checks.supabase = {
        auth_endpoint: `✗ ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
    return NextResponse.json({
      ok: true,
      status: "healthy",
      checks,
      timestamp: new Date().toISOString(),
    });
  }

  // Non-admin (alebo neprihlásený) — iba binary status
  return NextResponse.json({
    ok: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
