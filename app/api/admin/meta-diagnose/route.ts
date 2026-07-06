export const runtime = "edge";

import { NextResponse } from "next/server";
import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";

/**
 * GET /api/admin/meta-diagnose
 *
 * Diagnostika META_PAGE_ACCESS_TOKEN — vráti JSON s permissions, Pages,
 * Lead Forms. Použité pre voľbu integračnej cesty (webhook / cron pull).
 *
 * Auth: admin (cookie) ALEBO header x-dev-access-token = DEV_ACCESS_TOKEN.
 */
export async function GET(request: Request) {
  const providedToken = request.headers.get("x-dev-access-token")?.trim();
  const requiredToken = process.env.DEV_ACCESS_TOKEN?.trim();
  const tokenBypass = !!(
    providedToken &&
    requiredToken &&
    providedToken === requiredToken
  );

  if (!tokenBypass) {
    const me = await getCurrentAppUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const realRole = await getRealUserRole();
    if (realRole !== "admin") {
      return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
    }
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const result: Record<string, unknown> = {
    ok: true,
    env: {
      META_PAGE_ACCESS_TOKEN: !!token,
      META_WEBHOOK_VERIFY_TOKEN: !!verifyToken,
    },
  };

  if (!token) {
    result.error = "META_PAGE_ACCESS_TOKEN not set";
    return NextResponse.json(result);
  }

  try {
    // 1) /me — pre Page token vráti id + name Page-u
    const meRes = await fetch(
      `https://graph.facebook.com/v22.0/me?fields=id,name,fan_count,category&access_token=${encodeURIComponent(token)}`,
    );
    result.me = await meRes.json();

    // 2) debug_token
    const debugRes = await fetch(
      `https://graph.facebook.com/v22.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
    );
    result.debug_token = await debugRes.json();

    const meObj = result.me as { id?: string; name?: string; error?: unknown };
    if (meObj.id) {
      // 3) List lead forms (potrebuje pages_manage_ads — pravdepodobne chýba)
      try {
        const fr = await fetch(
          `https://graph.facebook.com/v22.0/${meObj.id}/leadgen_forms?fields=id,name,status,leads_count,created_time&limit=50&access_token=${encodeURIComponent(token)}`,
        );
        result.lead_forms = await fr.json();
      } catch (e) {
        result.lead_forms = { error: (e as Error).message };
      }

      // 4) Subscribed apps — najdôležitejšie! Vidíme či je náš app (Epoxidovo)
      //    subscribed na 'leadgen' event pre túto Page.
      try {
        const sr = await fetch(
          `https://graph.facebook.com/v22.0/${meObj.id}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
        );
        result.subscribed_apps = await sr.json();
      } catch (e) {
        result.subscribed_apps = { error: (e as Error).message };
      }
    }
  } catch (e) {
    result.error = (e as Error).message;
  }

  return NextResponse.json(result);
}
