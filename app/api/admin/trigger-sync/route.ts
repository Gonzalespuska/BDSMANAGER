export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/admin/trigger-sync — admin manuálne triggerne cron sync.
 *
 * Iba pre admin rolu. Volá /api/cron/sync-epoxidovo interne s CRON_SECRET
 * z env aby admin nemusel poznať secret hodnotu.
 */
export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const baseUrl = new URL(request.url).origin;
  const cronRes = await fetch(`${baseUrl}/api/cron/sync-epoxidovo`, {
    method: "POST",
    headers: {
      "X-Cron-Secret": cronSecret,
    },
  });

  const body = await cronRes.json();
  return NextResponse.json(body, { status: cronRes.status });
}
