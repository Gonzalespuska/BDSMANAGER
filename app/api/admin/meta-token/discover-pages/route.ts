export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/admin/meta-token/discover-pages
 *
 * Admin paste token → my zavoláme Graph API /me/accounts a vrátime
 * zoznam Pages ktoré token vidí. Frontend to auto-fillne do
 * META_PAGE_IDS poľa.
 *
 * User 2026-07-15: „co je ten 2. raidok" — netreba to ručne, auto-fill.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  // Skús /me/accounts (User Access Token flow)
  try {
    const r = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?access_token=${encodeURIComponent(token)}&fields=id,name,category`,
    );
    const j = (await r.json()) as {
      data?: Array<{ id: string; name: string; category?: string }>;
      error?: { message?: string; type?: string; code?: number };
    };
    if (j.data && j.data.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "me_accounts",
        pages: j.data.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category ?? null,
        })),
      });
    }
    // Ak /me/accounts nevrátil nič alebo error → fallback: skús /me?fields=id,name
    // ktorý pri Page Access Token vráti priamo tú Page ktorú token reprezentuje.
    const meRes = await fetch(
      `https://graph.facebook.com/v22.0/me?fields=id,name,category&access_token=${encodeURIComponent(token)}`,
    );
    const meJ = (await meRes.json()) as {
      id?: string;
      name?: string;
      category?: string;
      error?: { message?: string };
    };
    if (meJ.id) {
      return NextResponse.json({
        ok: true,
        source: "me",
        pages: [{ id: meJ.id, name: meJ.name ?? meJ.id, category: meJ.category ?? null }],
      });
    }
    return NextResponse.json({
      ok: false,
      error:
        j.error?.message ??
        meJ.error?.message ??
        "no_pages_found",
      hint:
        "Token nevrátil žiadne Pages. Skontroluj v Meta Business Manager že System User má priradenú Epoxidovo.sk Page (Assigned Assets → Facebook Pages → Full access).",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "network_error",
      },
      { status: 500 },
    );
  }
}
