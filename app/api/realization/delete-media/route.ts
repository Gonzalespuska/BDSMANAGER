export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/realization/delete-media
 * body: { media_id }
 * Zmaže záznam z realization_media + storage object.
 * Access: uploader alebo admin.
 */
export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { media_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body.media_id) {
    return NextResponse.json({ ok: false, error: "missing_media_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("realization_media")
    .select("id, storage_path, uploaded_by, lead_id")
    .eq("id", body.media_id)
    .maybeSingle();

  if (!media) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (media.uploaded_by !== user.id && user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  await admin.storage
    .from("realization-media")
    .remove([media.storage_path])
    .catch((e) => console.warn("[delete-media] storage remove failed:", e));

  const { error: delErr } = await admin
    .from("realization_media")
    .delete()
    .eq("id", body.media_id);
  if (delErr) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
