export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/realization/upload
 *
 * multipart/form-data:
 *   lead_id: string
 *   file: File (image or video, max 50 MB)
 *
 * Uploaduje do Supabase Storage bucket 'realization-media' pod path:
 *   {lead_id}/{timestamp}-{safeName}
 *
 * Zaznamená do public.realization_media.
 *
 * Access: realizator/obchod/admin s owning check na lead.
 */
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!["admin", "obchod", "realizacie"].includes(user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const leadId = formData.get("lead_id");
  const file = formData.get("file");

  if (typeof leadId !== "string" || !leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const mimeType = file.type;
  const fileType = mimeType.startsWith("video/") ? "video" : "image";
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Owning check — user je realizator alebo obchod-owner alebo admin
  const { data: lead } = await admin
    .from("leads")
    .select("assigned_to, realization_by")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }
  const canUpload =
    user.role === "admin" ||
    lead.assigned_to === user.id ||
    lead.realization_by === user.id;
  if (!canUpload) {
    return NextResponse.json({ ok: false, error: "forbidden_not_your_lead" }, { status: 403 });
  }

  // Sanitize filename + unique path
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100);
  const timestamp = Date.now();
  const storagePath = `${leadId}/${timestamp}-${safeName}`;

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from("realization-media")
    .upload(storagePath, arrayBuffer, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[realization/upload] storage error:", uploadErr);
    return NextResponse.json(
      { ok: false, error: "storage_error", detail: uploadErr.message },
      { status: 500 },
    );
  }

  // Insert do realization_media
  const { data: inserted, error: dbErr } = await admin
    .from("realization_media")
    .insert({
      lead_id: leadId,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_type: fileType,
      original_filename: file.name,
      mime_type: mimeType,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (dbErr) {
    // Rollback storage
    await admin.storage.from("realization-media").remove([storagePath]).catch(() => {});
    console.error("[realization/upload] DB error:", dbErr);
    return NextResponse.json(
      { ok: false, error: "db_error", detail: dbErr.message },
      { status: 500 },
    );
  }

  // Log activity (best-effort)
  admin
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      user_id: user.id,
      type: "media_uploaded",
      data: {
        media_id: inserted.id,
        filename: file.name,
        file_type: fileType,
        size_bytes: file.size,
      },
    })
    .then(() => {});

  return NextResponse.json({
    ok: true,
    media_id: inserted.id,
    storage_path: storagePath,
  });
}
