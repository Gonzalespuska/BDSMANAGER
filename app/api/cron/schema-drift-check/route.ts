export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/cron/schema-drift-check
 *
 * User 2026-07-15: „urob to najlepsie ako sa da s tym ze uz nikdy tento
 * problem nebude". Detekcia schema-drift medzi epoxidovo.sk Neon DB a
 * očakávanými stĺpcami v sync-epoxidovo/route.ts.
 *
 * Ak niektorý z EXPECTED_COLUMNS chýba → vráti { alert: true } s listom
 * chýbajúcich. Cron worker to potom pushne cez ntfy.sh.
 *
 * Nezastaví sync — tolerant SELECT * to zvládne. Ale user vie IHNEĎ že
 * niekto zase menil schemu bez notice.
 */
const EXPECTED_COLUMNS = new Set([
  "id",
  "createdAt",
  "name",
  "email",
  "phone",
  "source",
  "spaceType",
  "service",
  "area",
  "message",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "referrer",
  "status",
]);

const REQUIRED_HEADER = "x-cron-secret";

export async function POST(request: NextRequest) {
  const provided = request.headers.get(REQUIRED_HEADER) ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const dbUrl = process.env.EPX_DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({
      ok: true,
      alert: false,
      reason: "no_epx_database_url",
    });
  }

  try {
    const sql = neon(dbUrl);
    const cols = (await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Lead' AND table_schema = 'public'
    `) as Array<{ column_name: string }>;
    const liveSet = new Set(cols.map((c) => c.column_name));
    const missing = Array.from(EXPECTED_COLUMNS).filter(
      (c) => !liveSet.has(c),
    );
    const extra = Array.from(liveSet).filter(
      (c) => !EXPECTED_COLUMNS.has(c) && !c.startsWith("_"),
    );

    return NextResponse.json({
      ok: true,
      alert: missing.length > 0,
      missing,
      extra,
      total_live: liveSet.size,
      total_expected: EXPECTED_COLUMNS.size,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "check_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
