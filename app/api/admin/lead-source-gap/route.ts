import { NextResponse } from "next/server";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /api/admin/lead-source-gap — realtime tracking najnovšieho leadu
 * per zdroj (Web / Meta).
 *
 * Používa /admin/prehlad na sledovanie výpadku:
 *   • Ak z Meta neprišiel lead > LEAD_GAP_MINUTES → alarm=true
 *   • Ak z Webu neprišiel lead > LEAD_GAP_MINUTES → alarm=true
 *
 * Response:
 *   {
 *     web:  { lastAt: ISO | null, minutesSince: number | null, alarm: boolean },
 *     meta: { lastAt: ISO | null, minutesSince: number | null, alarm: boolean },
 *     threshold: 30
 *   }
 *
 * Prah je klientský (zdielaný cez constants), ale posiela sa v response
 * pre transparentnosť + prípadné admin overrides do budúcna.
 */

const LEAD_GAP_MINUTES = 30;
const META_SOURCES = ["facebook", "instagram", "meta_form", "fb_lead_ads"] as const;
const WEB_SOURCES = ["web_webhook", "website", "web"] as const;

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const realRole = await getRealUserRole();
  if (realRole !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createAdminClient();

  const [metaRes, webRes] = await Promise.all([
    sb
      .from("leads")
      .select("created_at, source_type")
      .in("source_type", META_SOURCES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(1),
    sb
      .from("leads")
      .select("created_at, source_type")
      .in("source_type", WEB_SOURCES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const now = Date.now();

  function statFor(rows: Array<{ created_at: string }> | null | undefined) {
    const lastAt = rows?.[0]?.created_at ?? null;
    if (!lastAt) {
      return { lastAt: null, minutesSince: null, alarm: false };
    }
    const minutesSince = Math.floor((now - new Date(lastAt).getTime()) / 60000);
    return {
      lastAt,
      minutesSince,
      alarm: minutesSince > LEAD_GAP_MINUTES,
    };
  }

  return NextResponse.json(
    {
      web: statFor(webRes.data),
      meta: statFor(metaRes.data),
      threshold: LEAD_GAP_MINUTES,
      generated_at: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
