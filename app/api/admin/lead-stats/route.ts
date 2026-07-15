export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/lead-stats?window=1d|7d|30d|all
 *
 * Vráti počty leadov pre lead-stats-panel na admin dashboarde:
 *   { total, meta, web, google, other }
 *
 * User 2026-07-15: „nech sa to tu da menit ze 1d 7d 30d atd".
 */
const META_TYPES = ["facebook", "instagram", "meta_form", "fb_lead_ads"];
const WEB_TYPES = ["web_webhook", "website", "web"];

export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const w = (url.searchParams.get("window") ?? "30d").toLowerCase();
  const days =
    w === "1d" ? 1 : w === "7d" ? 7 : w === "30d" ? 30 : null; // null = all-time

  const admin = createAdminClient();
  const cutoff =
    days !== null ? new Date(Date.now() - days * 86400_000).toISOString() : null;

  function q() {
    let query = admin
      .from("leads")
      .select("id", { count: "exact", head: true });
    if (cutoff) query = query.gte("created_at", cutoff);
    return query;
  }

  const [
    { count: total },
    { count: meta },
    { count: web },
    { count: google },
  ] = await Promise.all([
    q(),
    q().in("source_type", META_TYPES),
    q().in("source_type", WEB_TYPES),
    q().eq("source_type", "google"),
  ]);

  const t = total ?? 0;
  const m = meta ?? 0;
  const wc = web ?? 0;
  const g = google ?? 0;
  const other = Math.max(0, t - m - wc - g);

  return NextResponse.json({
    ok: true,
    window: w,
    total: t,
    meta: m,
    web: wc,
    google: g,
    other,
  });
}
