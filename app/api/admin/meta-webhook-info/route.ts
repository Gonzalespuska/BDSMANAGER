export const runtime = "edge";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";

/**
 * GET /api/admin/meta-webhook-info
 *
 * Vráti info pre Meta App Dashboard → Webhooks setup:
 *   • callback URL (endpoint kde nám Meta push-ne lead notification)
 *   • verify token (musí sedieť s META_WEBHOOK_VERIFY_TOKEN v env)
 *
 * Admin ich potrebuje paste do Meta Dashboard → App → Webhooks →
 * Page → Add Callback URL.
 */
export async function GET(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  const url = new URL(request.url);
  // Prod = https://app.najcrm.sk; preview URL detekujeme z requestu.
  const origin = url.origin;

  return NextResponse.json({
    ok: true,
    callback_url: `${origin}/api/webhook/meta-leads`,
    verify_token: verifyToken,
    verify_token_set: !!verifyToken,
  });
}
