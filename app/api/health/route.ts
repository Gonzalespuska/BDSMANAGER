import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

/**
 * GET /api/health
 *
 * Lightweight ping na overenie že:
 *   1. Env vars sú nastavené
 *   2. Supabase URL je dostupné
 *   3. Klient sa vie autentifikovať s publishable key
 *
 * Vracia 200 + diagnostiku, alebo 500 ak čokoľvek zlyhá.
 */
export async function GET() {
  const checks: Record<string, unknown> = {};

  // 1) Env vars present?
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;

  checks.env = {
    NEXT_PUBLIC_SUPABASE_URL: url ? "✓ set" : "✗ MISSING",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable ? "✓ set" : "✗ MISSING",
    SUPABASE_SECRET_KEY: secret ? "✓ set" : "✗ MISSING",
  };

  if (!url || !publishable || !secret) {
    return NextResponse.json(
      { ok: false, error: "missing_env", checks },
      { status: 500 },
    );
  }

  // 2) Supabase connection — getUser() pingne auth endpoint.
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

    // Note: getUser() vráti error "Auth session missing" keď nikto nie je prihlásený,
    // ale TO NIE JE chyba pripojenia — je to očakávaný stav (nikto nie je prihlásený).
    // Skutočný problém by bol napr. 500/timeout zo Supabase strany.
    const isOnlyAuthMissing =
      error?.message?.toLowerCase().includes("auth session missing") ?? false;

    if (error && !isOnlyAuthMissing) {
      return NextResponse.json(
        { ok: false, error: "supabase_error", checks },
        { status: 500 },
      );
    }
  } catch (e) {
    checks.supabase = {
      auth_endpoint: `✗ ${e instanceof Error ? e.message : "unknown error"}`,
    };
    return NextResponse.json(
      { ok: false, error: "exception", checks },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "🟢 BDSManager je nažive, Supabase pripojené",
    checks,
    timestamp: new Date().toISOString(),
  });
}
