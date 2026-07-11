export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/content-upload
 * multipart/form-data:
 *   file: File
 *   lead_id: string
 *   shot_id: string   (napr. "pred-wide")
 *   phase: "pred" | "pocas" | "po"
 *   kind: "photo" | "video"
 *   note?: string
 *
 * Uploadne súbor do Supabase Storage bucket `content-media` a zaznamená
 * do content_captures.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "realizacie" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_wrong_role" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const leadId = form.get("lead_id") as string | null;
  const shotId = form.get("shot_id") as string | null;
  const phase = form.get("phase") as string | null;
  const kind = form.get("kind") as string | null;
  const note = (form.get("note") as string | null) ?? null;

  if (!file || !leadId || !shotId || !phase || !kind) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!["pred", "pocas", "po"].includes(phase)) {
    return NextResponse.json({ ok: false, error: "invalid_phase" }, { status: 400 });
  }
  if (!["photo", "video"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ownership check — realizator môže uploadovať iba k vlastnej realizácii.
  const { data: lead } = await admin
    .from("leads")
    .select("realization_by")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }
  if (user.role !== "admin" && lead.realization_by !== user.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden_not_your_realization" },
      { status: 403 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? (kind === "photo" ? "jpg" : "mp4");
  const rand = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now();
  const storagePath = `${leadId}/${phase}/${shotId}-${timestamp}-${rand}.${ext}`;

  // Bucket 'content-media' musí existovať v Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("content-media")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || (kind === "photo" ? "image/jpeg" : "video/mp4"),
      upsert: false,
    });
  if (upErr) {
    console.error("[content-upload] storage error:", upErr);
    return NextResponse.json(
      {
        ok: false,
        error: `storage: ${upErr.message}`,
        hint: "Vytvor v Supabase Dashboard bucket 'content-media' (Storage → New bucket).",
      },
      { status: 500 },
    );
  }

  const { data: inserted, error: insErr } = await admin
    .from("content_captures")
    .insert({
      lead_id: leadId,
      shot_id: shotId,
      phase,
      kind,
      storage_path: storagePath,
      file_size_bytes: file.size,
      uploaded_by: user.id,
      note: note || null,
    })
    .select("id, storage_path")
    .single();
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: `db_insert: ${insErr.message}` },
      { status: 500 },
    );
  }

  // Public URL (bucket môže byť public alebo si to admin vyriešime signed URL)
  const { data: pub } = admin.storage.from("content-media").getPublicUrl(storagePath);
  return NextResponse.json({
    ok: true,
    capture_id: inserted.id,
    storage_path: inserted.storage_path,
    url: pub?.publicUrl ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { capture_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const captureId = body.capture_id;
  if (!captureId) {
    return NextResponse.json({ ok: false, error: "missing_capture_id" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: cap } = await admin
    .from("content_captures")
    .select("uploaded_by, storage_path")
    .eq("id", captureId)
    .maybeSingle();
  if (!cap) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (user.role !== "admin" && cap.uploaded_by !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  await admin.storage.from("content-media").remove([cap.storage_path as string]);
  await admin.from("content_captures").delete().eq("id", captureId);
  return NextResponse.json({ ok: true });
}
