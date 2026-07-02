export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/realization/media-urls
 * body: { lead_id, paths: string[] }
 * Vráti signed URLs pre všetky paths (1h expiry).
 *
 * Auth: owning check na lead — iba realizator / obchodník / admin.
 */
export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { lead_id?: string; paths?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.lead_id || !Array.isArray(body.paths)) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Owning check
  const { data: lead } = await admin
    .from("leads")
    .select("assigned_to, realization_by")
    .eq("id", body.lead_id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }
  const canAccess =
    user.role === "admin" ||
    lead.assigned_to === user.id ||
    lead.realization_by === user.id;
  if (!canAccess) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Path safety — musia začínať s lead_id/
  const safePaths = body.paths.filter((p) => p.startsWith(`${body.lead_id}/`));

  const urls: Record<string, string> = {};
  for (const path of safePaths) {
    const { data } = await admin.storage
      .from("realization-media")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) urls[path] = data.signedUrl;
  }

  return NextResponse.json({ ok: true, urls });
}
