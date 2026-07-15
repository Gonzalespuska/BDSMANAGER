export const runtime = "edge";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/sync-health
 *
 * Vráti health status pre admin dashboard widget:
 *   • last_web_lead_at — kedy prišiel posledný web lead (ISO)
 *   • web_leads_24h — koľko za 24h
 *   • last_meta_lead_at, meta_leads_24h
 *   • last_sync_status — 200/500/... (best effort — z cron worker fetch)
 *
 * Admin uvidí na jeden pohľad či pipeline zdravá.
 */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const iso24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const iso6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();

  const [
    { data: lastWeb },
    { count: web24h },
    { count: web6h },
    { data: lastMeta },
    { count: meta24h },
  ] = await Promise.all([
    admin
      .from("leads")
      .select("id, name, created_at")
      .in("source_type", ["web_webhook", "web", "website"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("source_type", ["web_webhook", "web", "website"])
      .gte("created_at", iso24h),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("source_type", ["web_webhook", "web", "website"])
      .gte("created_at", iso6h),
    admin
      .from("leads")
      .select("id, name, created_at")
      .in("source_type", ["facebook", "instagram", "meta_form", "fb_lead_ads"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("source_type", ["facebook", "instagram", "meta_form", "fb_lead_ads"])
      .gte("created_at", iso24h),
  ]);

  const nowMs = Date.now();
  const lastWebMs = lastWeb ? new Date(lastWeb.created_at as string).getTime() : 0;
  const webAgeHours = lastWeb ? (nowMs - lastWebMs) / 3600_000 : Infinity;

  // Heuristika stavu:
  //   healthy    → 6h alebo lead za posledných 6h
  //   warning    → 6-24h bez leadu
  //   critical   → 24h+ bez leadu
  const status =
    webAgeHours < 6
      ? "healthy"
      : webAgeHours < 24
        ? "warning"
        : "critical";

  return NextResponse.json({
    ok: true,
    status,
    last_web_lead: lastWeb
      ? {
          name: lastWeb.name as string,
          at: lastWeb.created_at as string,
          hours_ago: Math.round(webAgeHours * 10) / 10,
        }
      : null,
    web_leads_6h: web6h ?? 0,
    web_leads_24h: web24h ?? 0,
    last_meta_lead: lastMeta
      ? {
          name: lastMeta.name as string,
          at: lastMeta.created_at as string,
        }
      : null,
    meta_leads_24h: meta24h ?? 0,
  });
}
