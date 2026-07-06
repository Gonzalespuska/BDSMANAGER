export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import { consume, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/user/avatar
 *
 * multipart/form-data:
 *   file: File (image, max 5 MB)
 *
 * Uploaduje profilovú fotku:
 *   1) Uloží do bucketu "avatars" pod path {user_id}/{timestamp}.<ext>
 *   2) Získa public URL
 *   3) Aktualizuje users.avatar_url
 *
 * DELETE — vymaže avatar_url z DB (foto v storage zostane pre archív).
 */
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 uploadov / 10 min na usera (chráni storage kvótu + bandwidth).
  const ip = getClientIp(request);
  const rl = consume(`avatar-upload:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { ok: false, error: "file_too_large_5mb" },
      { status: 413 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, error: "invalid_type_must_be_image" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Extension z mime type
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const timestamp = Date.now();
  const storagePath = `${user.id}/${timestamp}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from("avatars")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    // Ak bucket neexistuje (SQL 20 nebola spustená)
    if (/bucket .*avatars.* (not found|does not exist)/i.test(uploadErr.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bucket_missing",
          hint: "Spusti supabase/20_user_avatars.sql v SQL Editore",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "storage_error", detail: uploadErr.message },
      { status: 500 },
    );
  }

  const { data: publicData } = admin.storage
    .from("avatars")
    .getPublicUrl(storagePath);
  const publicUrl = publicData.publicUrl;

  const { error: updErr } = await admin
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updErr) {
    // Fallback: možno stĺpec neexistuje
    if (/column .*avatar_url.* does not exist/i.test(updErr.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "column_missing",
          hint: "Spusti supabase/20_user_avatars.sql v SQL Editore",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "db_error", detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, avatar_url: publicUrl });
}

export async function DELETE() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
