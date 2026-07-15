export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/lead-flow-check
 *
 * User 2026-07-15: „tak toto sa uz nikdy nesmie stat musime opatrenia
 * nejake pridat aby sa to nestalo".
 *
 * Kontrola „live-ness" — počas business hours (8-20 SK time) skontroluje
 * či za posledných 6h prišiel aspoň 1 web/meta lead. Ak nie, vráti
 * `alert: true` s dôvodom. Cron worker to potom pushne cez ntfy.sh
 * ako alarm.
 *
 * Auth: X-Cron-Secret rovnaký ako sync-epoxidovo.
 */
const REQUIRED_HEADER = "x-cron-secret";
const ALERT_WINDOW_HOURS = 6;
const BUSINESS_START = 8;
const BUSINESS_END = 20;

export async function POST(request: NextRequest) {
  const provided = request.headers.get(REQUIRED_HEADER) ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // SK time (Europe/Bratislava, UTC+1 / +2 leto). Použijeme UTC offset
  // jednoducho — SK je +2 v lete (DST). Approximáciou pridáme +2h.
  const now = new Date();
  const skHour = (now.getUTCHours() + 2) % 24;

  const isBusinessHours = skHour >= BUSINESS_START && skHour < BUSINESS_END;
  if (!isBusinessHours) {
    return NextResponse.json({
      ok: true,
      alert: false,
      reason: "outside_business_hours",
      sk_hour: skHour,
    });
  }

  const admin = createAdminClient();
  const cutoffIso = new Date(
    Date.now() - ALERT_WINDOW_HOURS * 3600 * 1000,
  ).toISOString();

  const [{ count: webCount }, { count: metaCount }] = await Promise.all([
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("source_type", ["web_webhook", "web", "website"])
      .gte("created_at", cutoffIso),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("source_type", ["facebook", "instagram", "meta_form", "fb_lead_ads"])
      .gte("created_at", cutoffIso),
  ]);

  const web = webCount ?? 0;
  const meta = metaCount ?? 0;

  // Alarm iba ak WEB je 0. Meta môže byť nízka (kampane sa vypnuli),
  // ale web pipeline by mal počas business hours mať aspoň 1 každých 6h
  // (historický priemer je ~3-5 leadov/deň).
  const alert = web === 0;

  return NextResponse.json({
    ok: true,
    alert,
    reason: alert ? "no_web_leads_6h_business" : "healthy",
    web_leads_6h: web,
    meta_leads_6h: meta,
    sk_hour: skHour,
    window_start: cutoffIso,
  });
}
