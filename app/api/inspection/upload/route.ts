export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/inspection/upload
 *
 * multipart/form-data:
 *   lead_id: string
 *   file: File (image or video, max 25 MB)
 *   caption: string (optional, popiska pre danú foto)
 *
 * Storage: 'inspection-media' bucket, path {lead_id}/{timestamp}-{safeName}
 * DB: insert do public.inspection_media
 *
 * Access: iba priradený obhliadkár + admin.
 */
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "obhliadky" && user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const leadId = formData.get("lead_id");
  const file = formData.get("file");
  const caption = formData.get("caption");
  const checklistKey = formData.get("checklist_key");

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

  // Owning check — priradený obhliadkár alebo admin
  const { data: lead } = await admin
    .from("leads")
    .select("inspection_by")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }
  if (lead.inspection_by !== user.id && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_not_your_inspection" },
      { status: 403 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const timestamp = Date.now();
  const storagePath = `${leadId}/${timestamp}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from("inspection-media")
    .upload(storagePath, arrayBuffer, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[inspection/upload] storage error:", uploadErr);
    return NextResponse.json(
      { ok: false, error: "storage_error", detail: uploadErr.message },
      { status: 500 },
    );
  }

  const { data: inserted, error: dbErr } = await admin
    .from("inspection_media")
    .insert({
      lead_id: leadId,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_type: fileType,
      caption:
        typeof caption === "string" ? caption.trim().slice(0, 500) || null : null,
      original_filename: file.name,
      mime_type: mimeType,
      size_bytes: file.size,
      checklist_key:
        typeof checklistKey === "string" && checklistKey.trim()
          ? checklistKey.trim().slice(0, 40)
          : null,
    })
    .select("id, caption, created_at")
    .single();

  if (dbErr) {
    await admin.storage.from("inspection-media").remove([storagePath]).catch(() => {});
    console.error("[inspection/upload] DB error:", dbErr);
    return NextResponse.json(
      { ok: false, error: "db_error", detail: dbErr.message },
      { status: 500 },
    );
  }

  // Audit log — best effort
  admin
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      user_id: user.id,
      type: "media_uploaded",
      data: {
        media_id: inserted.id,
        kind: "inspection",
        filename: file.name,
        file_type: fileType,
        caption: inserted.caption,
      },
    })
    .then(() => {});

  // Bucket 'inspection-media' je PRIVATE (viď supabase/15_inspection_media.sql
  // — public: false). getPublicUrl vráti URL ale request na ňu vracia 400.
  // Musíme podpísať URL (7 dní = 604800 s).
  const { data: signed, error: signErr } = await admin.storage
    .from("inspection-media")
    .createSignedUrl(storagePath, 604800);
  if (signErr) {
    console.error("[inspection/upload] sign URL error:", signErr);
    // Nie fatal — DB záznam už existuje, klient si môže signed URL vyžiadať
    // neskôr cez /api/inspection/media-urls (ak existuje).
  }

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    media_id: inserted.id,
    url: signed?.signedUrl ?? null,
    storage_path: storagePath,
    caption: inserted.caption,
  });
}
