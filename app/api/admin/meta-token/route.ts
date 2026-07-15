export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/meta-token — admin uloží META_PAGE_ACCESS_TOKEN + META_PAGE_IDS
 * do secure_config tabuľky. sync-meta-leads to potom číta priamo z DB (bez
 * potreby wrangler pages secret put + redeploy).
 *
 * GET  /api/admin/meta-token — vráti maskované hodnoty (pre form UI).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  let body: { token?: string; page_ids?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const pageIds = (body.page_ids ?? "").trim();
  if (!token || !pageIds) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const upserts = [
    {
      key: "META_PAGE_ACCESS_TOKEN",
      value: token,
      updated_at: nowIso,
      updated_by: user.id,
      description: "Meta System User Access Token (never expires)",
    },
    {
      key: "META_PAGE_IDS",
      value: pageIds,
      updated_at: nowIso,
      updated_by: user.id,
      description: "Comma-separated Meta Page IDs",
    },
  ];

  const { error } = await admin
    .from("secure_config")
    .upsert(upserts, { onConflict: "key" });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, saved_at: nowIso });
}

/** Maskovaný GET pre pre-fill form-u. */
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("secure_config")
    .select("key, value, updated_at")
    .in("key", ["META_PAGE_ACCESS_TOKEN", "META_PAGE_IDS"]);
  const map = new Map(
    (data ?? []).map((r) => [r.key as string, r]),
  );
  const tokenRow = map.get("META_PAGE_ACCESS_TOKEN");
  const idsRow = map.get("META_PAGE_IDS");
  return NextResponse.json({
    ok: true,
    token_set: !!tokenRow,
    token_preview: tokenRow
      ? `${(tokenRow.value as string).slice(0, 8)}...${(tokenRow.value as string).slice(-4)}`
      : null,
    token_updated_at: tokenRow?.updated_at ?? null,
    page_ids: idsRow?.value ?? "",
    page_ids_updated_at: idsRow?.updated_at ?? null,
  });
}
