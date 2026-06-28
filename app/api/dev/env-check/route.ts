export const runtime = "edge";
import { NextResponse } from "next/server";

/**
 * GET /api/dev/env-check — debug helper.
 * V produkcii 403, žiadny info leak.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Disabled in production" },
      { status: 403 },
    );
  }
  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    isDev: true,
  });
}
