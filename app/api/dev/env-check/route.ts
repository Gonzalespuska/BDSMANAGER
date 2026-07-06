export const runtime = "edge";
import { NextResponse } from "next/server";
import { assertDevOnly } from "@/lib/dev-guard";

/**
 * GET /api/dev/env-check — debug helper.
 * V produkcii 403, žiadny info leak.
 */
export async function GET(request: Request) {
  const blocked = assertDevOnly(request);
  if (blocked) return blocked;
  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    isDev: true,
  });
}
